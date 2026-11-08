import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dashboardRoleFromClaims, evaluateSessionRequest } from '../sessionPolicy.ts';

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const FRESH = Math.floor(NOW / 1000) - 30;

describe('dashboardRoleFromClaims', () => {
  it('reads the role claim of a verified account', () => {
    assert.equal(dashboardRoleFromClaims({ role: 'moderator', email_verified: true }), 'moderator');
  });

  it('treats an unverified account as a plain user, whatever its claim says', () => {
    assert.equal(dashboardRoleFromClaims({ role: 'admin', email_verified: false }), 'user');
    assert.equal(dashboardRoleFromClaims({ role: 'admin' }), 'user');
  });

  it('treats an unknown role as a plain user', () => {
    assert.equal(dashboardRoleFromClaims({ role: 'superuser', email_verified: true }), 'user');
  });
});

describe('evaluateSessionRequest', () => {
  it('admits a fresh, verified moderator', () => {
    assert.deepEqual(
      evaluateSessionRequest({ role: 'moderator', email_verified: true, auth_time: FRESH }, NOW),
      { ok: true, role: 'moderator' },
    );
  });

  it('refuses an account whose email is not verified, even with a role claim', () => {
    const result = evaluateSessionRequest(
      { role: 'admin', email_verified: false, auth_time: FRESH },
      NOW,
    );
    assert.deepEqual(result, { ok: false, reason: 'email-unverified' });
  });

  it('refuses a plain user', () => {
    const result = evaluateSessionRequest(
      { role: 'user', email_verified: true, auth_time: FRESH },
      NOW,
    );
    assert.deepEqual(result, { ok: false, reason: 'not-staff' });
  });

  it('refuses a sign-in older than five minutes', () => {
    const result = evaluateSessionRequest(
      { role: 'admin', email_verified: true, auth_time: FRESH - 6 * 60 },
      NOW,
    );
    assert.deepEqual(result, { ok: false, reason: 'stale-sign-in' });
  });
});
