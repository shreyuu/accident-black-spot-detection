import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  DUPLICATE_WINDOW_HOURS,
  FINGERPRINT_GEOHASH_PRECISION,
  REPORT_RATE_LIMIT,
} from '@accident-black-spot-detection/shared-types';

import {
  asUser,
  assertFails,
  assertSucceeds,
  buildReportFingerprintId,
  createTestEnvironment,
  reportFixture,
  seed,
  serverTimestamp,
  submitReportBatch,
} from './helpers.mjs';

/**
 * Rate limiting and duplicate detection (Phase 12).
 *
 * These are the tests for the phase's least obvious claim: that a limit can be
 * enforced on the server even though the document holding the count is written
 * by the client being limited. The mechanism is described at length on
 * `reportRateLimits` in `firestore.rules`; what matters here is that every way
 * around it is actually closed, against the real rules engine.
 *
 * ## Why time is manipulated by seeding, not by waiting
 *
 * The emulator uses real wall-clock time and there is no way to advance it. A
 * test for "the window resets after 24 hours" therefore seeds a counter that
 * *already* has a 24-hour-old window — through `withSecurityRulesDisabled`, so
 * the arrangement itself is not constrained by the rules — and then performs the
 * real, rule-checked write against it. The write under test is always a genuine
 * client write.
 */

const HOUR_MS = 60 * 60 * 1000;
const here = dirname(fileURLToPath(import.meta.url));

