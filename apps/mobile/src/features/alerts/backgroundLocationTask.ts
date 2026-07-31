import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { deliverAlert } from '@/features/alerts/alertDelivery';
import { recordAlert } from '@/features/alerts/alertLogRepository';
import { loadBackgroundAlertSnapshot } from '@/features/alerts/backgroundAlertSnapshot';
import { partitionBackgroundAlerts } from '@/features/alerts/backgroundMonitoringPolicy';
import { DEFAULT_PROXIMITY_CONFIG, evaluateProximity } from '@/features/alerts/proximityEngine';
import { loadZoneStates, saveZoneStates } from '@/features/alerts/zoneStateStore';
import { loadNearbyBlackSpots } from '@/features/black-spots/blackSpotCache';
import { getFirebaseAuth } from '@/services/firebase/app';
import { isValidCoordinate, type Coordinates } from '@/utils/geo';
import { logger } from '@/utils/logger';

/**
 * The background location task.
 *
 * This module runs in a **headless** context. When the OS delivers a background
 * location update it starts the JS bundle without any UI: there is no React
 * tree, no `AuthProvider`, no navigation, and no TanStack Query cache. Anything
 * this task needs must therefore already be on disk. That constraint is what
 * shapes the whole file:
 *
 *   - preferences come from `backgroundAlertSnapshot`, not Firestore;
 *   - black spots come from `blackSpotCache`, not a network query;
 *   - zone state comes from `zoneStateStore`, not a ref.
 *
 * The decision itself is not reimplemented. It is the same `evaluateProximity`
 * the foreground uses, with the same config — a second copy of the hysteresis
 * and cooldown rules is exactly the kind of divergence that produces a warning
 * in one mode and silence in the other.
 *
 * `defineTask` must run during module evaluation, before the OS asks for the
 * task by name, which is why this module is imported for its side effect from
 * `app/_layout.tsx` rather than being pulled in lazily by a screen.
 */

/**
 * The task's registered name.
 *
 * Persisted by the OS across launches, so changing it orphans any task an
 * existing install already has registered. If it ever has to change, the old
 * name must be explicitly unregistered on upgrade.
 */
export const BACKGROUND_LOCATION_TASK = 'accident-black-spot-detection.background-location';

interface BackgroundLocationPayload {
  locations?: Location.LocationObject[];
}

/**
 * Most recent usable fix from the batch.
 *
 * The OS coalesces updates and hands over several at once, oldest first. Only
 * the newest matters for "where is the user now", and a fix with a NaN or
 * out-of-range coordinate — which a failing sensor does produce — has to be
 * skipped rather than fed into a distance calculation.
 */
function latestValidPosition(locations: readonly Location.LocationObject[]): Coordinates | null {
  for (let index = locations.length - 1; index >= 0; index -= 1) {
    const position = locations[index];
    if (position === undefined) {
      continue;
    }
    const candidate = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    if (isValidCoordinate(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Stop the OS sending us any more updates.
 *
 * Called directly through `expo-location` rather than through
 * `backgroundLocationService`, which would import this module for the task name
 * and make the two mutually dependent.
 *
 * This is a backstop, not the normal path — `useBackgroundMonitoring` stops the
 * task when the user opts out. It exists because the task is the only code that
 * definitely runs after a background update, so it is the last place able to
 * notice that it should no longer be running at all: a snapshot that has been
 * cleared by sign-out, or a preference switched off on another device.
 */
async function stopUpdatesFromTask(reason: string): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      logger.info('backgroundLocationTask', 'Stopped background updates', { reason });
    }
  } catch (error) {
    logger.warn('backgroundLocationTask', 'Could not stop background updates', {
      reason,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Process one batch of background locations.
 *
 * Exported so it can be exercised directly; `defineTask` below is a thin shell
 * around it. Never throws — an exception escaping a task executor is reported by
 * the OS as a task failure and, on Android, counts against the process.
 */
export async function handleBackgroundLocations(
  locations: readonly Location.LocationObject[],
  now: number = Date.now(),
): Promise<void> {
  const snapshot = await loadBackgroundAlertSnapshot();

  // No snapshot means nobody has opted in on this device — including the case
  // where sign-out cleared it. Absence is never read as "use the defaults".
  if (snapshot === null) {
    await stopUpdatesFromTask('no preferences snapshot');
    return;
  }

  if (!snapshot.backgroundMonitoringEnabled || !snapshot.alertsEnabled) {
    await stopUpdatesFromTask('the user has switched background warnings off');
    return;
  }

  const location = latestValidPosition(locations);
  if (location === null) {
    return;
  }

  // The cache is the only source available here. When it holds nothing usable
  // for this area the honest outcome is silence: inventing coverage the app does
  // not have would be worse than admitting the gap. The Settings copy says the
  // app must be opened occasionally for this reason.
  const cached = await loadNearbyBlackSpots(location);
  if (cached === null || cached.spots.length === 0) {
    logger.debug('backgroundLocationTask', 'No cached black spots cover this area; skipping');
    return;
  }

  const states = await loadZoneStates(now);

  const result = evaluateProximity({
    location,
    spots: cached.spots,
    states,
    now,
    config: { ...DEFAULT_PROXIMITY_CONFIG, userAlertRadiusM: snapshot.alertRadiusM },
    alertsEnabled: true,
  });

  // Saved before delivery. If the process is killed between the two the user
  // misses a warning they may get again on the next update; the other order
  // risks delivering the same warning repeatedly, which is the failure that
  // teaches people to ignore warnings altogether.
  await saveZoneStates(result.nextStates, now);

  const { deliver, withheld } = partitionBackgroundAlerts(result.alerts);

  if (withheld.length > 0) {
    logger.debug('backgroundLocationTask', 'Withheld a lower-risk background alert', {
      count: withheld.length,
    });
  }

  for (const alert of deliver) {
    await deliverAlert(alert, {
      alertsEnabled: true,
      soundEnabled: snapshot.soundEnabled,
      hapticsEnabled: snapshot.hapticsEnabled,
    });

    // Best effort only. In a headless launch Firebase may not have finished
    // restoring the session, and a write without an authenticated user is
    // rejected by the rules — so the log is skipped rather than attempted and
    // silently failed. The user has still been warned, which is the point.
    if (getFirebaseAuth().currentUser !== null) {
      await recordAlert({
        userId: snapshot.userId,
        blackSpotId: alert.blackSpot.id,
        distanceM: alert.distanceM,
        alertType: 'background',
      });
    }

    logger.info('backgroundLocationTask', 'Delivered a background proximity alert', {
      blackSpotId: alert.blackSpot.id,
      riskLevel: alert.blackSpot.riskLevel,
    });
  }
}

TaskManager.defineTask<BackgroundLocationPayload>(
  BACKGROUND_LOCATION_TASK,
  async ({ data, error }) => {
    if (error !== null) {
      // Routine rather than exceptional: the OS reports a transient error here
      // when location is briefly unavailable. It is logged, not surfaced.
      logger.warn('backgroundLocationTask', 'Background location update reported an error', {
        message: error.message,
      });
      return;
    }

    const locations = data?.locations;
    if (locations === undefined || locations.length === 0) {
      return;
    }

    try {
      await handleBackgroundLocations(locations);
    } catch (taskError) {
      logger.error('backgroundLocationTask', 'Background evaluation failed', taskError);
    }
  },
);
