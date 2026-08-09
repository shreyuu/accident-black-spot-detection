import { after, before, beforeEach, describe, it } from 'node:test';

import {
  asAnonymous,
  asModerator,
  asRolelessUser,
  asUnverifiedUser,
  asUser,
  assertFails,
  assertSucceeds,
  blackSpotFixture,
  contactFixture,
  createTestEnvironment,
  reportFixture,
  seed,
  serverTimestamp,
  submitReportBatch,
} from './helpers.mjs';

/**
 * Ownership boundaries, now covered automatically.
 *
 * Phases 5 and 6 verified these with throwaway scripts against a live emulator.
 * The properties they proved are the ones most likely to be broken by a careless
 * rule edit later — cross-user reads of report bodies and of other people's phone
 * numbers — so they are pinned here where a regression fails the build.
 */

let env;

before(async () => {
  env = await createTestEnvironment();
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

describe('incidentReports ownership', () => {
  beforeEach(async () => {
    await seed(env, 'incidentReports/mine', reportFixture({ reporterId: 'owner' }));
    await seed(env, 'incidentReports/theirs', reportFixture({ reporterId: 'somebody-else' }));
  });

  it('lets an author read their own report', async () => {
    await assertSucceeds(asUser(env, 'owner').doc('incidentReports/mine').get());
  });

  it('refuses reading another user’s report', async () => {
    await assertFails(asUser(env, 'owner').doc('incidentReports/theirs').get());
  });

  it('refuses listing the whole collection', async () => {
    const db = asUser(env, 'owner');
    await assertFails(db.collection('incidentReports').limit(10).get());
  });

  it('lets an author list only their own', async () => {
    const db = asUser(env, 'owner');
    await assertSucceeds(
      db.collection('incidentReports').where('reporterId', '==', 'owner').limit(10).get(),
    );
  });

  it('refuses a query filtered to somebody else’s reports', async () => {
    const db = asUser(env, 'owner');
    await assertFails(
      db.collection('incidentReports').where('reporterId', '==', 'somebody-else').limit(10).get(),
    );
  });

  it('refuses a query for every pending report', async () => {
    // The moderation queue shape. Available to the Admin SDK, never to a client.
    const db = asUser(env, 'owner');
    await assertFails(
      db.collection('incidentReports').where('status', '==', 'pending').limit(10).get(),
    );
  });

  describe('creation', () => {
    it('accepts a valid pending report from its author', async () => {
      const db = asUser(env, 'author');
      await assertSucceeds(submitReportBatch(db, { reporterId: 'author', reportId: 'fresh' }));
    });

    it('refuses a report created as approved', async () => {
      const db = asUser(env, 'author');
      await assertFails(
        submitReportBatch(db, {
          reporterId: 'author',
          reportId: 'sneaky',
          report: { status: 'approved' },
        }),
      );
    });

    it('refuses a report carrying moderation fields', async () => {
      const db = asUser(env, 'author');
      for (const extra of [
        { verified: true },
        { reviewedBy: 'author' },
        { reviewedAt: new Date() },
        { moderationNotes: 'approved by me' },
      ]) {
        await assertFails(
          submitReportBatch(db, {
            reporterId: 'author',
            reportId: `extra-${Object.keys(extra)[0]}`,
            report: extra,
          }),
        );
      }
    });

    it('refuses filing a report under another uid', async () => {
      const db = asUser(env, 'author');
      await assertFails(
        submitReportBatch(db, {
          reporterId: 'author',
          reportId: 'spoofed',
          report: { reporterId: 'victim' },
        }),
      );
    });

    it('refuses a report whose timestamps come from the device clock', async () => {
      // A backdated report would distort the Phase 10 clustering and could be
      // used to manufacture a history for a location.
      const db = asUser(env, 'author');
      await assertFails(
        submitReportBatch(db, {
          reporterId: 'author',
          reportId: 'backdated',
          report: { createdAt: new Date('2020-01-01'), updatedAt: new Date('2020-01-01') },
        }),
      );
    });

    it('refuses a report carrying an unexpected field', async () => {
      const db = asUser(env, 'author');
      await assertFails(
        submitReportBatch(db, {
          reporterId: 'author',
          reportId: 'extra-key',
          report: { hiddenPayload: 'x'.repeat(500) },
        }),
      );
    });
  });

  /**
   * The verified-email requirement on report creation.
   *
   * The moderation queue is a human being, and until this rule existed the only
   * thing bounding how much could be pushed into it was an attacker's patience:
   * the rate limit is per account, and an account cost nothing. See
   * `hasVerifiedEmail()` in `firestore.rules`.
   *
   * The happy path is asserted **first and explicitly**, not left implied by the
   * tests above. A rule that denies everything passes every test that only
   * checks refusals — that is exactly how the Phase 13 `hasNoPrivilegedFields`
   * bug survived eleven phases — and a mistake in this clause would silently
   * stop every user in the world from filing a report.
   */
  describe('a verified email address', () => {
    it('lets a verified account file a report', async () => {
      const db = asUser(env, 'author');
      await assertSucceeds(submitReportBatch(db, { reporterId: 'author', reportId: 'verified' }));
    });

    it('refuses a report from an account that has not verified its address', async () => {
      const db = asUnverifiedUser(env, 'author');
      await assertFails(submitReportBatch(db, { reporterId: 'author', reportId: 'unverified' }));
    });

    // A token from a provider that never sets the claim must read as "not
    // verified" rather than erroring — an erroring rule is a denial, but for the
    // wrong reason, and it would take the rest of the file down with it.
    it('refuses a report when the token carries no email_verified claim at all', async () => {
      const db = asRolelessUser(env, 'author');
      await assertFails(submitReportBatch(db, { reporterId: 'author', reportId: 'no-claim' }));
    });

    // The scope boundary, asserted so a later widening is a deliberate act
    // rather than a side effect. Someone in an emergency must never be told to
    // check their email first.
    it('does not block an unverified account from managing emergency contacts', async () => {
      await seed(env, 'emergencyContacts/mine', contactFixture({ userId: 'owner' }));
      const db = asUnverifiedUser(env, 'owner');

      await assertSucceeds(db.doc('emergencyContacts/mine').get());
      await assertSucceeds(
        db
          .doc('emergencyContacts/mine')
          .update({ phone: '+447700900999', updatedAt: serverTimestamp() }),
      );
    });

    it('does not block an unverified account from reading black spots', async () => {
      await seed(env, 'blackSpots/spot-1', blackSpotFixture());
      const db = asUnverifiedUser(env, 'reader');
      await assertSucceeds(db.doc('blackSpots/spot-1').get());
    });
  });
});

describe('emergencyContacts ownership', () => {
  beforeEach(async () => {
    await seed(env, 'emergencyContacts/mine', contactFixture({ userId: 'owner' }));
    await seed(env, 'emergencyContacts/theirs', contactFixture({ userId: 'somebody-else' }));
  });

  it('lets the owner read and edit their own contact', async () => {
    const db = asUser(env, 'owner');
    await assertSucceeds(db.doc('emergencyContacts/mine').get());
    await assertSucceeds(
      db
        .doc('emergencyContacts/mine')
        .update({ phone: '+447700900999', updatedAt: serverTimestamp() }),
    );
  });

  it('lets the owner delete their own contact', async () => {
    // Deliberately immediate, unlike reports: this is another person's phone
    // number and being able to remove it at once is the point.
    await assertSucceeds(asUser(env, 'owner').doc('emergencyContacts/mine').delete());
  });

  it('refuses reading another user’s contact', async () => {
    await assertFails(asUser(env, 'owner').doc('emergencyContacts/theirs').get());
  });

  it('refuses editing or deleting another user’s contact', async () => {
    const db = asUser(env, 'owner');
    await assertFails(db.doc('emergencyContacts/theirs').update({ phone: '+440000000000' }));
    await assertFails(db.doc('emergencyContacts/theirs').delete());
  });

  it('gives a moderator no access to anybody’s contacts', async () => {
    // There is no read path here for any role. A contact list is not moderation
    // evidence, and the people on it never agreed to be there.
    const db = asModerator(env, 'moderator-1');
    await assertFails(db.doc('emergencyContacts/mine').get());
    await assertFails(db.collection('emergencyContacts').limit(10).get());
  });

  it('refuses reassigning a contact to another account', async () => {
    await assertFails(
      asUser(env, 'owner').doc('emergencyContacts/mine').update({ userId: 'somebody-else' }),
    );
  });
});

describe('users', () => {
  beforeEach(async () => {
    await seed(env, 'users/owner', { id: 'owner', name: 'Owner', email: 'owner@example.test' });
  });

  it('lets a user read their own profile', async () => {
    await assertSucceeds(asUser(env, 'owner').doc('users/owner').get());
  });

  it('refuses reading another profile', async () => {
    await assertFails(asUser(env, 'other').doc('users/owner').get());
  });

  it('refuses listing the collection, so membership is not enumerable', async () => {
    await assertFails(asUser(env, 'owner').collection('users').limit(10).get());
  });

  it('gives a moderator no access to profiles', async () => {
    await assertFails(asModerator(env, 'moderator-1').doc('users/owner').get());
  });
});

describe('anonymous callers', () => {
  it('are refused everywhere', async () => {
    await seed(env, 'incidentReports/report-1', reportFixture());
    await seed(env, 'emergencyContacts/contact-1', contactFixture());
    await seed(env, 'users/user-1', { id: 'user-1' });

    const db = asAnonymous(env);
    await assertFails(db.doc('incidentReports/report-1').get());
    await assertFails(db.doc('emergencyContacts/contact-1').get());
    await assertFails(db.doc('users/user-1').get());
    await assertFails(db.collection('blackSpots').limit(1).get());
  });
});
