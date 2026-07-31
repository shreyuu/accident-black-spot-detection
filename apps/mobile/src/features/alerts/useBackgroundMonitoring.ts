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
 * ## Where this is mounted, and what that does not cover
 *
 * Only the Settings screen mounts it, which is enough for the cases that matter:
 * the OS keeps a registered location task across app restarts, so a task that is
 * running stays running without the app's help, and the background task itself
 * self-stops when it reads a snapshot saying the user has opted out.
 *
 * It does **not** cover re-registering a task the OS dropped on its own —
 * an Android reboot being the usual case, since there is no BOOT_COMPLETED
 * receiver. Background warnings then resume the next time the user opens
 * Settings, not the next time they open the app.
 *
 * TODO(phase-11): reconcile on launch rather than on screen mount, as part of
 * the app-wide preference sync. Doing it now would mean two live instances of
 * this hook racing to start the same task.
 */

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

  /**
   * Apply the decision.
   *
   * Guarded by a ref rather than by `busy`: `busy` is state and a second effect
   * run can observe it before React has committed the update, whereas the ref is
   * written synchronously. Without it, two starts can overlap and the second
   * fails with the task already registered.
   */
  const reconcilingRef = useRef(false);

  useEffect(() => {
    if (decision.action === 'none' || reconcilingRef.current) {
      return;
    }

    reconcilingRef.current = true;
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
        reconcilingRef.current = false;
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
