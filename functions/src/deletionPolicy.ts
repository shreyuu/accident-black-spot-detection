/**
 * What "delete my account" actually does to each piece of data.
 *
 * Pure and separately tested, because this is a policy decision with real
 * tension in it and the decision should be legible rather than buried in a loop
 * of `batch.delete()` calls.
 *
 * ## The tension
 *
 * Two obligations point in opposite directions:
 *
 *   - A person is entitled to have their personal data erased, and an app that
 *     keeps a copy after saying "deleted" is lying to them.
 *   - An **approved** report is the evidence behind a published black spot. If
 *     approving a report and then deleting the account silently withdrew the
 *     evidence, the black spot would be a warning with nothing behind it — and
 *     the audit trail would have a hole exactly where somebody had chosen to put
 *     one.
 *
 * ## The resolution
 *
 * Split by what the data *is*, not by which collection it sits in:
 *
 *   - **Personal data is erased.** The profile, emergency contacts (other
 *     people's phone numbers — the most sensitive thing held), alert logs (a
 *     record of where the person has been), the rate-limit counter and the
 *     report fingerprints all go, entirely.
 *   - **Photographs are erased**, including those attached to approved reports.
 *     They are the user's own content and can show faces and number plates that
 *     no moderation process consented to keep.
 *   - **Pending and rejected reports are erased.** Nothing was published from
 *     them, so nothing depends on them.
 *   - **Approved reports are anonymised, not erased.** The reporter link is
 *     replaced with a tombstone marker; what remains is the incident — where,
 *     what kind, how severe, when — which is a fact about a road rather than a
 *     fact about a person. After the link is cut it is no longer their data.
 *
 * This is a defensible reading, not the only one. An operator who would rather
 * delete approved reports outright should change `plans` below and nothing else;
 * an operator in a jurisdiction that requires retention should say so in the
 * privacy notice. Either way the choice is here, in one tested function, and not
 * spread across the deletion routine.
 */

/** Replaces `reporterId` on an anonymised report. Not a valid uid, so it can never match a caller. */
export const DELETED_REPORTER_MARKER = 'deleted-account';

export type ReportDisposition = 'delete' | 'anonymise';

export interface ReportSummary {
  id: string;
  status: string;
}

export interface DeletionPlan {
  /** Report ids to remove entirely. */
  reportsToDelete: string[];
  /** Report ids to keep with the reporter link cut. */
  reportsToAnonymise: string[];
}

/**
 * Decide what happens to one report.
 *
 * Anything not recognisably approved is deleted. That default is the safe
 * direction: an unknown status means this function and the report model have
 * diverged, and in that situation erasing the person's data is the failure to
 * prefer over silently retaining it.
 */
export function dispositionOf(status: string): ReportDisposition {
  return status === 'approved' ? 'anonymise' : 'delete';
}

export function planReportDeletion(reports: readonly ReportSummary[]): DeletionPlan {
  const plan: DeletionPlan = { reportsToDelete: [], reportsToAnonymise: [] };

  for (const report of reports) {
    if (dispositionOf(report.status) === 'anonymise') {
      plan.reportsToAnonymise.push(report.id);
    } else {
      plan.reportsToDelete.push(report.id);
    }
  }

  return plan;
}

/**
 * The fields written over an anonymised report.
 *
 * `imageUrls` is emptied in the same write that cuts the reporter link, so there
 * is never a moment where the document points at objects that have been deleted
 * from Storage.
 */
export function anonymisedReportFields(): Record<string, unknown> {
  return {
    reporterId: DELETED_REPORTER_MARKER,
    imageUrls: [],
    anonymisedAt: new Date(),
  };
}

/**
 * The tombstone written to `deletedAccounts`.
 *
 * Carries **no uid, no email, no location** — a deletion record that identified
 * the person would defeat the deletion it records. What it is for is answering
 * "did this run actually complete, and what did it touch", which needs counts
 * and a time and nothing else. The document id is random, so the record cannot
 * be looked up from a uid either.
 */
export interface DeletionReceipt {
  documentsDeleted: number;
  reportsAnonymised: number;
  imagesDeleted: number;
  deletedAt: Date;
}

export function buildDeletionReceipt(counts: {
  documentsDeleted: number;
  reportsAnonymised: number;
  imagesDeleted: number;
  now: Date;
}): DeletionReceipt {
  return {
    documentsDeleted: counts.documentsDeleted,
    reportsAnonymised: counts.reportsAnonymised,
    imagesDeleted: counts.imagesDeleted,
    deletedAt: counts.now,
  };
}
