import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
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
    await requestEmailVerification(user);
    return { user, profileWriteFailed: true };
  }

  await requestEmailVerification(user);
  return { user, profileWriteFailed: false };
}

/**
 * Ask Firebase to send the address-confirmation email.
 *
 * Best-effort, and deliberately so. Registration must not fail because a
 * verification email could not be sent: the account exists, the user is signed
 * in, and every part of the app except filing a report works without this. The
 * report screen offers a resend for the case where it never arrives.
 *
 * `email_verified` gates report creation in `firestore.rules` — see
 * `hasVerifiedEmail()` there for why that line is drawn where it is.
 *
 * Against the Auth emulator nothing is actually delivered; the link is printed
 * to the emulator log and listed in the Emulator UI. See `docs/demo.md`.
 */
export async function requestEmailVerification(user: User): Promise<void> {
  try {
    await sendEmailVerification(user);
  } catch (error) {
    // Rate limiting is the expected failure here — Firebase refuses repeated
    // sends to the same address in quick succession, which is correct
    // behaviour and not something to surface as an error.
    logger.warn('authService', 'Could not send the verification email', {
      userId: user.uid,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Re-read the account and refresh the ID token.
 *
 * **The non-obvious part of this whole feature.** Clicking the verification link
 * changes the account on Firebase's side, but the app is holding an ID token
 * minted *before* that happened — and `email_verified` is a claim inside that
 * token, which is what the security rules read. Without a forced refresh the
 * user verifies, returns to the app, and is still refused, with no way to tell
 * why. `reload()` updates `user.emailVerified` locally; `getIdToken(true)` is
 * what makes the rules agree.
 *
 * @returns Whether the address is now confirmed.
 */
export async function refreshEmailVerification(): Promise<boolean> {
  const user = getFirebaseAuth().currentUser;
  if (user === null) {
    return false;
  }

  try {
    await user.reload();
    // Order matters: reload first so the refreshed token carries the new claim.
    await user.getIdToken(true);
    return user.emailVerified;
  } catch (error) {
    logger.warn('authService', 'Could not refresh the verification state', {
      userId: user.uid,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return user.emailVerified;
  }
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
