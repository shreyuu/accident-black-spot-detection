import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';

import { buildReportFingerprintId } from '@accident-black-spot-detection/shared-types';

/**
 * Shared setup for the Firestore rules tests.
 *
 * These are the first *automated* security tests in the project. Phases 5 and 6
 * verified their rules with throwaway scripts driving the real client SDK, which
 * proved the rules worked at the time but proved nothing afterwards. This suite
 * runs on demand and fails the build.
 *
 * ## What these tests can and cannot show
 *
 * `initializeTestEnvironment` talks to the Firestore emulator, so the rules under
 * test are the real ones in `firestore.rules`, evaluated by the real engine — not
 * a reimplementation. What they cannot cover is anything the **Admin SDK** does,
 * because it bypasses rules by design; that half of the authorisation story is
 * covered by the `evaluateModerationDecision` tests in `packages/shared-types`.
 *
 * Between them the two suites cover both paths into the data. Neither alone does.
 *
 * ## Why the test files run serially
 *
 * `--test-concurrency=1` in the npm script is load-bearing. Every file shares one
 * emulator and one project id (`singleProjectMode` is on), so each `clearFirestore()`
 * wipes the whole database — including fixtures another file had just seeded.
 * Running in parallel produced exactly that: a suite that passed or failed
 * depending on which file reached its `beforeEach` first. Serial execution costs a
 * couple of seconds and makes the result mean something.
 */

const here = dirname(fileURLToPath(import.meta.url));

/** Matches `.firebaserc`. The `demo-` prefix cannot reach real Google Cloud. */
export const PROJECT_ID = 'demo-accident-black-spot-detection';

export { assertFails, assertSucceeds };

export async function createTestEnvironment() {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(join(here, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}

/**
 * A signed-in context carrying a role custom claim.
 *
 * The second argument to `authenticatedContext` becomes the token's claims, which
 * is exactly how `request.auth.token.role` is populated in production by
 * `grantRole.mjs`. So a test that grants itself `role: 'admin'` here is
 * faithfully simulating an account an administrator promoted — it is not a
 * shortcut around the rules.
 */
export function asUser(env, uid) {
  return env.authenticatedContext(uid, { role: 'user' }).firestore();
}

export function asModerator(env, uid) {
  return env.authenticatedContext(uid, { role: 'moderator' }).firestore();
}

export function asAdmin(env, uid) {
  return env.authenticatedContext(uid, { role: 'admin' }).firestore();
}

/** No claims at all, as a brand-new account has before any role is granted. */
export function asRolelessUser(env, uid) {
  return env.authenticatedContext(uid, {}).firestore();
}

export function asAnonymous(env) {
  return env.unauthenticatedContext().firestore();
}

/**
 * Seed a document bypassing the rules.
 *
 * `withSecurityRulesDisabled` is how a test arranges state it could not
 * legitimately create — an approved report, a black spot, an audit entry. Using
 * it for *arrangement* is correct; using it for the action under test would make
 * the test meaningless, so it appears only in setup here.
 */
export async function seed(env, path, data) {
  await env.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(path).set(data);
  });
}

const NOW = new Date('2026-07-30T12:00:00.000Z');

