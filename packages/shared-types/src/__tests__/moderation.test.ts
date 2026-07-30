import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildReportModerationWrite,
  evaluateModerationDecision,
  findDisallowedModerationFields,
  MODERATION_NOTE_MAX_LENGTH,
  type ModerationContext,
} from '../moderation.ts';

/**
 * The rule this file protects: nobody decides their own report, and a moderation
 * write cannot touch the report's content. Both are checked in the Firestore
 * rules too — these tests cover the copy that guards the Admin SDK, which
 * bypasses those rules entirely.
 */

function context(overrides: Partial<ModerationContext> = {}): ModerationContext {
  return {
    actorId: 'moderator-1',
    actorRole: 'moderator',
    reporterId: 'reporter-1',
    currentStatus: 'pending',
    decision: 'approved',
    ...overrides,
  };
}

describe('evaluateModerationDecision', () => {
  it('allows a moderator to approve somebody else’s pending report', () => {
    assert.deepEqual(evaluateModerationDecision(context()), { allowed: true });
  });

  it('allows an admin to approve as well', () => {
    assert.deepEqual(evaluateModerationDecision(context({ actorRole: 'admin' })), {
      allowed: true,
    });
  });

  it('allows a rejection that carries an explanation', () => {
    const result = evaluateModerationDecision(
      context({ decision: 'rejected', notes: 'Already recorded at this junction.' }),
    );
    assert.deepEqual(result, { allowed: true });
  });

  describe('the self-approval rule', () => {
    it('refuses a moderator deciding their own report', () => {
      const result = evaluateModerationDecision(
        context({ actorId: 'same-person', reporterId: 'same-person' }),
      );
      assert.deepEqual(result, { allowed: false, reason: 'own-report' });
    });

    it('refuses an admin deciding their own report, with no override', () => {
      // Being trusted with the dashboard does not make someone impartial about
      // their own submission.
      const result = evaluateModerationDecision(
        context({ actorRole: 'admin', actorId: 'same-person', reporterId: 'same-person' }),
      );
      assert.deepEqual(result, { allowed: false, reason: 'own-report' });
    });

    it('refuses self-rejection too, not just self-approval', () => {
      const result = evaluateModerationDecision(
        context({
          actorId: 'same-person',
          reporterId: 'same-person',
          decision: 'rejected',
          notes: 'Withdrawing my own report.',
        }),
      );
      assert.deepEqual(result, { allowed: false, reason: 'own-report' });
    });
  });

  describe('role', () => {
    it('refuses a plain user', () => {
      const result = evaluateModerationDecision(context({ actorRole: 'user' }));
      assert.deepEqual(result, { allowed: false, reason: 'not-a-moderator' });
    });

    it('refuses an account with no role claim at all', () => {
      for (const actorRole of [null, undefined] as const) {
        const result = evaluateModerationDecision(context({ actorRole }));
        assert.deepEqual(result, { allowed: false, reason: 'not-a-moderator' });
      }
    });

    it('reports the role problem before anything else', () => {
      // A plain user attacking their own report should be told they are not a
      // moderator, not given a hint about note formatting.
      const result = evaluateModerationDecision(
        context({
          actorRole: 'user',
          actorId: 'same',
          reporterId: 'same',
          decision: 'rejected',
        }),
      );
      assert.deepEqual(result, { allowed: false, reason: 'not-a-moderator' });
    });
  });

  describe('report state', () => {
    it('refuses re-deciding an approved report', () => {
      const result = evaluateModerationDecision(context({ currentStatus: 'approved' }));
      assert.deepEqual(result, { allowed: false, reason: 'already-decided' });
    });

    it('refuses re-deciding a rejected report', () => {
      const result = evaluateModerationDecision(
        context({ currentStatus: 'rejected', decision: 'approved' }),
      );
      assert.deepEqual(result, { allowed: false, reason: 'already-decided' });
    });

    it('refuses deciding a draft', () => {
      const result = evaluateModerationDecision(context({ currentStatus: 'draft' }));
      assert.deepEqual(result, { allowed: false, reason: 'already-decided' });
    });
  });

  describe('the rejection note', () => {
    it('is required, because the reporter reads it', () => {
      const result = evaluateModerationDecision(context({ decision: 'rejected' }));
      assert.deepEqual(result, { allowed: false, reason: 'missing-rejection-note' });
    });

    it('is not satisfied by whitespace', () => {
      const result = evaluateModerationDecision(
        context({ decision: 'rejected', notes: '   \n  ' }),
      );
      assert.deepEqual(result, { allowed: false, reason: 'missing-rejection-note' });
    });

    it('is not required to approve', () => {
      assert.deepEqual(evaluateModerationDecision(context({ decision: 'approved' })), {
        allowed: true,
      });
    });

    it('is bounded', () => {
      const result = evaluateModerationDecision(
        context({ decision: 'rejected', notes: 'x'.repeat(MODERATION_NOTE_MAX_LENGTH + 1) }),
      );
      assert.deepEqual(result, { allowed: false, reason: 'note-too-long' });
    });

    it('accepts a note exactly at the bound', () => {
      const result = evaluateModerationDecision(
        context({ decision: 'rejected', notes: 'x'.repeat(MODERATION_NOTE_MAX_LENGTH) }),
      );
      assert.deepEqual(result, { allowed: true });
    });
  });

  it('refuses an unattributable actor', () => {
    const result = evaluateModerationDecision(context({ actorId: '   ' }));
    assert.deepEqual(result, { allowed: false, reason: 'unknown-actor' });
  });
});

