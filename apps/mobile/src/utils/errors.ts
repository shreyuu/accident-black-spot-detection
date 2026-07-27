/**
 * Error normalisation.
 *
 * Failures reach the UI from many places — Firebase, `fetch`, permission APIs,
 * plain `throw` — in inconsistent shapes. Screens should never have to
 * introspect those shapes to decide what to render, so everything is funnelled
 * into `AppError` with a message that is safe and useful to show a user.
 */

/** Broad failure categories, used to choose retry affordances and copy. */
export type AppErrorKind =
  'network' | 'permission' | 'auth' | 'validation' | 'not-found' | 'unavailable' | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  /** Copy intended for display. Never contains internals or stack details. */
  readonly userMessage: string;
  /** Whether offering the user a "Try again" action makes sense. */
  readonly retryable: boolean;
  /** Original throw site, kept for logging — never rendered. */
  override readonly cause?: unknown;

  constructor(
    kind: AppErrorKind,
    userMessage: string,
    options?: { retryable?: boolean; cause?: unknown; technicalMessage?: string },
  ) {
    super(options?.technicalMessage ?? userMessage);
    this.name = 'AppError';
    this.kind = kind;
    this.userMessage = userMessage;
    // The parentheses are load-bearing. Written without them this binds as
    // `(options?.retryable ?? isNetwork) || isUnavailable`, which silently
    // overrides an explicit `retryable: false` whenever the kind is
    // 'unavailable' — so a rate-limited user would be offered a "Try again"
    // button that just hammers the lockout. An explicit value must always win.
    this.retryable = options?.retryable ?? (kind === 'network' || kind === 'unavailable');
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Coerce any thrown value into an `AppError`.
 *
 * Note that a raw `Error.message` is never surfaced as `userMessage` — library
 * messages leak internals and read badly. Callers that know the domain should
 * construct `AppError` directly with proper copy; this is the safety net.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof TypeError && /network|fetch/i.test(error.message)) {
    return new AppError('network', 'No internet connection. Check your network and try again.', {
      retryable: true,
      cause: error,
      technicalMessage: error.message,
    });
  }

  if (error instanceof Error) {
    return new AppError('unknown', FALLBACK_MESSAGE, {
      cause: error,
      technicalMessage: error.message,
    });
  }

  return new AppError('unknown', FALLBACK_MESSAGE, {
    cause: error,
    technicalMessage: typeof error === 'string' ? error : 'Non-Error value thrown.',
  });
}

/** Display copy for any thrown value. */
export function getUserMessage(error: unknown): string {
  return toAppError(error).userMessage;
}
