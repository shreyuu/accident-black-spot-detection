import type { User } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  buildBackgroundAlertSnapshot,
  clearBackgroundAlertSnapshot,
  saveBackgroundAlertSnapshot,
} from '@/features/alerts/backgroundAlertSnapshot';
import { clearZoneStates } from '@/features/alerts/zoneStateStore';
import { clearDrafts } from '@/features/reports/draftStore';
import { clearPreferences } from '@/features/settings/preferenceStore';
import { subscribeToAuthState } from '@/features/auth/authService';
import { stopBackgroundMonitoring } from '@/features/location/backgroundLocationService';
import { createUserProfile, getUserProfile } from '@/services/firebase/userProfileRepository';
import type { UserProfile } from '@/types/domain';
import { toAppError, type AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Session state shared across the app.
 *
 * `status` is a single discriminant rather than a pair of booleans, because
 * "restoring" and "signed out" must never be confused: treating the former as
 * the latter would bounce a signed-in user to the login screen for a frame on
 * every cold start.
 */
export type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  profile: UserProfile | null;
  /** Non-fatal problem loading the profile. The session itself is still valid. */
  profileError: AppError | null;
  /** Re-read the profile, for retry affordances and after preference changes. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<AppError | null>(null);

  /**
   * Load the profile, creating it if it is missing.
   *
   * The self-repair path covers the registration window described in
   * authService.register: an Auth account can exist without its Firestore
   * document if the profile write failed. Recreating it here is safe because the
   * uid is fixed and Firestore rules still pin `role` to `"user"`.
   */
  const loadProfile = useCallback(async (currentUser: User): Promise<void> => {
    try {
      const existing = await getUserProfile(currentUser.uid);

      if (existing !== null) {
        setProfile(existing);
        setProfileError(null);
        return;
      }

      logger.warn('AuthProvider', 'Profile missing for a signed-in account; recreating', {
        userId: currentUser.uid,
      });

      await createUserProfile({
        userId: currentUser.uid,
        name: currentUser.displayName ?? 'Unnamed user',
        email: currentUser.email ?? '',
      });

      setProfile(await getUserProfile(currentUser.uid));
      setProfileError(null);
    } catch (error) {
      const appError = toAppError(error);
      logger.error('AuthProvider', 'Failed to load the user profile', appError.cause, {
        userId: currentUser.uid,
      });
      setProfile(null);
      setProfileError(appError);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Subscribing is what restores a persisted session: the listener fires once
    // shortly after startup with the rehydrated user, or with null.
    const unsubscribe = subscribeToAuthState((nextUser) => {
      if (cancelled) {
        return;
      }

      setUser(nextUser);

      if (nextUser === null) {
        setProfile(null);
        setProfileError(null);
        setStatus('unauthenticated');
        // Sign-out has to reach everything this account left on the device.
        //
        // The background task runs headless off its own snapshot, so leaving
        // that behind would mean the next person inherits the previous user's
        // warnings and their alert-log attribution. Drafts are the sharper
        // case: an unsent draft is somebody's private account of an incident,
        // and leaving it would let the next person read it — or submit it under
        // their own name.
        void (async () => {
          await stopBackgroundMonitoring();
          await Promise.all([
            clearBackgroundAlertSnapshot(),
            clearZoneStates(),
            clearPreferences(),
            clearDrafts(),
          ]);
        })();
        return;
      }

      // Status flips before the profile resolves so navigation is not blocked on
      // a Firestore round trip; screens handle `profile === null` themselves.
      setStatus('authenticated');
      void loadProfile(nextUser);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadProfile]);

  /**
   * Mirror the preferences the background task depends on to disk.
   *
   * The task runs with no React tree and no guarantee of a network, so it reads
   * this snapshot rather than Firestore. Writing it here — where the profile is
   * loaded and refreshed — is what keeps the two in step: a preference changed
   * in Settings reaches the background path on the next refresh, not on the next
   * launch.
   */
  useEffect(() => {
    if (profile === null) {
      return;
    }
    void saveBackgroundAlertSnapshot(buildBackgroundAlertSnapshot(profile));
  }, [profile]);

  const refreshProfile = useCallback(async (): Promise<void> => {
    if (user !== null) {
      await loadProfile(user);
    }
  }, [loadProfile, user]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, profile, profileError, refreshProfile }),
    [status, user, profile, profileError, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access session state. Throws outside AuthProvider so wiring bugs are loud. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }
  return context;
}
