import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { secretsBlockingLanMode } from '../lanSafety.mjs';

/**
 * `npm run emulators:lan` binds every emulator to 0.0.0.0, Functions included.
 * The Functions emulator loads `functions/.secret.local` — where
 * `functions/.env.example` tells a developer to put a real Places key — so on a
 * shared network anyone could call the proxy and spend that key, and the Auth
 * emulator hands out tokens to anyone (SECURITY_AUDIT.md L8).
 */
describe('secretsBlockingLanMode', () => {
  it('blocks LAN mode while a real secret file is present', () => {
    const present = new Set(['/repo/functions/.secret.local']);
    assert.deepEqual(
      secretsBlockingLanMode('/repo', (path) => present.has(path)),
      ['functions/.secret.local'],
    );
  });

  it('allows LAN mode when no secret file exists', () => {
    assert.deepEqual(
      secretsBlockingLanMode('/repo', () => false),
      [],
    );
  });
});
