import * as SecureStore from 'expo-secure-store';

import { secureAuthStorage } from '@/services/firebase/secureAuthStorage';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

describe('secureAuthStorage keychain accessibility', () => {
  /**
   * The default is `WHEN_UNLOCKED`. Background location relaunches the app
   * while the phone is locked; the keychain read then fails, reads back as "no
   * stored session", and Firebase discards the session — so the app ran its
   * sign-out cleanup, stopping background warnings and deleting drafts, for a
   * user who never signed out (SECURITY_AUDIT.md B2).
   */
  it('stores the session so it can be read after first unlock, on this device only', async () => {
    await secureAuthStorage.setItem('firebase:authUser:key:[DEFAULT]', '{"uid":"u1"}');

    const calls = jest.mocked(SecureStore.setItemAsync).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [, , options] of calls) {
      expect(options).toEqual(
        expect.objectContaining({
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        }),
      );
    }
  });

  it('round-trips a value', async () => {
    await secureAuthStorage.setItem('k', 'value');
    await expect(secureAuthStorage.getItem('k')).resolves.toBe('value');
  });
});
