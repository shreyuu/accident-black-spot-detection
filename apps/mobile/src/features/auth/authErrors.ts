import { FirebaseError } from 'firebase/app';

import { AppError, type AppErrorKind } from '@/utils/errors';

/**
 * Translate Firebase Auth error codes into messages worth showing a user.
 *
 * Firebase's own messages are written for developers ("Firebase: Error
 * (auth/invalid-credential).") and are not fit to display. This is the single
 * place that mapping happens.
 *
 * ## Deliberate choice: no account enumeration
 *
 * `auth/user-not-found` and `auth/wrong-password` both produce the *same*
 * message. Distinguishing them would turn the sign-in form into an oracle for
 * "does this email have an account here?" — a real privacy problem for an app
 * that records road incidents and crime reports, where knowing someone is a user
 * is itself sensitive. Modern Firebase projects return the merged
 * `auth/invalid-credential` code for this reason; the older codes are mapped
 * identically so behaviour does not depend on a project setting.
 */

interface Mapping {
  kind: AppErrorKind;
  message: string;
  retryable?: boolean;
}

const CODE_MAP: Record<string, Mapping> = {
  // --- Sign-in ---
  'auth/invalid-credential': {
    kind: 'auth',
    message: 'That email or password is incorrect. Please check and try again.',
  },
  'auth/wrong-password': {
    kind: 'auth',
    message: 'That email or password is incorrect. Please check and try again.',
  },
  'auth/user-not-found': {
    kind: 'auth',
    message: 'That email or password is incorrect. Please check and try again.',
  },
  'auth/invalid-email': {
    kind: 'validation',
    message: 'Enter a valid email address, for example name@example.com.',
  },
  'auth/user-disabled': {
    kind: 'auth',
    message: 'This account has been disabled. Please contact support.',
  },
  'auth/too-many-requests': {
    kind: 'unavailable',
    message: 'Too many attempts. Please wait a few minutes and try again.',
    retryable: false,
  },

  // --- Registration ---
  'auth/email-already-in-use': {
    kind: 'validation',
    message: 'An account already exists for that email address. Try signing in instead.',
  },
  'auth/weak-password': {
    kind: 'validation',
    message: 'Choose a stronger password — at least 8 characters with a letter and a number.',
  },
  'auth/operation-not-allowed': {
    kind: 'unavailable',
    message: 'Email sign-in is not enabled for this app. Please contact support.',
  },

  // --- Session / token ---
  'auth/requires-recent-login': {
    kind: 'auth',
    message: 'Please sign in again to continue.',
  },
  'auth/user-token-expired': {
    kind: 'auth',
    message: 'Your session has expired. Please sign in again.',
  },
  'auth/invalid-user-token': {
    kind: 'auth',
    message: 'Your session is no longer valid. Please sign in again.',
  },

  // --- Connectivity ---
  'auth/network-request-failed': {
    kind: 'network',
    message: 'No internet connection. Check your network and try again.',
    retryable: true,
  },
  'auth/internal-error': {
    kind: 'unavailable',
    message: 'The sign-in service is temporarily unavailable. Please try again shortly.',
    retryable: true,
  },
};

const FALLBACK: Mapping = {
  kind: 'unknown',
  message: 'Something went wrong. Please try again.',
};

/**
 * Convert any thrown value from a Firebase Auth call into an `AppError`.
 *
 * Non-Firebase errors fall through to the generic fallback rather than being
 * rethrown, so an auth screen always has something safe to render.
 */
export function mapFirebaseAuthError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof FirebaseError) {
    const mapping = CODE_MAP[error.code] ?? FALLBACK;
    return new AppError(mapping.kind, mapping.message, {
      ...(mapping.retryable === undefined ? {} : { retryable: mapping.retryable }),
      cause: error,
      // The raw code is kept for logs only — never rendered.
      technicalMessage: `${error.code}: ${error.message}`,
    });
  }

  return new AppError(FALLBACK.kind, FALLBACK.message, {
    cause: error,
    technicalMessage: error instanceof Error ? error.message : 'Unknown auth failure.',
  });
}

/** Exposed for tests so the mapping table stays in sync with expectations. */
export const __authErrorCodes = Object.keys(CODE_MAP);
