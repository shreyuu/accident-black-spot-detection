import { AppError, getUserMessage, toAppError } from '@/utils/errors';

describe('AppError', () => {
  it('marks network failures retryable by default', () => {
    expect(new AppError('network', 'Offline.').retryable).toBe(true);
  });

  it('marks permission failures non-retryable, since retrying cannot help', () => {
    expect(new AppError('permission', 'Location denied.').retryable).toBe(false);
  });

  it('lets the caller override retryability', () => {
    expect(new AppError('validation', 'Bad input.', { retryable: true }).retryable).toBe(true);
  });

  /**
   * Regression test.
   *
   * `unavailable` defaults to retryable, so an explicit `retryable: false` has to
   * beat that default. It previously did not: the expression computing
   * `retryable` bound as `(explicit ?? isNetwork) || isUnavailable`, so `false`
   * was silently promoted back to `true` for this kind.
   *
   * The visible consequence was a rate-limited sign-in ("too many attempts, wait
   * a few minutes") rendering a "Try again" button, inviting the user to keep
   * hitting a lockout that only clears with time.
   */
  it('honours an explicit retryable:false even for kinds that default to retryable', () => {
    expect(new AppError('unavailable', 'Rate limited.', { retryable: false }).retryable).toBe(
      false,
    );
    expect(new AppError('network', 'Rate limited.', { retryable: false }).retryable).toBe(false);
  });

  it('still defaults network and unavailable to retryable when unspecified', () => {
    expect(new AppError('network', 'Offline.').retryable).toBe(true);
    expect(new AppError('unavailable', 'Down.').retryable).toBe(true);
  });

  it('keeps the technical message separate from the user-facing one', () => {
    const error = new AppError('unknown', 'Something went wrong.', {
      technicalMessage: 'FIRESTORE INTERNAL ASSERTION FAILED',
    });

    expect(error.userMessage).toBe('Something went wrong.');
    expect(error.message).toBe('FIRESTORE INTERNAL ASSERTION FAILED');
  });
});

describe('toAppError', () => {
  it('returns an existing AppError unchanged', () => {
    const original = new AppError('auth', 'Please sign in again.');
    expect(toAppError(original)).toBe(original);
  });

  it('classifies a fetch TypeError as a retryable network error', () => {
    const result = toAppError(new TypeError('Network request failed'));

    expect(result.kind).toBe('network');
    expect(result.retryable).toBe(true);
  });

  it('does not leak a library error message into the UI', () => {
    const result = toAppError(new Error('ERR_INTERNAL_ASSERTION_FAILED: Unexpected state'));

    expect(result.userMessage).toBe('Something went wrong. Please try again.');
    expect(result.message).toBe('ERR_INTERNAL_ASSERTION_FAILED: Unexpected state');
  });

  it('handles a thrown string', () => {
    const result = toAppError('boom');

    expect(result.kind).toBe('unknown');
    expect(result.message).toBe('boom');
  });

  it.each([undefined, null, 42, { code: 'x' }])('handles the non-Error value %p', (value) => {
    expect(() => toAppError(value)).not.toThrow();
    expect(toAppError(value).userMessage).toBe('Something went wrong. Please try again.');
  });

  it('preserves the original value as the cause for logging', () => {
    const cause = new Error('root cause');
    expect(toAppError(cause).cause).toBe(cause);
  });
});

describe('getUserMessage', () => {
  it('returns display copy for any thrown value', () => {
    expect(getUserMessage(new AppError('network', 'Offline.'))).toBe('Offline.');
    expect(getUserMessage(null)).toBe('Something went wrong. Please try again.');
  });
});
