import { httpsCallable, type FunctionsError } from 'firebase/functions';

import { getFirebaseFunctions } from '@/services/firebase/app';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Account deletion and data export (Phase 12).
 *
 * Both are callable Cloud Functions rather than client work, and not for
 * convenience: the Firestore rules deny a client `delete` on its own reports,
 * its alert logs and its own profile, and deny it entirely on Storage objects.
 * That is deliberate — a report a black spot depends on must not be withdrawable
 * by whoever filed it — and it means erasure has to run under a credential that
 * bypasses those rules. See `functions/src/deleteAccount.ts`.
 *
 * This module is the app's whole surface onto those functions. It converts the
 * callable's error codes into `AppError`s the UI already knows how to render,
 * and it does nothing else: no confirmation, no navigation, no state. Those
 * belong to the screen.
 */

const DELETE_ACCOUNT = 'deleteAccount';
const EXPORT_MY_DATA = 'exportMyData';

export interface AccountDeletionSummary {
  documentsDeleted: number;
  reportsAnonymised: number;
  imagesDeleted: number;
}

/** Callable error codes, mapped to copy and a sensible retry offer. */
function toCallableError(error: unknown, operation: string): AppError {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as FunctionsError).code)
      : '';

  if (code.includes('unauthenticated')) {
    return new AppError('auth', 'Please sign in again and retry.', {
      retryable: false,
      cause: error,
      technicalMessage: `${operation}: ${code}`,
    });
  }

  if (code.includes('deadline-exceeded') || code.includes('unavailable')) {
    return new AppError(
      'network',
      'That could not be completed — you may be offline. Please try again when you have a connection.',
      { retryable: true, cause: error, technicalMessage: `${operation}: ${code}` },
    );
  }

  return new AppError('unknown', 'That could not be completed. Please try again.', {
    retryable: true,
    cause: error,
    technicalMessage: `${operation}: ${code.length > 0 ? code : 'unknown'}`,
  });
}

/**
 * Delete the signed-in account and its data.
 *
 * **Irreversible.** The caller is responsible for confirming first; this
 * function does not ask.
 *
 * On success the Auth record no longer exists, so the SDK's auth state listener
 * fires and `AuthProvider` returns the app to the sign-in screen on its own.
 * There is deliberately no navigation here — a screen that pushed a route after
 * deleting the account would race that redirect.
 */
export async function deleteAccount(): Promise<AccountDeletionSummary> {
  try {
    const call = httpsCallable<Record<string, never>, AccountDeletionSummary>(
      getFirebaseFunctions(),
      DELETE_ACCOUNT,
    );

    // No arguments. The function derives the uid from the verified token, which
    // is what stops this being a way to delete somebody else's account.
    const result = await call({});

    logger.info('accountDataService', 'Account deleted');
    return result.data;
  } catch (error) {
    throw toCallableError(error, DELETE_ACCOUNT);
  }
}

/**
 * Everything held about the signed-in account, as a JSON string.
 *
 * Returned as text rather than written to a file so the caller can decide
 * between sharing it, saving it, or showing it. Pretty-printed because the
 * audience is a person reading their own data, not a parser.
 */
export async function exportMyData(): Promise<string> {
  try {
    const call = httpsCallable<Record<string, never>, unknown>(
      getFirebaseFunctions(),
      EXPORT_MY_DATA,
    );

    const result = await call({});
    return JSON.stringify(result.data, null, 2);
  } catch (error) {
    throw toCallableError(error, EXPORT_MY_DATA);
  }
}
