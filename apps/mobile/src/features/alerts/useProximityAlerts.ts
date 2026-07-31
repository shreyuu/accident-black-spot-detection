import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { deliverAlert, ensureNotificationPermission } from '@/features/alerts/alertDelivery';
import { recordAlert } from '@/features/alerts/alertLogRepository';
import {
  DEFAULT_PROXIMITY_CONFIG,
  evaluateProximity,
  highestPriorityInside,
  type ProximityAlert,
  type ZoneStates,
} from '@/features/alerts/proximityEngine';
import { mergeZoneStates } from '@/features/alerts/zoneStatePersistence';
import { loadZoneStates, saveZoneStates } from '@/features/alerts/zoneStateStore';
import { useAuth } from '@/features/auth/AuthProvider';
import { watchPosition } from '@/features/location/locationService';
import type { BlackSpot } from '@/types/domain';
import type { Coordinates } from '@/utils/geo';
import { logger } from '@/utils/logger';

/**
 * Runs proximity checking against a live position stream.
 *
 * The decision logic lives in `proximityEngine` and is pure; this hook is only
 * the plumbing — subscribe to positions, feed the engine, deliver what it
 * decides. Keeping the split means the safety behaviour can be tested exactly,
 * without a device.
 *
 * Zone state is held in a ref rather than state. It must survive every position
 * update without causing a re-render, and re-rendering on each GPS tick would
 * both waste battery and risk the engine seeing a stale snapshot.
 *
 * It is also **hydrated from and written back to disk**, so the memory survives
 * more than a mount. Before Phase 8 it did not: force-quitting the app while
 * inside a zone lost the record of having been warned, and returning produced a
 * second identical warning. The same store is what the background task reads and
 * writes, so a warning delivered in the background silences the foreground and
 * the other way round.
 */

export interface UseProximityAlertsInput {
  /** Verified, active spots to watch. Empty disables checking. */
  spots: readonly BlackSpot[];
  /** Where to check from before the stream produces its first update. */
  initialLocation: Coordinates | null;
  enabled: boolean;
}

export interface UseProximityAlertsResult {
  /** The alert to show in the banner, or null. */
  activeAlert: ProximityAlert | null;
  /** Dismiss the banner. Does not re-arm the alert for this zone. */
  dismissAlert: () => void;
  /** Zones the user is inside right now, most severe first. */
  insideNow: { spot: BlackSpot; distanceM: number }[];
  /** Latest position from the stream, for the map. */
  watchedLocation: Coordinates | null;
}

