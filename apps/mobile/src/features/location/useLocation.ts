import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import {
  getCurrentLocation,
  getLastKnownLocation,
  getPermissionStatus,
  requestPermission,
  type LocationAccuracyMode,
  type LocationPermissionStatus,
  type UserLocation,
} from '@/features/location/locationService';
import { toAppError, type AppError } from '@/utils/errors';

/**
 * React binding for foreground location.
 *
 * Deliberately exposes permission state, position, loading and error as separate
 * values rather than a single "ready" flag: the map has to render meaningfully
 * in each combination — for example a stale cached position while a fresh fix is
 * still loading, or a granted permission with location services switched off.
 */

export interface UseLocationResult {
  permission: LocationPermissionStatus;
  location: UserLocation | null;
  /** True while a fix is in flight. A cached `location` may already be shown. */
  loading: boolean;
  error: AppError | null;
  /** True until the initial permission check completes. */
  initialising: boolean;
  /** Shows the OS dialog, then fetches a position if granted. */
  requestAccess: () => Promise<void>;
  /** Re-fetch the position. Used by retry and the re-centre control. */
  refresh: (mode?: LocationAccuracyMode) => Promise<void>;
  /** Opens system settings — the only route out of `blocked`. */
  openSettings: () => Promise<void>;
}

export function useLocation(defaultMode: LocationAccuracyMode = 'balanced'): UseLocationResult {
  const [permission, setPermission] = useState<LocationPermissionStatus>('undetermined');
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [initialising, setInitialising] = useState(true);

  // Guards against setting state after unmount, which happens routinely here
  // because a fix can take seconds and the user may navigate away.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchLocation = useCallback(async (mode: LocationAccuracyMode): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // Paint something immediately where possible; the accurate fix replaces
      // it a moment later.
      const cached = await getLastKnownLocation();
      if (cached !== null && mountedRef.current) {
        setLocation(cached);
      }

      const fresh = await getCurrentLocation(mode);
      if (mountedRef.current) {
        setLocation(fresh);
      }
    } catch (caught) {
      if (mountedRef.current) {
        setError(toAppError(caught));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const syncPermission = useCallback(async (): Promise<LocationPermissionStatus> => {
    const status = await getPermissionStatus();
    if (mountedRef.current) {
      setPermission(status);
    }
    return status;
  }, []);

  // Initial check. Never prompts — the user sees the in-app explanation first.
  useEffect(() => {
    void (async () => {
      try {
        const status = await syncPermission();
        if (status === 'granted') {
          await fetchLocation(defaultMode);
        }
      } finally {
        if (mountedRef.current) {
          setInitialising(false);
        }
      }
    })();
  }, [defaultMode, fetchLocation, syncPermission]);

  /**
   * Re-check permission when the app returns to the foreground.
   *
   * Without this, a user who follows the "Open settings" path and grants access
   * comes back to a screen still insisting permission is blocked, with no way to
   * refresh short of restarting the app.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }
      void (async () => {
        const status = await syncPermission();
        if (status === 'granted' && location === null) {
          await fetchLocation(defaultMode);
        }
      })();
    });

    return () => subscription.remove();
  }, [defaultMode, fetchLocation, location, syncPermission]);

  const requestAccess = useCallback(async (): Promise<void> => {
    const status = await requestPermission();
    if (mountedRef.current) {
      setPermission(status);
    }
    if (status === 'granted') {
      await fetchLocation(defaultMode);
    }
  }, [defaultMode, fetchLocation]);

  const refresh = useCallback(
    async (mode: LocationAccuracyMode = defaultMode): Promise<void> => {
      const status = await syncPermission();
      if (status === 'granted') {
        await fetchLocation(mode);
      }
    },
    [defaultMode, fetchLocation, syncPermission],
  );

  const openSettings = useCallback(async (): Promise<void> => {
    await Linking.openSettings();
  }, []);

  return {
    permission,
    location,
    loading,
    error,
    initialising,
    requestAccess,
    refresh,
    openSettings,
  };
}
