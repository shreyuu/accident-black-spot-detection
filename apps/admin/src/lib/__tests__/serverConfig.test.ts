import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseServerEnv } from '../serverConfig.ts';

const EMULATORS = {
  FIREBASE_PROJECT_ID: 'demo-accident-black-spot-detection',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
};

const REAL = { FIREBASE_PROJECT_ID: 'my-real-project' };

describe('parseServerEnv — the reporter salt', () => {
  /**
   * Without a configured salt the pseudonyms were salted with a constant
   * published in this repository, so anyone holding a list of uids — role
   * changes put them in the audit log — could recompute which reporter filed
   * what (SECURITY_AUDIT.md L5). The comment in `reporterPrivacy.ts` claimed a
   * warning that did not exist.
   */
  it('refuses to start against a real project without one', () => {
    assert.throws(() => parseServerEnv(REAL), /REPORTER_SALT/);
  });

  it('refuses a short salt against a real project', () => {
    assert.throws(() => parseServerEnv({ ...REAL, REPORTER_SALT: 'short' }), /REPORTER_SALT/);
  });

  it('accepts a long salt against a real project', () => {
    const salt = 's'.repeat(32);
    assert.equal(parseServerEnv({ ...REAL, REPORTER_SALT: salt }).reporterSalt, salt);
  });

  it('keeps the development default against the emulators', () => {
    const env = parseServerEnv(EMULATORS);
    assert.equal(env.usingEmulators, true);
    assert.equal(env.reporterSalt, 'development-reporter-salt');
  });
});

describe('parseServerEnv — emulator hosts', () => {
  it('refuses a half-emulated configuration', () => {
    assert.throws(
      () =>
        parseServerEnv({
          ...EMULATORS,
          FIRESTORE_EMULATOR_HOST: undefined,
          REPORTER_SALT: 's'.repeat(32),
        }),
      /must be set together/,
    );
  });
});
