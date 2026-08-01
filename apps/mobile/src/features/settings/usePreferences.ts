import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_PREFERENCES,
  applyPreferenceChange,
  preferencesEqual,
  preferencesFromProfile,
  type AppPreferences,
} from '@/features/settings/preferences';
import { loadPreferences, savePreferences } from '@/features/settings/preferenceStore';
import { useAuth } from '@/features/auth/AuthProvider';
import { updateUserPreferences } from '@/services/firebase/userProfileRepository';
import { toAppError, type AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * The user's preferences, applied immediately and persisted in two places.
 *
 * ## Why two
 *
 * Firestore is the record of truth — it follows the account to a new device.
 * AsyncStorage is the copy that works with no signal and is available before
 * the profile has loaded, which matters because Phase 4 established that
 * Firestore's own cache is no help offline: `getDocs` resolves from an empty
 * local cache rather than failing.
 *
 * ## Write order, and why a failed write is not reverted
 *
 * A change is applied in memory first, mirrored to disk, then sent to
 * Firestore. If the Firestore write fails the local value **stays**: the user
 * asked for a 400 m radius, and snapping the control back to 1000 m because a
 * network request failed would be both confusing and wrong — they still want
 * 400 m, and the app can honour that locally right now. The failure is
 * surfaced as a syncing error instead, so nobody is misled into thinking it
 * reached their account.
 */

export interface UsePreferencesResult {
  preferences: AppPreferences;
  /** False until the stored preferences have been read. */
  ready: boolean;
  /** Set when the last change could not be saved to the account. */
  syncError: AppError | null;
  /** True while a change is being written. */
  saving: boolean;
  update: (change: Partial<AppPreferences>) => Promise<void>;
}

export function usePreferences(): UsePreferencesResult {
  const { user, profile, refreshProfile } = useAuth();

  /**
   * The three sources, resolved during render rather than synced by effects.
   *
   * An earlier version kept one state and copied the profile into it from an
   * effect. The React Compiler lint rule rejected that, correctly: preferences
   * derived from the profile are derived state, and computing them in an effect
   * means an extra render and a window in which the two disagree.
   *
   * Precedence, highest first:
   *   1. `pendingChange` — what the user just chose. Held only until the
   *      account write settles, so a change is never lost mid-flight.
   *   2. the profile — authoritative, and what followed the user to this device.
   *   3. `stored` — the local mirror, which is all there is before the profile
   *      loads or when there is no signal.
   */
  const [pendingChange, setPendingChange] = useState<AppPreferences | null>(null);
  const [stored, setStored] = useState<AppPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncError, setSyncError] = useState<AppError | null>(null);

  const fromProfile = profile === null ? null : preferencesFromProfile(profile);
  const preferences = pendingChange ?? fromProfile ?? stored ?? DEFAULT_PREFERENCES;
  const ready = stored !== null;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Read the local mirror, so settings are correct almost immediately rather
  // than flashing the defaults and then correcting themselves.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const value = await loadPreferences();
      if (!cancelled) {
        setStored(value);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Keep the local mirror in step with the account.
   *
   * Writing to storage from an effect is the sanctioned use of one — pushing
   * React state out to an external system. The equality check stops it firing
   * on every `refreshProfile`, which would otherwise rewrite identical bytes.
   */
  useEffect(() => {
    if (fromProfile === null || stored === null || preferencesEqual(stored, fromProfile)) {
      return;
    }
    void savePreferences(fromProfile);
  }, [fromProfile, stored]);

  const update = useCallback(
    async (change: Partial<AppPreferences>): Promise<void> => {
      // Applied optimistically. A settings control that waits for a round trip
      // before moving feels broken, and this one has to work offline anyway.
      const next = applyPreferenceChange(preferences, change);
      setPendingChange(next);
      setStored(next);
      void savePreferences(next);

      if (user === null) {
        return;
      }

      setSaving(true);
      setSyncError(null);
      try {
        await updateUserPreferences(user.uid, {
          alertRadiusM: next.alertRadiusM,
          alertsEnabled: next.alertsEnabled,
          soundEnabled: next.soundEnabled,
          hapticsEnabled: next.hapticsEnabled,
          backgroundMonitoringEnabled: next.backgroundMonitoringEnabled,
          darkModePreference: next.darkModePreference,
        });
        // Refreshed so the rest of the app — the proximity engine reads
        // `profile.alertRadiusM` — sees the change without a remount.
        await refreshProfile();
        // Released once the account holds it, so the profile is authoritative
        // again and a change made on another device is not shadowed for ever.
        if (mountedRef.current) {
          setPendingChange(null);
        }
      } catch (error) {
        const appError = toAppError(error);
        logger.warn('usePreferences', 'Could not save preferences to the account', {
          error: appError.message,
        });
        // `pendingChange` is deliberately kept, so the user's choice survives
        // and keeps being applied locally. See the note at the top of this file.
        if (mountedRef.current) {
          setSyncError(appError);
        }
      } finally {
        if (mountedRef.current) {
          setSaving(false);
        }
      }
    },
    [preferences, refreshProfile, user],
  );

  return { preferences, ready, syncError, saving, update };
}
