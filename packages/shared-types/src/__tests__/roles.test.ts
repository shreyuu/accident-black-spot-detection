import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAuditDetails,
  canAccessDashboard,
  canManageBlackSpots,
  canManageRoles,
  canModerateReports,
  DEFAULT_ROLE,
  isUserRole,
  normaliseAuditSummary,
  USER_ROLES,
  AUDIT_DETAIL_VALUE_MAX_LENGTH,
  AUDIT_SUMMARY_MAX_LENGTH,
} from '../index.ts';

describe('roles', () => {
  it('starts every account as a plain user', () => {
    assert.equal(DEFAULT_ROLE, 'user');
  });

  it('recognises only the known roles', () => {
    for (const role of USER_ROLES) {
      assert.equal(isUserRole(role), true);
    }
    for (const notARole of ['superuser', 'Admin', '', null, undefined, 7, {}]) {
      assert.equal(isUserRole(notARole), false);
    }
  });

  describe('dashboard access', () => {
    it('admits moderators and admins', () => {
      assert.equal(canAccessDashboard('moderator'), true);
      assert.equal(canAccessDashboard('admin'), true);
    });

    it('refuses plain users and unauthenticated callers', () => {
      assert.equal(canAccessDashboard('user'), false);
      assert.equal(canAccessDashboard(null), false);
      assert.equal(canAccessDashboard(undefined), false);
    });
  });

  describe('moderating reports', () => {
    it('is open to moderators and admins only', () => {
      assert.equal(canModerateReports('moderator'), true);
      assert.equal(canModerateReports('admin'), true);
      assert.equal(canModerateReports('user'), false);
      assert.equal(canModerateReports(null), false);
    });
  });

  describe('managing black spots', () => {
    /**
     * Publishing a black spot puts a warning in front of every user near a
     * location, which is a bigger act than accepting one report — so it takes a
     * higher role. If this ever equalises with moderation, that should be a
     * deliberate decision, not a drift.
     */
    it('is admin-only, deliberately stricter than moderation', () => {
      assert.equal(canManageBlackSpots('admin'), true);
      assert.equal(canManageBlackSpots('moderator'), false);
      assert.equal(canManageBlackSpots('user'), false);
      assert.equal(canManageBlackSpots(null), false);
    });
  });

  describe('managing roles', () => {
    it('is admin-only', () => {
      assert.equal(canManageRoles('admin'), true);
      assert.equal(canManageRoles('moderator'), false);
      assert.equal(canManageRoles('user'), false);
    });
  });
});

describe('buildAuditDetails', () => {
  it('keeps scalars', () => {
    assert.deepEqual(buildAuditDetails({ decision: 'approved', count: 3, verified: true }), {
      decision: 'approved',
      count: 3,
      verified: true,
    });
  });

  it('drops anything that is not a scalar', () => {
    // An object spread into the log would quietly reintroduce the reporter's
    // free text or coordinates, which the audit trail deliberately does not hold.
    const details = buildAuditDetails({
      keep: 'yes',
      nested: { description: 'a long report body', latitude: 51.5 },
      list: ['a', 'b'],
      nothing: null,
      absent: undefined,
    });
    assert.deepEqual(details, { keep: 'yes' });
  });

  it('drops non-finite numbers', () => {
    assert.deepEqual(buildAuditDetails({ a: Number.NaN, b: Number.POSITIVE_INFINITY }), {});
  });

  it('truncates a long string so free text cannot be smuggled in on a scalar key', () => {
    const details = buildAuditDetails({ note: 'x'.repeat(500) });
    assert.equal(details.note, 'x'.repeat(AUDIT_DETAIL_VALUE_MAX_LENGTH));
  });

  it('returns an empty object for no input', () => {
    assert.deepEqual(buildAuditDetails(undefined), {});
  });
});

describe('normaliseAuditSummary', () => {
  it('trims and bounds', () => {
    assert.equal(normaliseAuditSummary('  hello  '), 'hello');
    assert.equal(
      normaliseAuditSummary('x'.repeat(AUDIT_SUMMARY_MAX_LENGTH + 50)).length,
      AUDIT_SUMMARY_MAX_LENGTH,
    );
  });
});
