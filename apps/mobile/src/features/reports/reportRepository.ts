import {
  collection,
  doc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';

import {
  buildReportFingerprintId,
  evaluateReportLimits,
  type ReportFingerprintState,
  type ReportLimitRefusal,
  type ReportRateLimitState,
} from '@accident-black-spot-detection/shared-types';

import type { IncidentReportWritePayload } from '@/features/reports/reportDocument';
import { incidentReportDocumentSchema } from '@/features/reports/reportSchemas';
import { getFirebaseFirestore } from '@/services/firebase/app';
import type { IncidentReport } from '@/types/domain';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Data access for `incidentReports`.
 *
 * Reads are scoped to the caller's own reports, which mirrors the security rule
 * exactly. Firestore evaluates rules per returned document, so a query without
 * the `reporterId` filter is rejected outright rather than filtered — the filter
 * is therefore load-bearing, not an optimisation.
 */

export const INCIDENT_REPORTS_COLLECTION = 'incidentReports';

/** Reports fetched for the history screen. Bounded so one query stays cheap. */
export const MY_REPORTS_PAGE_SIZE = 50;

/**
 * Reserve a document id without writing anything.
 *
 * The id is generated once per submission attempt and reused by every retry, so
 * a "try again" after a create that actually succeeded but whose response was
 * lost overwrites the same document instead of filing a duplicate report. A
 * moderator seeing the same incident three times cannot tell a flaky connection
 * from someone inflating a location's apparent danger.
 */
export function reserveIncidentReportId(): string {
  return doc(collection(getFirebaseFirestore(), INCIDENT_REPORTS_COLLECTION)).id;
}

export const RATE_LIMITS_COLLECTION = 'reportRateLimits';
export const FINGERPRINTS_COLLECTION = 'reportFingerprints';

/** Refusal reason → the `AppError` kind that gives the right UI affordance. */
function toLimitError(refusal: ReportLimitRefusal): AppError {
  return new AppError('validation', refusal.message, {
    // Never retryable. A "Try again" button on a rate limit does nothing but
    // hammer the lockout — see the note on `retryable` in utils/errors.ts.
    retryable: false,
    technicalMessage: `Report refused: ${refusal.reason}; retry after ${refusal.retryAfterMs}ms.`,
  });
}

/**
 * Write a report, its rate-limit counter and its duplicate fingerprint together.
 *
 * ## Why this is a transaction and not three writes
 *
 * The Firestore rules refuse a report unless the counter and the fingerprint are
 * committed **in the same commit** — they read the post-commit state with
 * `getAfter` and require its `lastReportAt` to equal `request.time`. So the
 * three writes have to be atomic regardless.
 *
 * A `writeBatch` would satisfy that, but not correctly: the new count has to be
 * *read* first, and a read followed by a separate batch is a race. Two
 * submissions can read `count: 3` and both write `4`. The rules make that race
 * fail closed rather than over-count — the second write finds `resource.count`
 * already 4 and refuses — but the user gets an unexplained error. A transaction
 * retries instead, which is the behaviour that belongs here.
 *
 * ## Why this needs a connection
 *
 * Transactions require a server round-trip and do not work offline, so an
 * offline submission fails here rather than being queued into Firestore's local
 * write log. That is deliberate and not a regression: the Phase 11 draft queue
 * is what holds a report until connectivity returns, and it retries through this
 * same path. A queued Firestore write would have been evaluated against the
 * rules only at sync time, so a rate-limited or duplicate report would have
 * failed silently, long after the user had been told it was sent.
 *
 * @param now Injected clock, used only to choose the *message*. The server
 *   re-derives every limit from `request.time`, so a skewed device clock can
 *   make this function more conservative than the server but never more
 *   permissive.
 */
export async function createIncidentReport(
  reportId: string,
  payload: IncidentReportWritePayload,
  now: number = Date.now(),
): Promise<void> {
  const firestore = getFirebaseFirestore();
  const reportRef = doc(firestore, INCIDENT_REPORTS_COLLECTION, reportId);
  const rateLimitRef = doc(firestore, RATE_LIMITS_COLLECTION, payload.reporterId);
  const fingerprintRef = doc(
    firestore,
    FINGERPRINTS_COLLECTION,
    buildReportFingerprintId(payload.reporterId, payload.type, payload.geohash),
  );

  let alreadySubmitted = false;

  await runTransaction(firestore, async (transaction) => {
    // Reads first: Firestore requires every read in a transaction to precede
    // every write.
    const [existingReport, rateLimitSnapshot, fingerprintSnapshot] = await Promise.all([
      transaction.get(reportRef),
      transaction.get(rateLimitRef),
      transaction.get(fingerprintRef),
    ]);

    /**
     * The retry-after-a-lost-response case.
     *
     * The reserved id is reused across retries, so if the first attempt actually
     * committed, the document is already here. Rewriting it is not an option —
     * `allow update: if false` on `incidentReports` refuses a second `set` onto
     * an existing document — and there is nothing to fix, so this is success.
     * Reporting it as an error would push the user into filing a duplicate.
     */
    if (existingReport.exists()) {
      alreadySubmitted = true;
      return;
    }

    const rateLimit = toRateLimitState(rateLimitSnapshot.data(), payload.reporterId);
    const fingerprint = toFingerprintState(fingerprintSnapshot.data());

    const decision = evaluateReportLimits({
      rateLimit,
      fingerprint,
      reporterId: payload.reporterId,
      reportId,
      nowMs: now,
    });

    if (!decision.allowed) {
      // Aborts the transaction. Nothing is written, so a refused submission does
      // not consume the allowance it was refused by.
      throw toLimitError(decision.refusal);
    }

    const { nextRateLimit } = decision;

    transaction.set(rateLimitRef, {
      userId: payload.reporterId,
      // The *existing* Timestamp is written back unchanged when the window is
      // still current. The rule compares it for exact equality, so rebuilding it
      // from milliseconds would drift and be refused.
      windowStartAt:
        rateLimit !== null && nextRateLimit.windowStartAtMs === rateLimit.windowStartAtMs
          ? rateLimitSnapshot.get('windowStartAt')
          : serverTimestamp(),
      count: nextRateLimit.count,
      lastReportAt: serverTimestamp(),
    });

    transaction.set(fingerprintRef, {
      reporterId: payload.reporterId,
      reportId,
      lastReportAt: serverTimestamp(),
    });

    transaction.set(reportRef, {
      ...payload,
      // Server clock, not the device's. A backdated report would distort the
      // Phase 10 clustering and could be used to fake a history for a location.
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  if (alreadySubmitted) {
    logger.info('reportRepository', 'Report was already submitted; treating the retry as success', {
      reportId,
    });
    return;
  }

  logger.info('reportRepository', 'Submitted an incident report', {
    reportId,
    type: payload.type,
    imageCount: payload.imageUrls.length,
  });
}

/** Read the counter into the shape the shared limit logic expects, or `null`. */
function toRateLimitState(
  data: DocumentData | undefined,
  reporterId: string,
): ReportRateLimitState | null {
  if (data === undefined) {
    return null;
  }

  const windowStartAt = data.windowStartAt as Timestamp | undefined;
  const lastReportAt = data.lastReportAt as Timestamp | undefined;

  // A half-written counter is treated as absent. The rules are what decide
  // whether the resulting write is legal, and guessing at a malformed document
  // here would only produce a worse error message.
  if (windowStartAt === undefined || lastReportAt === undefined || typeof data.count !== 'number') {
    return null;
  }

  return {
    userId: reporterId,
    windowStartAtMs: windowStartAt.toMillis(),
    count: data.count,
    lastReportAtMs: lastReportAt.toMillis(),
  };
}

function toFingerprintState(data: DocumentData | undefined): ReportFingerprintState | null {
  if (data === undefined) {
    return null;
  }

  const lastReportAt = data.lastReportAt as Timestamp | undefined;
  if (lastReportAt === undefined || typeof data.reportId !== 'string') {
    return null;
  }

  return {
    reporterId: typeof data.reporterId === 'string' ? data.reporterId : '',
    reportId: data.reportId,
    lastReportAtMs: lastReportAt.toMillis(),
  };
}

/** Parse one snapshot, returning `null` rather than throwing on a bad record. */
function parseSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): IncidentReport | null {
  const raw = snapshot.data();
  const result = incidentReportDocumentSchema.safeParse({ ...raw, id: snapshot.id });

  if (!result.success) {
    // One malformed document must not blank the whole history list.
    logger.warn('reportRepository', 'Skipping a report that failed validation', {
      reportId: snapshot.id,
      issues: result.error.issues.map((issue) => issue.path.join('.')),
    });
    return null;
  }

  const { moderationNotes, reviewedBy, ...rest } = result.data;

  return {
    ...rest,
    // Omitted rather than set to undefined — see userProfileRepository.
    ...(moderationNotes === undefined || moderationNotes.length === 0 ? {} : { moderationNotes }),
    ...(reviewedBy === undefined || reviewedBy.length === 0 ? {} : { reviewedBy }),
    occurredAt: (raw.occurredAt as Timestamp | undefined) ?? null,
    reviewedAt: (raw.reviewedAt as Timestamp | undefined) ?? null,
    createdAt: (raw.createdAt as Timestamp | undefined) ?? null,
    updatedAt: (raw.updatedAt as Timestamp | undefined) ?? null,
  };
}

/**
 * A user's own reports, newest first.
 *
 * Ordered by `createdAt`, which is a server timestamp and is therefore briefly
 * `null` on a locally-echoed write before the server confirms it. Firestore
 * still orders such a document last; the UI labels it as sending rather than
 * pretending it has a submission time.
 */
export async function fetchMyReports(
  reporterId: string,
  limitCount: number = MY_REPORTS_PAGE_SIZE,
): Promise<IncidentReport[]> {
  const reportsRef = collection(getFirebaseFirestore(), INCIDENT_REPORTS_COLLECTION);

  const snapshot = await getDocs(
    query(
      reportsRef,
      where('reporterId', '==', reporterId),
      orderBy('createdAt', 'desc'),
      limitTo(limitCount),
    ),
  );

  /**
   * `getDocs` does not reject when offline — it resolves from Firestore's own
   * local cache, which on a fresh install is empty. "You have no reports" and
   * "we could not check" must never look the same, so an entirely-cached result
   * with nothing in it is reported as a network failure. See the longer note in
   * blackSpotRepository.
   *
   * A cached result that *does* contain documents is served: those are the
   * user's own reports, echoed from a write they just made, and showing them is
   * better than an error.
   */
  if (snapshot.metadata.fromCache && snapshot.empty) {
    throw new AppError('network', 'Could not load your reports — you appear to be offline.', {
      retryable: true,
      technicalMessage: 'The reports query resolved empty from the Firestore local cache.',
    });
  }

  const reports: IncidentReport[] = [];
  for (const document of snapshot.docs) {
    const report = parseSnapshot(document);
    if (report === null) {
      continue;
    }

    // Defence in depth. The rules and the query both scope this to the caller,
    // but another user's report must never be rendered under "My reports".
    if (report.reporterId !== reporterId) {
      logger.warn('reportRepository', 'Discarded a report belonging to another user', {
        reportId: report.id,
      });
      continue;
    }

    reports.push(report);
  }

  return reports;
}
