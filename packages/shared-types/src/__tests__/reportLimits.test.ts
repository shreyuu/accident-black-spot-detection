import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildReportFingerprintId,
  DUPLICATE_WINDOW_HOURS,
  evaluateReportLimits,
  FINGERPRINT_GEOHASH_PRECISION,
  REPORT_RATE_LIMIT,
  type ReportFingerprintState,
  type ReportLimitDecision,
  type ReportRateLimitState,
} from '../reportLimits.ts';

const NOW = Date.UTC(2026, 7, 2, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const SECOND = 1000;

function limits(overrides: Partial<Parameters<typeof evaluateReportLimits>[0]> = {}) {
  return evaluateReportLimits({
    rateLimit: null,
    fingerprint: null,
    reporterId: 'reporter-1',
    reportId: 'report-1',
    nowMs: NOW,
    ...overrides,
  });
}

function rateLimit(overrides: Partial<ReportRateLimitState> = {}): ReportRateLimitState {
  return {
    userId: 'reporter-1',
    windowStartAtMs: NOW,
    count: 1,
    lastReportAtMs: NOW,
    ...overrides,
  };
}

function fingerprint(overrides: Partial<ReportFingerprintState> = {}): ReportFingerprintState {
  return { reporterId: 'reporter-1', reportId: 'report-0', lastReportAtMs: NOW, ...overrides };
}

function assertAllowed(decision: ReportLimitDecision): ReportRateLimitState {
  assert.equal(decision.allowed, true, `expected allowed, got ${JSON.stringify(decision)}`);
  assert.ok(decision.allowed);
  return decision.nextRateLimit;
}

function assertRefused(decision: ReportLimitDecision, reason: string) {
  assert.equal(decision.allowed, false, 'expected a refusal');
  assert.ok(!decision.allowed);
  assert.equal(decision.refusal.reason, reason);
  return decision.refusal;
}

describe('buildReportFingerprintId', () => {
  it('is the exact string firestore.rules rebuilds', () => {
    // Mirrors `request.auth.uid + '__' + data.type + '__' + data.geohash[0:7]`.
    assert.equal(
      buildReportFingerprintId('uid123', 'accident', 'gcpvj0duq5'),
      'uid123__accident__gcpvj0d',
    );
  });

  it('truncates the geohash to the fingerprint precision', () => {
    const id = buildReportFingerprintId('u', 'crime', 'gcpvj0duq5');
    assert.equal(id.split('__')[2]?.length, FINGERPRINT_GEOHASH_PRECISION);
  });

  it('tolerates a geohash shorter than the precision rather than padding it', () => {
    assert.equal(buildReportFingerprintId('u', 'pothole', 'gcp'), 'u__pothole__gcp');
  });

  it('separates reports of different types at the same place', () => {
    assert.notEqual(
      buildReportFingerprintId('u', 'accident', 'gcpvj0duq5'),
      buildReportFingerprintId('u', 'crime', 'gcpvj0duq5'),
    );
  });

  it('separates different reporters at the same place', () => {
    assert.notEqual(
      buildReportFingerprintId('a', 'accident', 'gcpvj0duq5'),
      buildReportFingerprintId('b', 'accident', 'gcpvj0duq5'),
    );
  });

  it('contains no character that is invalid in a Firestore document id', () => {
    const id = buildReportFingerprintId('uid-123', 'unsafe-road', 'gcpvj0duq5');
    assert.equal(id.includes('/'), false);
    assert.equal(id.startsWith('__') && id.endsWith('__'), false);
    assert.ok(id.length < 1500);
  });
});

describe('rate limiting', () => {
  it('allows the first report a user has ever filed', () => {
    const next = assertAllowed(limits());
    assert.deepEqual(next, {
      userId: 'reporter-1',
      windowStartAtMs: NOW,
      count: 1,
      lastReportAtMs: NOW,
    });
  });

  it('increments within the window and keeps the original window start', () => {
    const next = assertAllowed(
      limits({
        rateLimit: rateLimit({
          windowStartAtMs: NOW - 3 * HOUR,
          count: 4,
          lastReportAtMs: NOW - HOUR,
        }),
      }),
    );

    assert.equal(next.count, 5);
    assert.equal(next.windowStartAtMs, NOW - 3 * HOUR);
    assert.equal(next.lastReportAtMs, NOW);
  });

  it('refuses once the window allowance is spent', () => {
    const refusal = assertRefused(
      limits({
        rateLimit: rateLimit({
          windowStartAtMs: NOW - HOUR,
          count: REPORT_RATE_LIMIT.maxPerWindow,
          lastReportAtMs: NOW - 10 * 60 * 1000,
        }),
      }),
      'rate-limited',
    );

    assert.equal(refusal.retryAfterMs, (REPORT_RATE_LIMIT.windowHours - 1) * HOUR);
  });

  it('does not tell a rate-limited user their existing reports are lost', () => {
    const refusal = assertRefused(
      limits({
        rateLimit: rateLimit({ count: REPORT_RATE_LIMIT.maxPerWindow, lastReportAtMs: NOW - HOUR }),
      }),
      'rate-limited',
    );

    assert.match(refusal.message, /existing reports are unaffected/i);
    // Never leave someone in danger without the one instruction that helps.
    assert.match(refusal.message, /emergency services/i);
  });

  it('starts a fresh window once the old one has elapsed, even at the cap', () => {
    const next = assertAllowed(
      limits({
        rateLimit: rateLimit({
          windowStartAtMs: NOW - (REPORT_RATE_LIMIT.windowHours + 1) * HOUR,
          count: REPORT_RATE_LIMIT.maxPerWindow,
          lastReportAtMs: NOW - (REPORT_RATE_LIMIT.windowHours + 1) * HOUR,
        }),
      }),
    );

    // A spent allowance in an elapsed window resets rather than carrying over.
    assert.equal(next.count, 1);
    assert.equal(next.windowStartAtMs, NOW);
  });

  it('treats the window boundary as still inside the window', () => {
    // Strictly `nowMs > windowEndsAtMs` resets. Exactly at the boundary the
    // window is still current, which matches `request.time > …` in the rules.
    const atBoundary = limits({
      rateLimit: rateLimit({
        windowStartAtMs: NOW - REPORT_RATE_LIMIT.windowHours * HOUR,
        count: REPORT_RATE_LIMIT.maxPerWindow,
        lastReportAtMs: NOW - HOUR,
      }),
    });

    assertRefused(atBoundary, 'rate-limited');
  });

  it('refuses a second report inside the minimum gap', () => {
    const refusal = assertRefused(
      limits({ rateLimit: rateLimit({ lastReportAtMs: NOW - 10 * SECOND }) }),
      'too-soon',
    );

    assert.equal(refusal.retryAfterMs, REPORT_RATE_LIMIT.minGapSeconds * SECOND - 10 * SECOND);
  });

  it('allows a report once the minimum gap has passed', () => {
    assertAllowed(
      limits({
        rateLimit: rateLimit({
          lastReportAtMs: NOW - (REPORT_RATE_LIMIT.minGapSeconds + 1) * SECOND,
        }),
      }),
    );
  });

  it('checks the minimum gap before the window cap, so the sooner limit wins', () => {
    assertRefused(
      limits({
        rateLimit: rateLimit({
          count: REPORT_RATE_LIMIT.maxPerWindow,
          lastReportAtMs: NOW - SECOND,
        }),
      }),
      'too-soon',
    );
  });
});

describe('duplicate detection', () => {
  it('allows a report when no fingerprint exists', () => {
    assertAllowed(limits({ fingerprint: null }));
  });

  it('refuses a different report claiming a recent fingerprint', () => {
    const refusal = assertRefused(
      limits({
        reportId: 'report-new',
        fingerprint: fingerprint({ reportId: 'report-old', lastReportAtMs: NOW - HOUR }),
      }),
      'duplicate',
    );

    assert.equal(refusal.retryAfterMs, (DUPLICATE_WINDOW_HOURS - 1) * HOUR);
  });

  it('allows a retry of the same report id — this is what keeps retries idempotent', () => {
    assertAllowed(
      limits({
        reportId: 'report-same',
        fingerprint: fingerprint({ reportId: 'report-same', lastReportAtMs: NOW - SECOND }),
        // A retry arrives inside the minimum gap by definition, so the rate
        // limit must not be consulted against it either.
        rateLimit: rateLimit({
          lastReportAtMs: NOW - (REPORT_RATE_LIMIT.minGapSeconds + 1) * SECOND,
        }),
      }),
    );
  });

  it('allows a genuinely new report once the duplicate window has expired', () => {
    assertAllowed(
      limits({
        reportId: 'report-new',
        fingerprint: fingerprint({
          reportId: 'report-old',
          lastReportAtMs: NOW - (DUPLICATE_WINDOW_HOURS + 1) * HOUR,
        }),
        rateLimit: rateLimit({ lastReportAtMs: NOW - 2 * HOUR }),
      }),
    );
  });

  it('does not blame the user or imply their report was wrong', () => {
    const refusal = assertRefused(
      limits({ reportId: 'new', fingerprint: fingerprint({ reportId: 'old' }) }),
      'duplicate',
    );

    assert.match(refusal.message, /moderation queue/i);
    assert.doesNotMatch(refusal.message, /spam|abuse|blocked|banned/i);
  });

  it('is checked before the rate limit, so a duplicate does not consume the allowance', () => {
    assertRefused(
      limits({
        reportId: 'new',
        fingerprint: fingerprint({ reportId: 'old' }),
        rateLimit: rateLimit({ count: 1, lastReportAtMs: NOW - 2 * HOUR }),
      }),
      'duplicate',
    );
  });
});
