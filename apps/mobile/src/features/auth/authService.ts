import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';

import { mapFirebaseAuthError } from '@/features/auth/authErrors';
import type { LoginValues, RegisterValues } from '@/features/auth/schemas';
import { getFirebaseAuth } from '@/services/firebase/app';
import { createUserProfile } from '@/services/firebase/userProfileRepository';
import { logger } from '@/utils/logger';

/**
 * Authentication operations.
 *
 * This module owns every call into Firebase Auth. Screens call these functions
 * and render the resulting `AppError.userMessage`; they never see a Firebase
 * error code.
 *
 * Passwords are passed straight to the SDK and never stored, logged, hashed or
 * transformed by application code.
 */

export interface RegisterResult {
  user: User;
  /**
   * True when the Auth account was created but the Firestore profile write
   * failed. The user is signed in and can continue; the profile is repaired on
   * next launch by `ensureProfileExists`.
   */
  profileWriteFailed: boolean;
}

/**
 * Register a new account.
 *
 * Ordering matters. The Auth account is created first because the Firestore
 * write needs `request.auth.uid` to satisfy the security rule — the profile
 * document simply cannot be written before the account exists.
 *
 * That leaves a window where the account exists without a profile. Rather than
 * pretend it cannot happen, the failure is reported back and repaired on the
 * next launch. Deleting the freshly created Auth account to "roll back" would be
 * worse: it can itself fail, and it would leave the user with neither an account
 * nor an explanation.
 */
export async function register(values: RegisterValues): Promise<RegisterResult> {
  const auth = getFirebaseAuth();

  let credential;
  try {
    credential = await createUserWithEmailAndPassword(auth, values.email, values.password);
  } catch (error) {
    throw mapFirebaseAuthError(error);
  }

  const { user } = credential;

  // Best-effort: the display name is a convenience mirror of the profile
  // document, so a failure here is not worth failing registration over.
  try {
    await updateProfile(user, { displayName: values.name });
  } catch (error) {
    logger.warn('authService', 'Could not set the Auth display name', {
      userId: user.uid,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  try {
    await createUserProfile({
      userId: user.uid,
      name: values.name,
      email: values.email,
      ...(values.phone === undefined || values.phone.length === 0 ? {} : { phone: values.phone }),
    });
  } catch (error) {
    logger.error('authService', 'Account created but the profile write failed', error, {
      userId: user.uid,
    });
    return { user, profileWriteFailed: true };
  }

  return { user, profileWriteFailed: false };
}

export async function login(values: LoginValues): Promise<User> {
  try {
    const credential = await signInWithEmailAndPassword(
      getFirebaseAuth(),
      values.email,
      values.password,
    );
    return credential.user;
  } catch (error) {
    throw mapFirebaseAuthError(error);
  }
}

export async function logout(): Promise<void> {
  try {
    await signOut(getFirebaseAuth());
  } catch (error) {
    throw mapFirebaseAuthError(error);
  }
}

/**
 * Send a password reset email.
 *
 * Callers must show the same confirmation whether or not an account exists — see
 * the note in the forgot-password screen. This function resolves normally for
 * `auth/user-not-found` precisely so that the UI cannot accidentally reveal
 * which addresses are registered.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getFirebaseAuth(), email);
  } catch (error) {
    const mapped = mapFirebaseAuthError(error);

    // Swallow "no such user" so the response is indistinguishable from success.
    // Genuine problems (offline, rate limited) still surface, because a user who
    // is offline needs to know the email was not sent.
    if (mapped.kind === 'auth') {
      logger.info('authService', 'Password reset requested for an unknown address');
      return;
    }

    throw mapped;
  }
}

/**
 * Subscribe to session changes.
 *
 * The returned unsubscribe function must be called on unmount. The listener also
 * fires once with the restored session shortly after startup, which is what the
 * splash gate waits on.
 */
export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

export function getCurrentUser(): User | null {
  return getFirebaseAuth().currentUser;
}
