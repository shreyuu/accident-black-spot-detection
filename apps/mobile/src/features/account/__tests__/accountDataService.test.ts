import { httpsCallable } from 'firebase/functions';

import {
  deleteAccount,
  deleteAccountWithPassword,
  exportMyData,
} from '@/features/account/accountDataService';
import { confirmPassword, logout } from '@/features/auth/authService';
import { AppError } from '@/utils/errors';

jest.mock('@/features/auth/authService', () => ({
  confirmPassword: jest.fn(),
  logout: jest.fn(),
}));

const mockedConfirmPassword = jest.mocked(confirmPassword);
const mockedLogout = jest.mocked(logout);

jest.mock('@/services/firebase/app', () => ({
  getFirebaseFunctions: () => ({}),
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(),
}));

const mockedHttpsCallable = jest.mocked(httpsCallable);

/** A callable that resolves with `data`. */
function resolves(data: unknown) {
  const call = jest.fn().mockResolvedValue({ data });
  mockedHttpsCallable.mockReturnValue(call as never);
  return call;
}

/** A callable that rejects with a Firebase Functions error code. */
function rejectsWith(code: string) {
  const error = Object.assign(new Error(code), { code });
  mockedHttpsCallable.mockReturnValue(jest.fn().mockRejectedValue(error) as never);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deleteAccount', () => {
  it('calls the function with no arguments at all', async () => {
    // The uid is derived server-side from the verified token. Sending one would
    // make this a request to delete *some* account rather than *this* one, and
    // the function would be one validation slip away from honouring it.
    const call = resolves({ documentsDeleted: 4, reportsAnonymised: 1, imagesDeleted: 2 });

    await deleteAccount();

    expect(mockedHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'deleteAccount');
    expect(call).toHaveBeenCalledWith({});
  });

  it('returns what was removed', async () => {
    resolves({ documentsDeleted: 4, reportsAnonymised: 1, imagesDeleted: 2 });

    await expect(deleteAccount()).resolves.toEqual({
      documentsDeleted: 4,
      reportsAnonymised: 1,
      imagesDeleted: 2,
    });
  });

  it('does not offer a retry when the session has expired', async () => {
    rejectsWith('functions/unauthenticated');

    await expect(deleteAccount()).rejects.toMatchObject({
      kind: 'auth',
      retryable: false,
      userMessage: expect.stringMatching(/sign in again/i),
    });
  });

  it('reports a connectivity failure as retryable, not as a deletion failure', async () => {
    // The distinction matters: "we could not reach the server" must not read as
    // "your account is in a half-deleted state".
    rejectsWith('functions/unavailable');

    await expect(deleteAccount()).rejects.toMatchObject({
      kind: 'network',
      retryable: true,
      userMessage: expect.stringMatching(/offline/i),
    });
  });

  it('wraps an unrecognised failure rather than leaking it to the UI', async () => {
    rejectsWith('functions/internal');

    const error = await deleteAccount().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).userMessage).not.toContain('functions/');
  });
});

describe('exportMyData', () => {
  it('returns pretty-printed JSON, because a person reads it', async () => {
    resolves({ format: 'v1', reports: [{ id: 'r1' }] });

    const json = await exportMyData();

    expect(json).toContain('\n');
    expect(JSON.parse(json)).toEqual({ format: 'v1', reports: [{ id: 'r1' }] });
  });

  it('calls the right function with no arguments', async () => {
    const call = resolves({});

    await exportMyData();

    expect(mockedHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'exportMyData');
    expect(call).toHaveBeenCalledWith({});
  });

  it('surfaces a failure as an AppError', async () => {
    rejectsWith('functions/deadline-exceeded');

    await expect(exportMyData()).rejects.toBeInstanceOf(AppError);
  });
});

describe('deleteAccount and a stale sign-in', () => {
  it('asks for the password again when the server wants a recent sign-in', async () => {
    rejectsWith('functions/failed-precondition');

    await expect(deleteAccount()).rejects.toMatchObject({
      kind: 'auth',
      retryable: false,
      userMessage: expect.stringMatching(/password/i),
    });
  });
});

describe('deleteAccountWithPassword', () => {
  const SUMMARY = { documentsDeleted: 4, reportsAnonymised: 1, imagesDeleted: 2 };

  it('confirms the password before anything is deleted', async () => {
    const order: string[] = [];
    mockedConfirmPassword.mockImplementation(async () => {
      order.push('confirm');
    });
    const call = jest.fn().mockImplementation(async () => {
      order.push('delete');
      return { data: SUMMARY };
    });
    mockedHttpsCallable.mockReturnValue(call as never);

    await deleteAccountWithPassword('correct horse');

    expect(mockedConfirmPassword).toHaveBeenCalledWith('correct horse');
    expect(order).toEqual(['confirm', 'delete']);
  });

  it('deletes nothing when the password is wrong', async () => {
    mockedConfirmPassword.mockRejectedValue(
      new AppError('auth', 'Those details were not recognised.'),
    );
    const call = resolves(SUMMARY);

    await expect(deleteAccountWithPassword('wrong')).rejects.toMatchObject({ kind: 'auth' });
    expect(call).not.toHaveBeenCalled();
  });

  it('signs out locally once the account is gone', async () => {
    // The ID token outlives the Auth record by up to an hour. Without a local
    // sign-out the draft queue and the background task kept writing under the
    // deleted uid — data the user had just been told was erased.
    mockedConfirmPassword.mockResolvedValue(undefined);
    resolves(SUMMARY);

    await expect(deleteAccountWithPassword('correct horse')).resolves.toEqual(SUMMARY);
    expect(mockedLogout).toHaveBeenCalledTimes(1);
  });

  it('still reports success if the local sign-out fails afterwards', async () => {
    mockedConfirmPassword.mockResolvedValue(undefined);
    mockedLogout.mockRejectedValue(new Error('offline'));
    resolves(SUMMARY);

    await expect(deleteAccountWithPassword('correct horse')).resolves.toEqual(SUMMARY);
  });

  it('does not sign out when deletion failed', async () => {
    mockedConfirmPassword.mockResolvedValue(undefined);
    rejectsWith('functions/internal');

    await expect(deleteAccountWithPassword('correct horse')).rejects.toBeInstanceOf(AppError);
    expect(mockedLogout).not.toHaveBeenCalled();
  });
});
