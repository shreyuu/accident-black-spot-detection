import { after, before, beforeEach, describe, it } from 'node:test';

import {
  asAdmin,
  asAnonymous,
  asModerator,
  asRolelessUser,
  asUser,
  assertFails,
  assertSucceeds,
  auditFixture,
  blackSpotFixture,
  createTestEnvironment,
  reportFixture,
  seed,
} from './helpers.mjs';

/**
 * The Phase 7 gate, asserted against the real rules engine.
 *
 * Two claims to prove:
 *
 *   1. A normal user cannot approve a report — from any client, by any route.
 *   2. A role does not, by itself, unlock a privileged write. There is no
 *      client-side approval path at all, which is why the rules can stay closed
 *      and the authorisation for the Admin SDK path lives in tested code
 *      (`evaluateModerationDecision`) instead.
 *
 * The second is the more surprising one and the reason a "moderator can approve"
 * test does not appear below: the moderator's power comes from the dashboard
 * holding an Admin SDK credential, not from their token. A test asserting a
 * moderator could approve *from a client* would be asserting a hole.
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

describe('role claims', () => {
  it('treats an account with no role claim as an ordinary user', async () => {
    // A freshly registered account has no claim until an admin grants one. It
    // must not fall through to anything privileged.
    await seed(env, 'adminAuditLogs/entry-1', auditFixture());
    const db = asRolelessUser(env, 'new-account');
    await assertFails(db.doc('adminAuditLogs/entry-1').get());
  });

  it('does not let a user escalate their own role in their profile', async () => {
    const db = asUser(env, 'user-1');
    await assertFails(
      db.doc('users/user-1').set({
        id: 'user-1',
        name: 'Climber',
        email: 'climber@example.test',
        role: 'admin',
        alertRadiusM: 1000,
        alertsEnabled: true,
        backgroundMonitoringEnabled: false,
        hapticsEnabled: true,
        soundEnabled: true,
        darkModePreference: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  });
});

describe('incidentReports — approval is impossible from any client', () => {
  beforeEach(async () => {
    await seed(env, 'incidentReports/report-1', reportFixture({ reporterId: 'reporter-1' }));
  });

  it('refuses a plain user approving somebody else’s report', async () => {
    const db = asUser(env, 'user-2');
    await assertFails(db.doc('incidentReports/report-1').update({ status: 'approved' }));
  });

  it('refuses the reporter approving their own report', async () => {
    // The headline rule of the whole moderation design.
    const db = asUser(env, 'reporter-1');
    await assertFails(db.doc('incidentReports/report-1').update({ status: 'approved' }));
  });

  it('refuses a moderator approving from a client', async () => {
    // Not a gap. A moderator's power comes from the dashboard's Admin SDK
    // credential, not from their token — so a stolen moderator token from the
    // mobile app grants no approval ability whatsoever.
    const db = asModerator(env, 'moderator-1');
    await assertFails(db.doc('incidentReports/report-1').update({ status: 'approved' }));
  });

  it('refuses an admin approving from a client', async () => {
    const db = asAdmin(env, 'admin-1');
    await assertFails(db.doc('incidentReports/report-1').update({ status: 'approved' }));
  });

  it('refuses a moderator writing moderation notes from a client', async () => {
    const db = asModerator(env, 'moderator-1');
    await assertFails(db.doc('incidentReports/report-1').update({ moderationNotes: 'looks fine' }));
  });

  it('refuses anyone deleting a report', async () => {
    for (const db of [
      asUser(env, 'reporter-1'),
      asModerator(env, 'moderator-1'),
      asAdmin(env, 'admin-1'),
    ]) {
      await assertFails(db.doc('incidentReports/report-1').delete());
    }
  });

  it('still lets the reporter read their own report', async () => {
    const db = asUser(env, 'reporter-1');
    await assertSucceeds(db.doc('incidentReports/report-1').get());
  });

  it('does not let a moderator read reports from a client', async () => {
    // Reporter privacy: the queue is read server-side with the Admin SDK, so
    // there is no need to widen client reads, and widening them would expose
    // every report body to any account holding a moderator claim.
    const db = asModerator(env, 'moderator-1');
    await assertFails(db.doc('incidentReports/report-1').get());
  });
});

describe('blackSpots — no client may publish, whatever their role', () => {
  it('refuses creation by a user, a moderator and an admin alike', async () => {
    for (const [label, db] of [
      ['user', asUser(env, 'user-1')],
      ['moderator', asModerator(env, 'moderator-1')],
      ['admin', asAdmin(env, 'admin-1')],
    ]) {
      await assertFails(
        db.doc(`blackSpots/spot-by-${label}`).set(blackSpotFixture()),
        `${label} should not be able to publish a black spot from a client`,
      );
    }
  });

  it('refuses withdrawing a published black spot from a client', async () => {
    await seed(env, 'blackSpots/spot-1', blackSpotFixture());
    const db = asAdmin(env, 'admin-1');
    await assertFails(db.doc('blackSpots/spot-1').update({ active: false }));
  });

  it('still shows a verified, active black spot to an ordinary signed-in user', async () => {
    await seed(env, 'blackSpots/spot-1', blackSpotFixture());
    const db = asUser(env, 'user-1');
    await assertSucceeds(db.doc('blackSpots/spot-1').get());
  });

  it('hides an unverified black spot from everyone, including an admin', async () => {
    // The invariant the mobile app depends on: an unverified record must never
    // reach a client as an official hazard.
    await seed(env, 'blackSpots/candidate', blackSpotFixture({ verified: false }));
    for (const db of [asUser(env, 'user-1'), asAdmin(env, 'admin-1')]) {
      await assertFails(db.doc('blackSpots/candidate').get());
    }
  });

  it('hides a withdrawn black spot from everyone', async () => {
    await seed(env, 'blackSpots/withdrawn', blackSpotFixture({ active: false }));
    for (const db of [asUser(env, 'user-1'), asAdmin(env, 'admin-1')]) {
      await assertFails(db.doc('blackSpots/withdrawn').get());
    }
  });
});

describe('adminAuditLogs — readable by moderators, writable by nobody', () => {
  beforeEach(async () => {
    await seed(env, 'adminAuditLogs/entry-1', auditFixture());
  });

  it('lets a moderator read the trail', async () => {
    // Deliberately not admin-only: a log only the most privileged accounts can
    // inspect is a poor check on those accounts.
    await assertSucceeds(asModerator(env, 'moderator-1').doc('adminAuditLogs/entry-1').get());
  });

  it('lets an admin read the trail', async () => {
    await assertSucceeds(asAdmin(env, 'admin-1').doc('adminAuditLogs/entry-1').get());
  });

  it('hides the trail from ordinary users', async () => {
    // The entries name which moderator decided what; that is not public.
    await assertFails(asUser(env, 'user-1').doc('adminAuditLogs/entry-1').get());
  });

  it('hides the trail from anonymous callers', async () => {
    await assertFails(asAnonymous(env).doc('adminAuditLogs/entry-1').get());
  });

  it('refuses an append even from an admin', async () => {
    // An audit trail the audited can append to is not an audit trail. Entries
    // come only from the Admin SDK, in the same transaction as the action.
    await assertFails(asAdmin(env, 'admin-1').doc('adminAuditLogs/entry-2').set(auditFixture()));
  });

  it('refuses amending an existing entry', async () => {
    await assertFails(
      asAdmin(env, 'admin-1').doc('adminAuditLogs/entry-1').update({ summary: 'nothing to see' }),
    );
  });

  it('refuses deleting an entry', async () => {
    await assertFails(asAdmin(env, 'admin-1').doc('adminAuditLogs/entry-1').delete());
  });
});