describe('buildReportModerationWrite', () => {
  it('writes the decision and who made it', () => {
    const write = buildReportModerationWrite({ actorId: 'mod-1', decision: 'approved' });
    assert.equal(write.status, 'approved');
    assert.equal(write.reviewedBy, 'mod-1');
  });

  it('omits the note entirely when there is none', () => {
    // Omitted rather than undefined: Firestore rejects an explicit undefined.
    const write = buildReportModerationWrite({ actorId: 'mod-1', decision: 'approved' });
    assert.equal('moderationNotes' in write, false);
  });

  it('trims the note', () => {
    const write = buildReportModerationWrite({
      actorId: 'mod-1',
      decision: 'rejected',
      notes: '  duplicate  ',
    });
    assert.equal(write.moderationNotes, 'duplicate');
  });

  it('cannot be made to write a report’s content fields', () => {
    // The payload is assembled field by field, so extra input has nowhere to go.
    const write = buildReportModerationWrite({
      actorId: 'mod-1',
      decision: 'approved',
      ...({ description: 'rewritten', latitude: 0, imageUrls: [] } as object),
    });

    assert.deepEqual(Object.keys(write).sort(), ['reviewedBy', 'status']);
  });

  it('never writes a timestamp itself', () => {
    // The caller supplies server timestamps; a workstation clock must not date
    // the audit trail.
    const write = buildReportModerationWrite({ actorId: 'mod-1', decision: 'approved' });
    assert.equal('reviewedAt' in write, false);
    assert.equal('updatedAt' in write, false);
  });
});

describe('findDisallowedModerationFields', () => {
  it('passes a legitimate moderation payload', () => {
    const disallowed = findDisallowedModerationFields({
      status: 'approved',
      reviewedBy: 'mod-1',
      reviewedAt: 'server-timestamp',
      updatedAt: 'server-timestamp',
      moderationNotes: 'fine',
    });
    assert.deepEqual(disallowed, []);
  });

  it('names any content field that slipped in', () => {
    const disallowed = findDisallowedModerationFields({
      status: 'approved',
      description: 'rewritten',
      latitude: 51,
    });
    assert.deepEqual(disallowed.sort(), ['description', 'latitude']);
  });

  it('catches an attempt to reassign the reporter', () => {
    assert.deepEqual(findDisallowedModerationFields({ reporterId: 'someone-else' }), [
      'reporterId',
    ]);
  });
});