export function reportFixture(overrides = {}) {
  return {
    reporterId: 'reporter-1',
    type: 'accident',
    description: 'A car left the road on the bend by the school and hit the barrier.',
    latitude: 51.5074,
    longitude: -0.1278,
    geohash: 'gcpvj0duq5',
    severity: 'high',
    imageUrls: [],
    status: 'pending',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function blackSpotFixture(overrides = {}) {
  return {
    name: 'School bend',
    category: 'accident',
    latitude: 51.5074,
    longitude: -0.1278,
    geohash: 'gcpvj0duq5',
    radiusM: 300,
    riskLevel: 'high',
    severityScore: 60,
    accidentCount: 3,
    crimeCount: 0,
    reportCount: 2,
    verified: true,
    active: true,
    source: 'manual',
    createdBy: 'admin-1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function auditFixture(overrides = {}) {
  return {
    actorId: 'moderator-1',
    actorEmail: 'moderator@example.test',
    actorRole: 'moderator',
    action: 'report.approved',
    targetType: 'incidentReport',
    targetId: 'report-1',
    summary: 'Approved an accident report',
    details: { decision: 'approved' },
    createdAt: NOW,
  };
}

export function contactFixture(overrides = {}) {
  return {
    userId: 'owner-1',
    name: 'Sam Doe',
    phone: '+447700900123',
    isPrimary: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/**
 * A Phase 10 analytics candidate.
 *
 * Note what is **absent**: no `verified` and no `active`. Those belong to
 * `blackSpots` and are exactly what the mobile app's query requires, so their
 * absence is what stops a candidate satisfying that query even if one were
 * somehow copied across. The shape is part of the safety argument, not an
 * oversight — see `candidates.test.mjs`.
 */
export function candidateFixture(overrides = {}) {
  return {
    latitude: 51.5074,
    longitude: -0.1278,
    geohash: 'gcpvj0duq5',
    radiusM: 300,
    riskLevel: 'high',
    severityScore: 72,
    scoreComponents: { corroboration: 0.67, severity: 0.6, volume: 0.4, recency: 0.99 },
    category: 'accident',
    source: 'algorithm',
    reportIds: ['report-1', 'report-2', 'report-3'],
    reportCount: 3,
    distinctReporters: 3,
    patterns: ['incident type accident and time of day night — in 75% of reports here'],
    algorithmVersion: '1.0.0',
    jobId: 'job-1',
    status: 'proposed',
    createdAt: NOW,
    ...overrides,
  };
}

/**
 * Submit a report the way the app must, as one atomic batch.
 *
 * Phase 12 couples three writes: the report, the caller's rate-limit counter and
 * the fingerprint that detects duplicates. The report rule reads the other two
 * with `getAfter` and requires their `lastReportAt` to equal `request.time`,
 * which is only true for writes committed together — so a test that wrote the
 * report alone would fail for the right reason but tell you nothing about the
 * rest of the rule.
 *
 * Every part is overridable so a test can commit a *deliberately wrong* batch —
 * a skipped counter, a client clock, a count that does not increment — and
 * assert it is refused. That is most of `limits.test.mjs`.
 *
 * @param db A signed-in Firestore context from `asUser`.
 * @param options.omit Names of the three writes to leave out of the batch.
 */
export function submitReportBatch(db, options = {}) {
  const {
    reporterId,
    reportId = 'report-fresh',
    report = {},
    rateLimit = {},
    fingerprint = {},
    omit = [],
  } = options;

  // Server timestamps first, caller overrides last. The other order looks
  // equivalent and is not: it silently replaced a test's deliberately backdated
  // `createdAt`, so the test proved the helper worked rather than the rule.
  const data = reportFixture({
    reporterId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...report,
  });

  const batch = db.batch();

  if (!omit.includes('report')) {
    batch.set(db.doc(`incidentReports/${reportId}`), data);
  }

  if (!omit.includes('rateLimit')) {
    batch.set(db.doc(`reportRateLimits/${reporterId}`), {
      userId: reporterId,
      windowStartAt: serverTimestamp(),
      count: 1,
      lastReportAt: serverTimestamp(),
      ...rateLimit,
    });
  }

  if (!omit.includes('fingerprint')) {
    const fingerprintId =
      fingerprint.id ?? buildReportFingerprintId(reporterId, data.type, data.geohash);

    batch.set(db.doc(`reportFingerprints/${fingerprintId}`), {
      reporterId,
      reportId,
      lastReportAt: serverTimestamp(),
      ...fingerprint.data,
    });
  }

  return batch.commit();
}

export { buildReportFingerprintId, serverTimestamp };

export function analysisJobFixture(overrides = {}) {
  return {
    id: 'job-1',
    startedAt: NOW,
    finishedAt: NOW,
    algorithmVersion: '1.0.0',
    reportsIngested: 42,
    reportsAfterCleaning: 38,
    duplicatesRemoved: 4,
    clustersFound: 3,
    candidatesWritten: 3,
    parameters: { eps_m: 150, min_samples: 3, min_support: 0.5 },
    status: 'completed',
    error: null,
    ...overrides,
  };
}