/** A report whose timestamps are server sentinels, as every real write has. */
function reportFixtureWithServerTimes(reporterId) {
  return reportFixture({
    reporterId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

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

/**
 * Seed a counter whose window and last report are `agoMs` in the past, and
 * return the exact `windowStartAt` written.
 *
 * Returning it matters. Staying inside the window requires
 * `request.resource.data.windowStartAt == resource.data.windowStartAt`, which is
 * exact to the millisecond — recomputing `new Date(Date.now() - twoHours)` at
 * submit time produces a value a few milliseconds off and the write is refused.
 * The tests that follow reuse this object rather than recomputing it.
 */
async function seedCounter(userId, { agoMs, count, windowAgoMs = agoMs }) {
  const windowStartAt = new Date(Date.now() - windowAgoMs);

  await seed(env, `reportRateLimits/${userId}`, {
    userId,
    windowStartAt,
    count,
    lastReportAt: new Date(Date.now() - agoMs),
  });

  return windowStartAt;
}

describe('the limits in firestore.rules match the shared constants', () => {
  const rules = readFileSync(join(here, '..', 'firestore.rules'), 'utf8');

  /**
   * A rules file cannot import, so the numbers are written out in both places.
   * These assertions are what stops the two drifting: raising the cap in
   * `reportLimits.ts` without raising it here would leave the app promising an
   * allowance the server refuses, and the failure would surface as an
   * unexplained PERMISSION_DENIED for the tenth report of the day.
   */

  it('uses the shared window length', () => {
    assert.ok(
      rules.includes(`duration.value(${REPORT_RATE_LIMIT.windowHours}, 'h')`),
      `firestore.rules should use a ${REPORT_RATE_LIMIT.windowHours}h window`,
    );
  });

  it('uses the shared minimum gap', () => {
    assert.ok(
      rules.includes(`duration.value(${REPORT_RATE_LIMIT.minGapSeconds}, 's')`),
      `firestore.rules should use a ${REPORT_RATE_LIMIT.minGapSeconds}s minimum gap`,
    );
  });

  it('uses the shared per-window cap', () => {
    assert.ok(
      rules.includes(`count <= ${REPORT_RATE_LIMIT.maxPerWindow}`),
      `firestore.rules should cap at ${REPORT_RATE_LIMIT.maxPerWindow}`,
    );
  });

  it('uses the shared duplicate window', () => {
    assert.ok(
      rules.includes(`duration.value(${DUPLICATE_WINDOW_HOURS}, 'h')`),
      `firestore.rules should expire fingerprints after ${DUPLICATE_WINDOW_HOURS}h`,
    );
  });

  it('slices the geohash to the shared fingerprint precision', () => {
    assert.ok(
      rules.includes(`data.geohash[0:${FINGERPRINT_GEOHASH_PRECISION}]`),
      `firestore.rules should slice ${FINGERPRINT_GEOHASH_PRECISION} geohash characters`,
    );
  });
});

describe('a report must be committed with its counter and fingerprint', () => {
  it('accepts the complete batch', async () => {
    await assertSucceeds(submitReportBatch(asUser(env, 'author'), { reporterId: 'author' }));
  });

  it('refuses a report written on its own', async () => {
    // The core of the design. Without the coupling every limit below is
    // advisory, because a client could simply not write the counter.
    await assertFails(
      submitReportBatch(asUser(env, 'author'), { reporterId: 'author', omit: ['rateLimit'] }),
    );
  });

  it('refuses a report with no fingerprint', async () => {
    await assertFails(
      submitReportBatch(asUser(env, 'author'), { reporterId: 'author', omit: ['fingerprint'] }),
    );
  });

  it('refuses a report whose counter carries a device clock', async () => {
    // `lastReportAt == request.time` is what proves the counter was written in
    // this commit. A value the client chose proves nothing.
    await assertFails(
      submitReportBatch(asUser(env, 'author'), {
        reporterId: 'author',
        rateLimit: { lastReportAt: new Date() },
      }),
    );
  });

  it('refuses a counter written for another user', async () => {
    await assertFails(
      submitReportBatch(asUser(env, 'author'), {
        reporterId: 'author',
        rateLimit: { userId: 'victim' },
      }),
    );
  });

  it('refuses a counter that starts above one', async () => {
    await assertFails(
      submitReportBatch(asUser(env, 'author'), { reporterId: 'author', rateLimit: { count: 0 } }),
    );
    await assertFails(
      submitReportBatch(asUser(env, 'author'), { reporterId: 'author', rateLimit: { count: 5 } }),
    );
  });
});

describe('the per-window allowance', () => {
  it('increments by exactly one within the window', async () => {
    const windowStartAt = await seedCounter('author', {
      agoMs: 5 * 60 * 1000,
      count: 3,
      windowAgoMs: 2 * HOUR_MS,
    });

    await assertSucceeds(
      submitReportBatch(asUser(env, 'author'), {
        reporterId: 'author',
        reportId: 'next',
        rateLimit: { count: 4, windowStartAt },
      }),
    );
  });

  it('refuses a count that skips, repeats or goes backwards', async () => {
    for (const count of [3, 5, 2, 1]) {
      await env.clearFirestore();
      const windowStartAt = await seedCounter('author', {
        agoMs: 5 * 60 * 1000,
        count: 3,
        windowAgoMs: 2 * HOUR_MS,
      });

      await assertFails(
        submitReportBatch(asUser(env, 'author'), {
          reporterId: 'author',
          reportId: `skip-${count}`,
          rateLimit: { count, windowStartAt },
        }),
      );
    }
  });

  it('refuses moving the window start forward to escape the window', async () => {
    // The obvious attack: keep the count, slide the window. Refused because
    // within the window `windowStartAt` must be unchanged, and outside it the
    // count must reset to one.
    await seedCounter('author', {
      agoMs: 5 * 60 * 1000,
      count: REPORT_RATE_LIMIT.maxPerWindow,
      windowAgoMs: 2 * HOUR_MS,
    });

    await assertFails(
      submitReportBatch(asUser(env, 'author'), {
        reporterId: 'author',
        reportId: 'slide',
        rateLimit: { count: REPORT_RATE_LIMIT.maxPerWindow, windowStartAt: serverTimestamp() },
      }),
    );
  });

  it('refuses the report that would exceed the cap', async () => {
    const windowStartAt = await seedCounter('author', {
      agoMs: 5 * 60 * 1000,
      count: REPORT_RATE_LIMIT.maxPerWindow,
      windowAgoMs: 2 * HOUR_MS,
    });

    await assertFails(
      submitReportBatch(asUser(env, 'author'), {
        reporterId: 'author',
        reportId: 'over',
        rateLimit: { count: REPORT_RATE_LIMIT.maxPerWindow + 1, windowStartAt },
      }),
    );
  });

  it('resets to one once the window has elapsed', async () => {
    const elapsed = (REPORT_RATE_LIMIT.windowHours + 1) * HOUR_MS;
    await seedCounter('author', { agoMs: elapsed, count: REPORT_RATE_LIMIT.maxPerWindow });

    await assertSucceeds(
      submitReportBatch(asUser(env, 'author'), { reporterId: 'author', reportId: 'new-window' }),
    );
  });

  it('refuses deleting the counter, which would reset the allowance', async () => {
    await seedCounter('author', { agoMs: 60_000, count: 4 });
    await assertFails(asUser(env, 'author').doc('reportRateLimits/author').delete());
  });
});

describe('the minimum gap between submissions', () => {
  it('refuses a second report inside the gap', async () => {
    const windowStartAt = await seedCounter('author', {
      agoMs: 5_000,
      count: 1,
      windowAgoMs: HOUR_MS,
    });

    await assertFails(
      submitReportBatch(asUser(env, 'author'), {
        reporterId: 'author',
        reportId: 'flood',
        rateLimit: { count: 2, windowStartAt },
      }),
    );
  });

  it('allows one once the gap has passed', async () => {
    const past = (REPORT_RATE_LIMIT.minGapSeconds + 30) * 1000;
    const windowStartAt = await seedCounter('author', {
      agoMs: past,
      count: 1,
      windowAgoMs: HOUR_MS,
    });

    await assertSucceeds(
      submitReportBatch(asUser(env, 'author'), {
        reporterId: 'author',
        reportId: 'paced',
        rateLimit: { count: 2, windowStartAt },
      }),
    );
  });
});

describe('duplicate detection', () => {
  const GEOHASH = 'gcpvj0duq5';

  /** Seed a fingerprint as though a report had claimed it `agoMs` ago. */
  async function seedFingerprint(reporterId, { reportId, agoMs, type = 'accident' }) {
    await seed(env, `reportFingerprints/${buildReportFingerprintId(reporterId, type, GEOHASH)}`, {
      reporterId,
      reportId,
      lastReportAt: new Date(Date.now() - agoMs),
    });
  }

  it('refuses a second report of the same type at the same place', async () => {
    await seedFingerprint('author', { reportId: 'first', agoMs: HOUR_MS });
    const windowStartAt = await seedCounter('author', {
      agoMs: 5 * 60 * 1000,
      count: 1,
      windowAgoMs: HOUR_MS,
    });

    await assertFails(
      submitReportBatch(asUser(env, 'author'), {
        reporterId: 'author',
        reportId: 'second',
        rateLimit: { count: 2, windowStartAt },
      }),
    );
  });

  it('allows a retry of the same report id, so a lost response is recoverable', async () => {
    await seedFingerprint('author', { reportId: 'same', agoMs: 5_000 });
    const windowStartAt = await seedCounter('author', {
      agoMs: (REPORT_RATE_LIMIT.minGapSeconds + 30) * 1000,
      count: 1,
      windowAgoMs: HOUR_MS,
    });

    await assertSucceeds(
      submitReportBatch(asUser(env, 'author'), {
        reporterId: 'author',
        reportId: 'same',
        rateLimit: { count: 2, windowStartAt },
      }),
    );
  });

  it('allows a new report once the duplicate window has expired', async () => {
    await seedFingerprint('author', {
      reportId: 'old',
      agoMs: (DUPLICATE_WINDOW_HOURS + 1) * HOUR_MS,
    });
    const windowStartAt = await seedCounter('author', {
      agoMs: 2 * HOUR_MS,
      count: 1,
      windowAgoMs: 3 * HOUR_MS,
    });

    await assertSucceeds(
      submitReportBatch(asUser(env, 'author'), {
        reporterId: 'author',
        reportId: 'later',
        rateLimit: { count: 2, windowStartAt },
      }),
    );
  });

  it('does not fold together different incident types at the same place', async () => {
    // Reporting a pothole does not silence a report of a crime at the junction.
    await seedFingerprint('author', { reportId: 'the-pothole', agoMs: HOUR_MS, type: 'pothole' });
    const windowStartAt = await seedCounter('author', {
      agoMs: 5 * 60 * 1000,
      count: 1,
      windowAgoMs: HOUR_MS,
    });

    await assertSucceeds(
      submitReportBatch(asUser(env, 'author'), {
        reporterId: 'author',
        reportId: 'the-crime',
        report: { type: 'crime' },
        rateLimit: { count: 2, windowStartAt },
      }),
    );
  });

  it('does not let one person suppress another person’s report', async () => {
    // The fingerprint id begins with the reporter's uid, so a witness reporting
    // the same crash is a different fingerprint entirely. A duplicate check that
    // silenced corroborating reports would defeat the whole clustering model.
    await seedFingerprint('author', { reportId: 'mine', agoMs: 60_000 });

    await assertSucceeds(
      submitReportBatch(asUser(env, 'witness'), { reporterId: 'witness', reportId: 'theirs' }),
    );
  });

  it('refuses a report whose fingerprint was filed under a different id', async () => {
    // The client does not choose which fingerprint is checked: the rule rebuilds
    // the id from the report's own type and geohash. Writing a decoy fingerprint
    // at an unrelated id leaves the real one unclaimed, and the report fails.
    await assertFails(
      submitReportBatch(asUser(env, 'author'), {
        reporterId: 'author',
        reportId: 'decoy',
        fingerprint: { id: 'author__accident__zzzzzzz' },
      }),
    );
  });

  it('refuses a fingerprint claiming a different report id than the report', async () => {
    await assertFails(
      submitReportBatch(asUser(env, 'author'), {
        reporterId: 'author',
        reportId: 'real',
        fingerprint: { data: { reportId: 'other' } },
      }),
    );
  });

  it('refuses writing a fingerprint under another user’s prefix', async () => {
    await assertFails(
      asUser(env, 'attacker')
        .doc(`reportFingerprints/${buildReportFingerprintId('victim', 'accident', GEOHASH)}`)
        .set({ reporterId: 'attacker', reportId: 'x', lastReportAt: serverTimestamp() }),
    );
  });

  it('refuses deleting a fingerprint to clear the window early', async () => {
    await seedFingerprint('author', { reportId: 'first', agoMs: 60_000 });

    await assertFails(
      asUser(env, 'author')
        .doc(`reportFingerprints/${buildReportFingerprintId('author', 'accident', GEOHASH)}`)
        .delete(),
    );
  });
});

describe('a transaction satisfies the coupling, which is what the app actually uses', () => {
  /**
   * `submitIncidentReport` cannot use a plain batch: it has to *read* the
   * counter to know what to increment it to, and a read followed by a separate
   * batch is a race — two submissions can read the same count and both write
   * count + 1.
   *
   * A transaction closes that, but only if `getAfter` sees a transaction's
   * writes the same way it sees a batch's. It does, and these tests are here so
   * that stays true: if a Firestore change ever broke it, submission would fail
   * for every user at once and the cause would not be obvious from the app.
   */

  async function submitInTransaction(db, { reporterId, reportId, omitCounter = false }) {
    return db.runTransaction(async (transaction) => {
      const counterRef = db.doc(`reportRateLimits/${reporterId}`);
      const existing = await transaction.get(counterRef);

      const data = reportFixtureWithServerTimes(reporterId);

      if (!omitCounter) {
        transaction.set(counterRef, {
          userId: reporterId,
          windowStartAt: existing.exists ? existing.data().windowStartAt : serverTimestamp(),
          count: existing.exists ? existing.data().count + 1 : 1,
          lastReportAt: serverTimestamp(),
        });
      }

      transaction.set(
        db.doc(
          `reportFingerprints/${buildReportFingerprintId(reporterId, data.type, data.geohash)}`,
        ),
        { reporterId, reportId, lastReportAt: serverTimestamp() },
      );
      transaction.set(db.doc(`incidentReports/${reportId}`), data);
    });
  }

  it('accepts a complete transaction', async () => {
    await assertSucceeds(
      submitInTransaction(asUser(env, 'author'), { reporterId: 'author', reportId: 'tx-1' }),
    );
  });

  it('refuses a transaction that leaves the counter untouched', async () => {
    await assertFails(
      submitInTransaction(asUser(env, 'author'), {
        reporterId: 'author',
        reportId: 'tx-2',
        omitCounter: true,
      }),
    );
  });
});

describe('the limit documents are private', () => {
  it('lets a user read their own counter so the app can explain a refusal', async () => {
    await seedCounter('author', { agoMs: 60_000, count: 2 });
    await assertSucceeds(asUser(env, 'author').doc('reportRateLimits/author').get());
  });

  it('refuses reading another user’s counter', async () => {
    await seedCounter('author', { agoMs: 60_000, count: 2 });
    await assertFails(asUser(env, 'snooper').doc('reportRateLimits/author').get());
  });

  it('refuses listing the counters, which would enumerate everyone who reports', async () => {
    await assertFails(asUser(env, 'author').collection('reportRateLimits').limit(10).get());
  });

  it('refuses listing fingerprints, whose ids describe where people report', async () => {
    await assertFails(asUser(env, 'author').collection('reportFingerprints').limit(10).get());
  });
});
