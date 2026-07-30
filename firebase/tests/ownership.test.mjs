import { after, before, beforeEach, describe, it } from 'node:test';

import {
  asAnonymous,
  asModerator,
  asUser,
  assertFails,
  assertSucceeds,
  contactFixture,
  createTestEnvironment,
  reportFixture,
  seed,
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
      await assertSucceeds(
        db.doc('incidentReports/fresh').set(reportFixture({ reporterId: 'author' })),
      );
    });

    it('refuses a report created as approved', async () => {
      const db = asUser(env, 'author');
      await assertFails(
        db
          .doc('incidentReports/sneaky')
          .set(reportFixture({ reporterId: 'author', status: 'approved' })),
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
          db
            .doc(`incidentReports/extra-${Object.keys(extra)[0]}`)
            .set(reportFixture({ reporterId: 'author', ...extra })),
        );
      }
    });

    it('refuses filing a report under another uid', async () => {
      const db = asUser(env, 'author');
      await assertFails(
        db.doc('incidentReports/spoofed').set(reportFixture({ reporterId: 'victim' })),
      );
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
      db.doc('emergencyContacts/mine').update({ phone: '+447700900999', updatedAt: new Date() }),
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