export function useProximityAlerts({
  spots,
  initialLocation,
  enabled,
}: UseProximityAlertsInput): UseProximityAlertsResult {
  const { user, profile } = useAuth();

  const [activeAlert, setActiveAlert] = useState<ProximityAlert | null>(null);
  const [insideNow, setInsideNow] = useState<{ spot: BlackSpot; distanceM: number }[]>([]);
  const [watchedLocation, setWatchedLocation] = useState<Coordinates | null>(null);

  const zoneStatesRef = useRef<ZoneStates>({});
  const mountedRef = useRef(true);

  /**
   * Whether the persisted zone state has been read.
   *
   * Evaluation waits for it. Running the engine against an empty state and
   * then hydrating would defeat the entire point: the very first fix would be
   * treated as a fresh entry and re-warn about the zone the user is already
   * standing in, which is the bug this is here to fix.
   */
  const [hydrated, setHydrated] = useState(false);

  const preferences = useMemo(
    () => ({
      alertsEnabled: profile?.alertsEnabled ?? true,
      soundEnabled: profile?.soundEnabled ?? true,
      hapticsEnabled: profile?.hapticsEnabled ?? true,
      alertRadiusM: profile?.alertRadiusM ?? 1000,
    }),
    [profile],
  );

  /**
   * The position callback reads current values through these refs.
   *
   * The subscription is created once, so closing over `spots` or `preferences`
   * directly would freeze them at whatever they were when the stream started —
   * a user changing their alert radius, or newly-loaded black spots, would be
   * ignored until the screen remounted.
   *
   * They are assigned in effects rather than during render: writing a ref during
   * render is unsafe under concurrent rendering, and React's own lint rule
   * rejects it. Effects commit before any position update can arrive, so the
   * callback never sees a stale value in practice.
   */
  const spotsRef = useRef(spots);
  const preferencesRef = useRef(preferences);
  const userIdRef = useRef<string | null>(user?.uid ?? null);

  useEffect(() => {
    spotsRef.current = spots;
  }, [spots]);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    userIdRef.current = user?.uid ?? null;
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const persisted = await loadZoneStates();
      if (cancelled) {
        return;
      }
      // Merged rather than assigned. Today the ref is always empty here, because
      // evaluation is gated on `hydrated` — but that gate is the only thing
      // making it so, and losing a live `inside` flag to a late disk read would
      // be a duplicate warning that is very hard to reproduce. The merge costs
      // nothing and does not depend on the gate staying where it is.
      zoneStatesRef.current = mergeZoneStates(persisted, zoneStatesRef.current);
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Signature of the last state written to disk.
   *
   * Persisting on every GPS tick would mean an AsyncStorage write every few
   * seconds for a journey's duration, almost always with identical content.
   * Only presence and alert times can change a future decision, so only a change
   * in those is worth a write.
   */
  const persistedSignatureRef = useRef<string>('');

  /** Feed one position through the engine and act on the result. */
  const processPosition = useCallback((location: Coordinates) => {
    const currentSpots = spotsRef.current;
    const prefs = preferencesRef.current;

    const result = evaluateProximity({
      location,
      spots: currentSpots,
      states: zoneStatesRef.current,
      now: Date.now(),
      config: { ...DEFAULT_PROXIMITY_CONFIG, userAlertRadiusM: prefs.alertRadiusM },
      alertsEnabled: prefs.alertsEnabled,
    });

    zoneStatesRef.current = result.nextStates;

    const signature = zoneStateSignature(result.nextStates);
    if (signature !== persistedSignatureRef.current) {
      persistedSignatureRef.current = signature;
      // Deliberately not awaited: a disk write must never delay showing a
      // warning, and `saveZoneStates` never throws.
      void saveZoneStates(result.nextStates);
    }

    if (!mountedRef.current) {
      return;
    }

    setInsideNow(result.insideNow);

    const [alert] = result.alerts;
    if (alert === undefined) {
      return;
    }

    // Banner first: it is the one channel that always works, and it must not
    // wait on a notification permission or a haptic motor.
    setActiveAlert(alert);

    void deliverAlert(alert, prefs);

    const userId = userIdRef.current;
    if (userId !== null) {
      void recordAlert({
        userId,
        blackSpotId: alert.blackSpot.id,
        distanceM: alert.distanceM,
        alertType: 'foreground',
      });
    }

    logger.info('useProximityAlerts', 'Raised a proximity alert', {
      blackSpotId: alert.blackSpot.id,
      riskLevel: alert.blackSpot.riskLevel,
      alsoInside: alert.alsoInside.length,
    });
  }, []);

  // Ask for notification permission once, and only when alerting is actually
  // switched on — requesting it before there is anything to notify about is a
  // prompt the user cannot evaluate.
  useEffect(() => {
    if (!enabled || !preferences.alertsEnabled) {
      return;
    }
    void ensureNotificationPermission();
  }, [enabled, preferences.alertsEnabled]);

  // Evaluate immediately against the position we already have, so a user who
  // opens the app already inside a zone is told straight away.
  useEffect(() => {
    if (!enabled || !hydrated || initialLocation === null || spots.length === 0) {
      return;
    }
    processPosition(initialLocation);
  }, [enabled, hydrated, initialLocation, processPosition, spots.length]);

  // The position stream.
  useEffect(() => {
    if (!enabled || !hydrated) {
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const stop = await watchPosition((location) => {
          if (cancelled) {
            return;
          }
          setWatchedLocation(location);
          processPosition(location);
        });

        if (cancelled) {
          // Resolved after unmount; tear down immediately rather than leaking a
          // subscription that would keep the GPS awake.
          stop();
          return;
        }
        unsubscribe = stop;
      } catch (error) {
        logger.warn('useProximityAlerts', 'Could not start watching position', {
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [enabled, hydrated, processPosition]);

  const dismissAlert = useCallback(() => {
    setActiveAlert(null);
  }, []);

  return { activeAlert, dismissAlert, insideNow, watchedLocation };
}

/**
 * Compact representation of everything in the state that could change a future
 * decision — presence and alert time, per spot.
 *
 * Sorted so that a change in iteration order alone does not look like a change
 * in state and trigger a pointless write.
 */
function zoneStateSignature(states: ZoneStates): string {
  return Object.values(states)
    .map((state) => `${state.blackSpotId}:${state.inside ? 1 : 0}:${state.lastAlertedAt ?? 0}`)
    .sort()
    .join('|');
}

/** Re-exported so screens can render the current worst zone without importing the engine. */
export { highestPriorityInside };
