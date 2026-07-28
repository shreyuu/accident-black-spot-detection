import {
  collection,
  doc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';

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

/**
 * Write a report.
 *
 * `setDoc` on a reserved id rather than `addDoc`, for the idempotency described
 * above. The rules pin `status` to `'pending'` and reject any of the moderation
 * fields, so this write cannot publish anything.
 */
export async function createIncidentReport(
  reportId: string,
  payload: IncidentReportWritePayload,
): Promise<void> {
  const reportRef = doc(getFirebaseFirestore(), INCIDENT_REPORTS_COLLECTION, reportId);

  await setDoc(reportRef, {
    ...payload,
    // Server clock, not the device's. A backdated report would distort the
    // Phase 10 clustering and could be used to fake a history for a location.
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  logger.info('reportRepository', 'Submitted an incident report', {
    reportId,
    type: payload.type,
    imageCount: payload.imageUrls.length,
  });
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
