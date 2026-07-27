import { FirebaseError } from 'firebase/app';

import { mapFirebaseAuthError, __authErrorCodes } from '@/features/auth/authErrors';
import { AppError } from '@/utils/errors';

function firebaseError(code: string): FirebaseError {
  return new FirebaseError(code, `Firebase: Error (${code}).`);
}

describe('mapFirebaseAuthError', () => {
  it('passes an existing AppError through unchanged', () => {
    const original = new AppError('auth', 'Already mapped.');
    expect(mapFirebaseAuthError(original)).toBe(original);
  });

  /**
   * The most important property in this file.
   *
   * Distinguishing "no such account" from "wrong password" would let anyone use
   * the sign-in form to test whether a given email address belongs to a user of
   * this app. For an app that records road incidents and crime reports, merely
   * being a user is sensitive, so all three codes must be indistinguishable.
   */
  it('does not allow account enumeration through sign-in errors', () => {
    const messages = ['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential'].map(
      (code) => mapFirebaseAuthError(firebaseError(code)).userMessage,
    );

    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toBe('That email or password is incorrect. Please check and try again.');
  });

  it('tells a returning user that an account already exists on registration', () => {
    const mapped = mapFirebaseAuthError(firebaseError('auth/email-already-in-use'));

    expect(mapped.kind).toBe('validation');
    expect(mapped.userMessage).toMatch(/already exists/i);
  });

  it('classifies a network failure as retryable', () => {
    const mapped = mapFirebaseAuthError(firebaseError('auth/network-request-failed'));

    expect(mapped.kind).toBe('network');
    expect(mapped.retryable).toBe(true);
  });

  /**
   * Rate limiting must NOT be retryable: offering "Try again" would encourage
   * the user to hammer a lockout that only clears with time.
   */
  it('marks rate limiting as non-retryable', () => {
    const mapped = mapFirebaseAuthError(firebaseError('auth/too-many-requests'));

    expect(mapped.retryable).toBe(false);
    expect(mapped.userMessage).toMatch(/wait a few minutes/i);
  });

  it('keeps the Firebase code out of the user-facing message', () => {
    for (const code of __authErrorCodes) {
      const mapped = mapFirebaseAuthError(firebaseError(code));

      expect(mapped.userMessage).not.toContain('auth/');
      expect(mapped.userMessage).not.toContain('Firebase');
      // ...but it is retained for logs.
      expect(mapped.message).toContain(code);
    }
  });

  it('gives every mapped code a non-empty, sentence-like message', () => {
    for (const code of __authErrorCodes) {
      const { userMessage } = mapFirebaseAuthError(firebaseError(code));

      expect(userMessage.length).toBeGreaterThan(10);
      expect(userMessage).toMatch(/[.!?]$/);
    }
  });

  it('falls back safely for an unrecognised Firebase code', () => {
    const mapped = mapFirebaseAuthError(firebaseError('auth/some-future-code'));

    expect(mapped.kind).toBe('unknown');
    expect(mapped.userMessage).toBe('Something went wrong. Please try again.');
  });

  it.each([undefined, null, 'a string', 42, new Error('plain')])(
    'handles the non-Firebase value %p without throwing',
    (value) => {
      expect(() => mapFirebaseAuthError(value)).not.toThrow();
      expect(mapFirebaseAuthError(value).userMessage).toBe(
        'Something went wrong. Please try again.',
      );
    },
  );
});
