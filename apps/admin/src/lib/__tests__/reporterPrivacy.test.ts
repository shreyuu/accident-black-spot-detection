import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildReporterPseudonym, reporterLabel, toPublicReporter } from '../reporterPrivacy.ts';

/**
 * The dashboard half of "reporter identity is private".
 *
 * The Firestore rules half is `firebase/tests/privacy.test.mjs`. Neither alone
 * supports the claim: the rules cannot constrain the Admin SDK, which bypasses
 * them by design, and these tests cannot prove anything about a client's reach.
 * The two together cover both paths into a reporter's identity.
 */

const SALT = 'test-salt';

describe('buildReporterPseudonym', () => {
  it('never returns the uid it was given', () => {
    const uid = 'aVeryRealFirebaseUid123456789';
    const pseudonym = buildReporterPseudonym(uid, SALT);

    assert.notEqual(pseudonym, uid);
    assert.equal(uid.includes(pseudonym), false);
    assert.equal(pseudonym.includes(uid), false);
  });

  it('is stable, so a repeat reporter is recognisable across rows', () => {
    assert.equal(buildReporterPseudonym('uid-1', SALT), buildReporterPseudonym('uid-1', SALT));
  });

  it('distinguishes different reporters', () => {
    assert.notEqual(buildReporterPseudonym('uid-1', SALT), buildReporterPseudonym('uid-2', SALT));
  });

  it('changes with the salt, so one deployment’s labels do not transfer to another', () => {
    assert.notEqual(
      buildReporterPseudonym('uid-1', 'salt-a'),
      buildReporterPseudonym('uid-1', 'salt-b'),
    );
  });

  it('is short enough to read at a glance', () => {
    assert.match(buildReporterPseudonym('uid-1', SALT), /^[0-9a-f]{6}$/);
  });

  it('handles a missing reporter without inventing one', () => {
    assert.equal(buildReporterPseudonym('', SALT), 'unknown');
    assert.equal(reporterLabel('unknown'), 'Reporter unknown');
  });

  it('does not collide across a large set of uids', () => {
    // Six hex characters is 24 bits; collisions exist in principle. This checks
    // the label is usable at the scale this dashboard actually operates at.
    const pseudonyms = new Set(
      Array.from({ length: 500 }, (_, index) => buildReporterPseudonym(`uid-${index}`, SALT)),
    );

    assert.ok(pseudonyms.size > 490, `expected few collisions, got ${500 - pseudonyms.size}`);
  });
});

describe('toPublicReporter', () => {
  it('carries no uid at all', () => {
    // The decisive test. Whatever else changes, nothing resembling the uid may
    // appear in the object that crosses to the browser.
    const uid = 'reporterUid987654321';
    const result = toPublicReporter(uid, 'moderatorUid', SALT);

    assert.equal(JSON.stringify(result).includes(uid), false);
    assert.equal('reporterId' in result, false);
  });

  it('answers the self-approval question without exposing either uid', () => {
    const own = toPublicReporter('same-uid', 'same-uid', SALT);
    const other = toPublicReporter('their-uid', 'my-uid', SALT);

    assert.equal(own.isOwnReport, true);
    assert.equal(other.isOwnReport, false);
    assert.equal(JSON.stringify(other).includes('my-uid'), false);
  });

  it('does not treat a missing reporter as the signed-in moderator', () => {
    // An empty `reporterId` compared against an empty actor uid would otherwise
    // report `isOwnReport: true` and hide the controls on an unrelated report.
    assert.equal(toPublicReporter('', '', SALT).isOwnReport, false);
  });

  it('gives the moderator something to read', () => {
    assert.match(toPublicReporter('uid-1', 'other', SALT).label, /^Reporter [0-9a-f]{6}$/);
  });
});
