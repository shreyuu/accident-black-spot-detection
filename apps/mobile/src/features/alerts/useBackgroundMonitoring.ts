import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import {
  decideBackgroundMonitoring,
  type BackgroundMonitoringDecision,
} from '@/features/alerts/backgroundMonitoringPolicy';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  getBackgroundPermissionStatus,
  isBackgroundMonitoringRunning,
  isBackgroundMonitoringSupported,
  requestBackgroundPermission,
  startBackgroundMonitoring,
  stopBackgroundMonitoring,
} from '@/features/location/backgroundLocationService';
import {
  getPermissionStatus,
  type LocationPermissionStatus,
} from '@/features/location/locationService';
import { updateUserPreferences } from '@/services/firebase/userProfileRepository';
import { toAppError, type AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Keeps the OS's background location task in step with the user's choice.
 *
 * The decision itself is `decideBackgroundMonitoring`, which is pure and tested;
 * this hook supplies it with the current world (preference, permissions, whether
 * the task is registered) and then carries out exactly what it returns. Nothing
 * here decides anything on its own, which is what makes the opt-in promise
 * checkable: no code path starts the task for a reason the policy does not
 * describe.
 *
 * The reconciliation runs on every change rather than only on the toggle,
 * because the preconditions can disappear without the app being involved — a
 * user can revoke "Always" in system Settings, or dismiss the Android
 * notification. Coming back to the app then stops the task.
 *
 * ## Where this is mounted
 *
 * The tab layout mounts it, so reconciliation happens on launch, and the
 * Settings screen mounts it again for its controls. Phase 11 closed the gap
 * left by Phase 8: previously only Settings mounted it, so a task the OS had
 * dropped — an Android reboot being the usual case, since there is no
 * BOOT_COMPLETED receiver — did not resume until the user happened to open
 * Settings.
 *
 * Two live instances is exactly the race Phase 8 was wary of, so the guard
 * below is **module-level rather than per-instance**: whichever mounts first
 * performs the reconciliation and the other observes the result. A per-instance
 * ref would have let both call `startBackgroundMonitoring` in the same tick.
 */

/**
 * Whether a reconciliation is in flight, **process-wide**.
 *
 * Not a ref, because the guard has to hold across every mounted instance of
 * this hook — the tab layout's and the Settings screen's — not just within one.
 * Written synchronously so a second effect running in the same tick sees it;
 * `busy` is state and would not have been committed yet.
 */
let reconciling = false;

interface MonitoringEnvironment {
  foregroundPermission: LocationPermissionStatus;
  backgroundPermission: LocationPermissionStatus;
  taskRunning: boolean;
  platformSupported: boolean;
}

const INITIAL_ENVIRONMENT: MonitoringEnvironment = {
  // Pessimistic until the real values are read, so nothing starts on the
  // strength of an assumption.
  foregroundPermission: 'undetermined',
  backgroundPermission: 'undetermined',
  taskRunning: false,
  platformSupported: isBackgroundMonitoringSupported(),
};

export interface UseBackgroundMonitoringResult {
  decision: BackgroundMonitoringDecision;
  /** True while a permission request or a start/stop is in flight. */
  busy: boolean;
  error: AppError | null;
  /**
   * Opt in. Call only after the disclosure has been accepted — it requests
   * background location permission.
   */
  enable: () => Promise<void>;
  /** Opt out. Stops the task and persists the preference. */
  disable: () => Promise<void>;
  /** Open the system settings page, for the permanently-refused case. */
  openSettings: () => Promise<void>;
}

export function useBackgroundMonitoring(): UseBackgroundMonitoringResult {
  const { user, profile, refreshProfile } = useAuth();

  const [environment, setEnvironment] = useState<MonitoringEnvironment>(INITIAL_ENVIRONMENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const syncEnvironment = useCallback(async (): Promise<void> => {
    const supported = isBackgroundMonitoringSupported();
    const [foregroundPermission, backgroundPermission, taskRunning] = await Promise.all([
      getPermissionStatus(),
      getBackgroundPermissionStatus(),
      isBackgroundMonitoringRunning(),
    ]);

    if (!mountedRef.current) {
      return;
    }
    setEnvironment({
      foregroundPermission,
      backgroundPermission,
      taskRunning,
      platformSupported: supported,
    });
  }, []);

  useEffect(() => {
    void syncEnvironment();
  }, [syncEnvironment]);

  // Permission can change entirely outside the app — Android 11+ sends the user
  // to a Settings page to choose "Allow all the time", and either platform lets
  // it be revoked there later. Re-reading on return is what stops the UI showing
  // a stale answer, and what stops a revoked permission leaving a task running.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncEnvironment();
      }
    });
    return () => subscription.remove();
  }, [syncEnvironment]);

  const decision = useMemo(
    () =>
      decideBackgroundMonitoring({
        // A signed-out user has no preference to honour, and the background task
        // has nothing to attribute alerts to.
        preferenceEnabled: user !== null && (profile?.backgroundMonitoringEnabled ?? false),
        alertsEnabled: profile?.alertsEnabled ?? true,
        ...environment,
      }),
    [environment, profile, user],
  );

  useEffect(() => {
    if (decision.action === 'none' || reconciling) {
      return;
    }

    reconciling = true;
    void (async () => {
      try {
        if (decision.action === 'start') {
          await startBackgroundMonitoring();
        } else {
          await stopBackgroundMonitoring();
        }
        await syncEnvironment();
      } catch (caught) {
        logger.warn('useBackgroundMonitoring', 'Could not apply the monitoring decision', {
          action: decision.action,
          error: caught instanceof Error ? caught.message : 'unknown',
        });
        if (mountedRef.current) {
          setError(toAppError(caught));
        }
        // Re-read regardless: the failure may itself have changed the world, and
        // a stale `taskRunning` would retry the same doomed action forever.
        await syncEnvironment();
      } finally {
        reconciling = false;
      }
    })();
  }, [decision.action, syncEnvironment]);

  const enable = useCallback(async (): Promise<void> => {
    if (user === null) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const status = await requestBackgroundPermission();
      await syncEnvironment();

      // The preference is written whatever the permission outcome. It records
      // what the user asked for, so the Settings screen can explain what is
      // missing instead of silently reverting the toggle they just moved.
      await updateUserPreferences(user.uid, { backgroundMonitoringEnabled: true });
      await refreshProfile();

      if (status !== 'granted') {
        logger.info('useBackgroundMonitoring', 'Opted in without background permission', {
          status,
        });
      }
    } catch (caught) {
      if (mountedRef.current) {
        setError(toAppError(caught));
      }
    } finally {
      if (mountedRef.current) {
        setBusy(false);
      }
    }
  }, [refreshProfile, syncEnvironment, user]);

  const disable = useCallback(async (): Promise<void> => {
    if (user === null) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Stopped before the preference is written, so that a failure to reach
      // Firestore still leaves the location updates off. The opposite order
      // would leave a user who opted out with a task still running.
      await stopBackgroundMonitoring();
      await updateUserPreferences(user.uid, { backgroundMonitoringEnabled: false });
      await refreshProfile();
      await syncEnvironment();
    } catch (caught) {
      if (mountedRef.current) {
        setError(toAppError(caught));
      }
      await syncEnvironment();
    } finally {
      if (mountedRef.current) {
        setBusy(false);
      }
    }
  }, [refreshProfile, syncEnvironment, user]);

  const openSettings = useCallback(async (): Promise<void> => {
    await Linking.openSettings();
  }, []);

  return { decision, busy, error, enable, disable, openSettings };
}
