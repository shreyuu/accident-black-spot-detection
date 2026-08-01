import { after, before, beforeEach, describe, it } from 'node:test';

import {
  analysisJobFixture,
  asAdmin,
  asAnonymous,
  asModerator,
  asRolelessUser,
  asUser,
  assertFails,
  assertSucceeds,
  candidateFixture,
  createTestEnvironment,
  seed,
} from './helpers.mjs';

/**
 * The Phase 10 gate, asserted against the real rules engine.
 *
 * The claim to prove is the project's central one: **an algorithm cannot put a
 * hazard warning in front of users on its own.** Publishing has to remain a
 * human decision, and these tests check the three independent things that keep
 * it that way.
 *
 *   1. The mobile app — an ordinary signed-in user — cannot read
 *      `blackSpotCandidates` at all. Not "reads them and filters them out";
 *      cannot read them. So no client-side bug can surface one.
 *   2. No client may write a candidate or a job, whatever role their token
 *      carries. Even a stolen admin token cannot manufacture a proposal.
 *   3. A candidate is a different *shape* from a black spot, so it cannot
 *      satisfy the app's `verified && active` query even if copied across.
 *
 * The analytics service writes through the Admin SDK, which bypasses rules by
 * design — so these tests deliberately cover the client side of the boundary,
 * and the pipeline's own tests cover that it only ever writes candidates.
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

describe('blackSpotCandidates — invisible to the app', () => {
  beforeEach(async () => {
    await seed(env, 'blackSpotCandidates/candidate-1', candidateFixture());
  });

  it('cannot be read by an ordinary user', async () => {
    // The load-bearing assertion. A candidate the app cannot fetch is a
    // candidate no rendering bug can turn into a warning.
    await assertFails(asUser(env, 'user-1').doc('blackSpotCandidates/candidate-1').get());
  });

  it('cannot be listed by an ordinary user', async () => {
    await assertFails(asUser(env, 'user-1').collection('blackSpotCandidates').get());
  });

  it('cannot be read by a user with no role claim', async () => {
    await assertFails(asRolelessUser(env, 'user-1').doc('blackSpotCandidates/candidate-1').get());
  });

  it('cannot be read anonymously', async () => {
    await assertFails(asAnonymous(env).doc('blackSpotCandidates/candidate-1').get());
  });

  it('can be read by a moderator, who reviews the queue', async () => {
    await assertSucceeds(
      asModerator(env, 'moderator-1').doc('blackSpotCandidates/candidate-1').get(),
    );
  });

  it('can be read by an admin', async () => {
    await assertSucceeds(asAdmin(env, 'admin-1').doc('blackSpotCandidates/candidate-1').get());
  });

  it('can be listed by a moderator', async () => {
    await assertSucceeds(asModerator(env, 'moderator-1').collection('blackSpotCandidates').get());
  });
});

describe('blackSpotCandidates — no client may write one', () => {
  it('rejects creation by an ordinary user', async () => {
    await assertFails(
      asUser(env, 'user-1').doc('blackSpotCandidates/forged').set(candidateFixture()),
    );
  });

  it('rejects creation by a moderator', async () => {
    await assertFails(
      asModerator(env, 'moderator-1').doc('blackSpotCandidates/forged').set(candidateFixture()),
    );
  });

  it('rejects creation by an admin', async () => {
    // Even the most privileged token cannot manufacture a proposal. Candidates
    // come from the analytics service or they do not exist.
    await assertFails(
      asAdmin(env, 'admin-1').doc('blackSpotCandidates/forged').set(candidateFixture()),
    );
  });

  it('rejects an update by an admin', async () => {
    await seed(env, 'blackSpotCandidates/candidate-1', candidateFixture());

    await assertFails(
      asAdmin(env, 'admin-1').doc('blackSpotCandidates/candidate-1').update({ severityScore: 99 }),
    );
  });

  it('rejects a delete by an admin', async () => {
    await seed(env, 'blackSpotCandidates/candidate-1', candidateFixture());

    await assertFails(asAdmin(env, 'admin-1').doc('blackSpotCandidates/candidate-1').delete());
  });

  it('rejects a candidate that tries to smuggle in verified and active', async () => {
    // The shape defence. Writing is denied outright, so this passes for the same
    // reason as the others — the point is that there is no privileged-write path
    // that would let the extra fields through either.
    await assertFails(
      asAdmin(env, 'admin-1')
        .doc('blackSpotCandidates/forged')
        .set(candidateFixture({ verified: true, active: true })),
    );
  });
});

describe('analysisJobs', () => {
  beforeEach(async () => {
    await seed(env, 'analysisJobs/job-1', analysisJobFixture());
  });

  it('cannot be read by an ordinary user', async () => {
    // The counts describe the whole report corpus, including how many reports
    // were rejected. Not public information.
    await assertFails(asUser(env, 'user-1').doc('analysisJobs/job-1').get());
  });

  it('cannot be read anonymously', async () => {
    await assertFails(asAnonymous(env).doc('analysisJobs/job-1').get());
  });

  it('can be read by a moderator, to trace a candidate to its run', async () => {
    await assertSucceeds(asModerator(env, 'moderator-1').doc('analysisJobs/job-1').get());
  });

  it('rejects a write by an admin', async () => {
    await assertFails(
      asAdmin(env, 'admin-1')
        .doc('analysisJobs/job-2')
        .set(analysisJobFixture({ id: 'job-2' })),
    );
  });

  it('rejects tampering with a completed run', async () => {
    await assertFails(
      asAdmin(env, 'admin-1').doc('analysisJobs/job-1').update({ candidatesWritten: 999 }),
    );
  });
});

describe('publishing stays a separate, human act', () => {
  it('a moderator still cannot write to blackSpots', async () => {
    // Reading a candidate does not confer any power to publish it. The only
    // route to `blackSpots` is the Admin SDK in the dashboard.
    await assertFails(
      asModerator(env, 'moderator-1').doc('blackSpots/published').set({
        name: 'Published from a candidate',
        verified: true,
        active: true,
      }),
    );
  });

  it('an admin still cannot write to blackSpots from a client', async () => {
    await assertFails(
      asAdmin(env, 'admin-1').doc('blackSpots/published').set({
        name: 'Published from a candidate',
        verified: true,
        active: true,
      }),
    );
  });
});
