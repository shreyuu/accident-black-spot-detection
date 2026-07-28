import type { IncidentSeverity, IncidentType, ReportStatus } from '@/types/domain';

/**
 * User-facing wording for reports.
 *
 * Centralised so the promise made on the form matches the one made on the
 * history screen. The status copy in particular is load-bearing: a reporter who
 * believes their pending report is already warning other drivers has been
 * misled, and would reasonably stop reporting when they learn otherwise.
 */

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  accident: 'Accident',
  crime: 'Crime',
  pothole: 'Pothole or road damage',
  'unsafe-road': 'Unsafe road design',
  other: 'Something else',
};

/** One-line explanations, shown under each option so the choice is unambiguous. */
export const INCIDENT_TYPE_HINTS: Record<IncidentType, string> = {
  accident: 'A collision, or a near miss.',
  crime: 'Theft, assault or harassment at a location.',
  pothole: 'Surface damage, debris or flooding.',
  'unsafe-road': 'Poor visibility, missing signs, no lighting.',
  other: 'Anything else drivers or pedestrians should know.',
};

export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const INCIDENT_SEVERITY_HINTS: Record<IncidentSeverity, string> = {
  low: 'Inconvenient, but nobody was at risk.',
  medium: 'Could cause an injury or damage.',
  high: 'Someone was hurt, or very nearly was.',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: 'Draft',
  pending: 'Awaiting review',
  approved: 'Approved',
  rejected: 'Not accepted',
};

/**
 * What each status actually means for the reporter.
 *
 * Note what `approved` does *not* say. An approved report is evidence a
 * moderator accepted; it does not mean a black spot now exists at that location,
 * because publishing one is a separate decision. Saying otherwise would be the
 * easiest possible way to imply coverage the app does not have.
 */
export const REPORT_STATUS_DESCRIPTIONS: Record<ReportStatus, string> = {
  draft: 'Not submitted yet.',
  pending:
    'A moderator has not reviewed this yet. It is not visible to other people and is not shown as a black spot.',
  approved:
    'A moderator accepted this report. It counts as evidence for the area, which may or may not lead to a black spot being published there.',
  rejected: 'A moderator did not accept this report. Nothing about it is shown to other people.',
};

/** Shown on the form itself, above the submit button. */
export const REPORT_SUBMISSION_NOTICE =
  'Your report goes to a moderator for review. It is not published automatically and will not warn ' +
  'other people unless it is approved. Report emergencies to the emergency services first — this ' +
  'app does not contact them.';

/** Shown after a successful submission. */
export const REPORT_SUBMITTED_NOTICE =
  'Thank you. Your report has been received and is waiting for a moderator to review it. You can ' +
  'follow its progress in My reports.';

/** Shown above the location picker. */
export const REPORT_LOCATION_NOTICE =
  'This is where the report will be filed. Drag the pin if the incident happened somewhere else ' +
  'nearby. Only this one position is stored — the app does not keep a history of where you have been.';

/** Shown next to the photo picker. */
export const REPORT_PHOTO_NOTICE =
  'Photos are optional and are visible to moderators. Do not photograph people, number plates or ' +
  'anything identifying if you can avoid it, and never take a photo while driving.';
