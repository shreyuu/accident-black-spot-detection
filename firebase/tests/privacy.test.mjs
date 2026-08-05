import { after, before, beforeEach, describe, it } from 'node:test';

import {
  asAdmin,
  asAnonymous,
  asModerator,
  asRolelessUser,
  asUser,
  assertFails,
  assertSucceeds,
  contactFixture,
  createTestEnvironment,
  reportFixture,
  seed,
  serverTimestamp,
} from './helpers.mjs';

/**
 * Personal data boundaries (Phase 12).
 *
 * The phase gate is "reporter identity is private". That claim has two halves
 * and only one of them lives in this file:
 *
 *   - **The client path**, covered here: no signed-in caller of any role can
 *     read a `reporterId` that is not their own, through a document read, a
 *     filtered query, or a query that tries to smuggle the filter past the rule.
 *   - **The dashboard path**, which these rules cannot reach because the Admin
 *     SDK bypasses them by design. That half is covered by
 *     `apps/admin/src/lib/__tests__/reporterPrivacy.test.ts`, which pins the
 *     rule that a raw uid is never serialised into a page.
 *
 * Neither suite alone supports the claim. Both are needed, and that is the same
 * split as `evaluateModerationDecision` versus these rules.
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
  await seed(env, 'incidentReports/theirs', reportFixture({ reporterId: 'victim' }));
});

describe('a reporter’s identity is not readable by anyone else', () => {
  it('is refused to another ordinary user', async () => {
    await assertFails(asUser(env, 'snooper').doc('incidentReports/theirs').get());
  });

  it('is refused to a moderator', async () => {
    // Moderators read reports through the Admin SDK. Granting a client-side
    // moderator role read access here would put every reporter's uid within
    // reach of a stolen mobile token.
    await assertFails(asModerator(env, 'moderator-1').doc('incidentReports/theirs').get());
  });

  it('is refused to an admin', async () => {
    await assertFails(asAdmin(env, 'admin-1').doc('incidentReports/theirs').get());
  });

  it('is refused to an account with no role claim at all', async () => {
    await assertFails(asRolelessUser(env, 'fresh').doc('incidentReports/theirs').get());
  });

  it('is refused to an anonymous caller', async () => {
    await assertFails(asAnonymous(env).doc('incidentReports/theirs').get());
  });

  it('cannot be discovered by querying for a suspected uid', async () => {
    // The confirmation attack: guess a uid, filter on it, and learn from success
    // or failure whether that person has reported. Refused because the rule is
    // evaluated per returned document against the *caller's* uid, not against
    // the filter.
    await assertFails(
      asUser(env, 'snooper')
        .collection('incidentReports')
        .where('reporterId', '==', 'victim')
        .limit(1)
        .get(),
    );
  });

  it('cannot be reached by ordering the collection instead of filtering it', async () => {
    await assertFails(
      asUser(env, 'snooper').collection('incidentReports').orderBy('createdAt').limit(1).get(),
    );
  });

  it('cannot be reached by filtering on something other than the reporter', async () => {
    await assertFails(
      asUser(env, 'snooper')
        .collection('incidentReports')
        .where('severity', '==', 'high')
        .limit(1)
        .get(),
    );
  });
});

describe('the analytics collections do not leak reporters to the app', () => {
  beforeEach(async () => {
    await seed(env, 'blackSpotCandidates/candidate-1', {
      reportIds: ['report-1'],
      status: 'proposed',
    });
  });

  it('are unreadable by an ordinary user', async () => {
    // A candidate carries `reportIds`, which are keys into the reports. The
    // mobile app cannot read this collection at all, so a bug in its queries
    // cannot surface either the proposal or the reports behind it.
    await assertFails(asUser(env, 'someone').doc('blackSpotCandidates/candidate-1').get());
    await assertFails(asUser(env, 'someone').collection('blackSpotCandidates').limit(1).get());
  });

  it('are readable by a moderator, who is the intended reviewer', async () => {
    await assertSucceeds(
      asModerator(env, 'moderator-1').doc('blackSpotCandidates/candidate-1').get(),
    );
  });

  it('do not give a moderator the reports themselves', async () => {
    // Knowing a report id is not access to the report. The moderator reads it
    // through the Admin SDK or not at all.
    await assertFails(asModerator(env, 'moderator-1').doc('incidentReports/theirs').get());
  });
});

describe('the deletion tombstone is closed to every client', () => {
  beforeEach(async () => {
    await seed(env, 'deletedAccounts/tombstone-1', {
      deletedAt: new Date(),
      documentsDeleted: 4,
      imagesDeleted: 2,
    });
  });

  it('is unreadable by a user, a moderator and an admin alike', async () => {
    for (const db of [
      asUser(env, 'someone'),
      asModerator(env, 'moderator-1'),
      asAdmin(env, 'admin-1'),
    ]) {
      await assertFails(db.doc('deletedAccounts/tombstone-1').get());
      await assertFails(db.collection('deletedAccounts').limit(1).get());
    }
  });

  it('cannot be written or forged by a client', async () => {
    await assertFails(
      asAdmin(env, 'admin-1').doc('deletedAccounts/forged').set({ deletedAt: serverTimestamp() }),
    );
  });
});

describe('emergency contacts are the most restricted collection', () => {
  beforeEach(async () => {
    await seed(env, 'emergencyContacts/theirs', contactFixture({ userId: 'victim' }));
  });

  it('is unreadable by every role except the owner', async () => {
    // These are other people's phone numbers, held by someone who never asked
    // them. There is no read path for any second party at all.
    for (const db of [
      asUser(env, 'snooper'),
      asModerator(env, 'moderator-1'),
      asAdmin(env, 'admin-1'),
      asAnonymous(env),
    ]) {
      await assertFails(db.doc('emergencyContacts/theirs').get());
    }
  });

  it('cannot be enumerated by guessing an owner uid', async () => {
    await assertFails(
      asUser(env, 'snooper')
        .collection('emergencyContacts')
        .where('userId', '==', 'victim')
        .limit(1)
        .get(),
    );
  });
});

describe('alert logs describe where a person has been', () => {
  beforeEach(async () => {
    await seed(env, 'alertLogs/theirs', {
      userId: 'victim',
      blackSpotId: 'spot-1',
      distanceM: 120,
      alertType: 'foreground',
      createdAt: new Date(),
    });
  });

  it('are readable only by the person alerted', async () => {
    await assertFails(asUser(env, 'snooper').doc('alertLogs/theirs').get());
    await assertFails(asModerator(env, 'moderator-1').doc('alertLogs/theirs').get());
  });

  it('cannot be rewritten to erase or fabricate a warning', async () => {
    // An alert log is the record of what the app told someone and when. If a
    // client could amend it, it would be worthless as evidence either way.
    const db = asUser(env, 'victim');
    await assertFails(db.doc('alertLogs/theirs').update({ distanceM: 5 }));
    await assertFails(db.doc('alertLogs/theirs').delete());
  });

  it('refuses a log with an unexpected field', async () => {
    await assertFails(
      asUser(env, 'victim')
        .doc('alertLogs/new')
        .set({
          userId: 'victim',
          blackSpotId: 'spot-1',
          distanceM: 10,
          alertType: 'foreground',
          createdAt: serverTimestamp(),
          smuggled: 'x'.repeat(1000),
        }),
    );
  });

  it('refuses a log stamped with the device clock', async () => {
    await assertFails(
      asUser(env, 'victim')
        .doc('alertLogs/new')
        .set({
          userId: 'victim',
          blackSpotId: 'spot-1',
          distanceM: 10,
          alertType: 'foreground',
          createdAt: new Date('2020-01-01'),
        }),
    );
  });

  it('accepts a well-formed log from the person alerted', async () => {
    await assertSucceeds(
      asUser(env, 'victim').doc('alertLogs/new').set({
        userId: 'victim',
        blackSpotId: 'spot-1',
        distanceM: 10,
        alertType: 'foreground',
        createdAt: serverTimestamp(),
      }),
    );
  });
});

describe('a profile cannot be used as free storage', () => {
  it('refuses an unexpected field on create', async () => {
    await assertFails(
      asUser(env, 'newcomer')
        .doc('users/newcomer')
        .set({
          id: 'newcomer',
          name: 'New Comer',
          email: 'new@example.test',
          role: 'user',
          alertRadiusM: 500,
          alertsEnabled: true,
          backgroundMonitoringEnabled: false,
          hapticsEnabled: true,
          soundEnabled: true,
          darkModePreference: 'system',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          smuggled: 'x'.repeat(2000),
        }),
    );
  });

  it('accepts a well-formed profile', async () => {
    await assertSucceeds(
      asUser(env, 'newcomer').doc('users/newcomer').set({
        id: 'newcomer',
        name: 'New Comer',
        email: 'new@example.test',
        role: 'user',
        alertRadiusM: 500,
        alertsEnabled: true,
        backgroundMonitoringEnabled: false,
        hapticsEnabled: true,
        soundEnabled: true,
        darkModePreference: 'system',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('refuses a profile whose timestamps come from the device', async () => {
    await assertFails(
      asUser(env, 'newcomer')
        .doc('users/newcomer')
        .set({
          id: 'newcomer',
          name: 'New Comer',
          email: 'new@example.test',
          role: 'user',
          alertRadiusM: 500,
          alertsEnabled: true,
          backgroundMonitoringEnabled: false,
          hapticsEnabled: true,
          soundEnabled: true,
          darkModePreference: 'system',
          createdAt: new Date('2020-01-01'),
          updatedAt: new Date('2020-01-01'),
        }),
    );
  });

  it('refuses a client deleting its own profile, which would orphan its data', async () => {
    // Deletion is the `deleteAccount` function's job precisely because reports,
    // alert logs and Storage objects cannot be removed by a client at all.
    await seed(env, 'users/owner', { id: 'owner' });
    await assertFails(asUser(env, 'owner').doc('users/owner').delete());
  });
});

describe('a user can actually save their own preferences', () => {
  /**
   * The regression suite for a bug that survived from Phase 2 to Phase 13.
   *
   * `hasNoPrivilegedFields` was called with the Set from
   * `diff().affectedKeys()` but implemented as though it received a Map, so it
   * invoked `keys()` on a Set. The rules engine raised "Function not found:
   * keys", which is evaluated as a denial — so **every** profile update was
   * refused and saving a preference to the account had never worked.
   *
   * Nothing caught it. There was no `users` update test at all, and the app
   * swallows the failure into a soft "saved on this device, but not to your
   * account yet" because Phase 11 mirrors preferences locally. It surfaced only
   * when the app was run on a device in Phase 13 and the warning appeared in the
   * log.
   *
   * The lesson is in the shape of these tests: the happy path is asserted first,
   * because a rule that denies everything passes every test that only checks
   * that bad writes are refused.
   */

  const profile = {
    id: 'owner',
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    role: 'user',
    alertRadiusM: 1000,
    alertsEnabled: true,
    backgroundMonitoringEnabled: false,
    hapticsEnabled: true,
    soundEnabled: true,
    darkModePreference: 'system',
  };

  beforeEach(async () => {
    await seed(env, 'users/owner', {
      ...profile,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });
  });

  it('accepts a preference change — the case that was broken', async () => {
    await assertSucceeds(
      asUser(env, 'owner')
        .doc('users/owner')
        .update({ alertRadiusM: 500, darkModePreference: 'dark', updatedAt: serverTimestamp() }),
    );
  });

  it('accepts every preference the settings screen can change', async () => {
    await assertSucceeds(
      asUser(env, 'owner').doc('users/owner').update({
        alertRadiusM: 250,
        alertsEnabled: false,
        soundEnabled: false,
        hapticsEnabled: false,
        backgroundMonitoringEnabled: true,
        darkModePreference: 'light',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('still refuses a self-promotion to admin', async () => {
    // The reason the helper exists. It must keep working now that it does.
    await assertFails(
      asUser(env, 'owner')
        .doc('users/owner')
        .update({ role: 'admin', updatedAt: serverTimestamp() }),
    );
  });

  it('still refuses rewriting identity or backdating the account', async () => {
    for (const change of [
      { id: 'someone-else' },
      { email: 'other@example.test' },
      { createdAt: new Date('2020-01-01') },
    ]) {
      await assertFails(
        asUser(env, 'owner')
          .doc('users/owner')
          .update({ ...change, updatedAt: serverTimestamp() }),
      );
    }
  });

  it('still refuses an alert radius outside the supported bounds', async () => {
    // A tampered client must not be able to store a radius that makes alerting
    // useless or unbearable.
    for (const alertRadiusM of [50, 5000]) {
      await assertFails(
        asUser(env, 'owner')
          .doc('users/owner')
          .update({ alertRadiusM, updatedAt: serverTimestamp() }),
      );
    }
  });

  it('still refuses updating somebody else’s profile', async () => {
    await assertFails(
      asUser(env, 'intruder')
        .doc('users/owner')
        .update({ alertRadiusM: 500, updatedAt: serverTimestamp() }),
    );
  });
});
