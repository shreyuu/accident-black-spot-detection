/**
 * Assembly of the "download my data" payload.
 *
 * Pure and separately tested, because the failure modes are asymmetric and both
 * are bad: giving somebody **too little** makes the export a token gesture that
 * does not honour the request, and giving them **too much** — anything derived
 * from another person's data — turns a privacy feature into a disclosure.
 *
 * ## What is included, and why
 *
 * Everything the app holds *about the requester*:
 *
 *   - the profile, including preferences;
 *   - every report they filed, whatever its moderation status, with the
 *     moderator's decision and notes — a person is entitled to know what was
 *     decided about their submission and why;
 *   - their emergency contacts;
 *   - their alert log.
 *
 * ## What is deliberately left out
 *
 * - **`reviewedBy`**, the moderator's uid. The requester is entitled to the
 *   decision, not to the identity of the person who made it; naming moderators
 *   in an export they can download is how a moderator gets harassed.
 * - **Internal counters** — the rate-limit document and report fingerprints.
 *   They are anti-abuse bookkeeping derived from the reports already in the
 *   export, and listing them tells a determined abuser exactly what the limits
 *   are keyed on.
 * - **Anything from another user**, which the queries never reach in the first
 *   place because every one of them is filtered to the requester's uid.
 */

export interface ExportInput {
  uid: string;
  profile: Record<string, unknown> | null;
  reports: readonly Record<string, unknown>[];
  emergencyContacts: readonly Record<string, unknown>[];
  alertLogs: readonly Record<string, unknown>[];
  generatedAt: Date;
}

export interface DataExport {
  format: string;
  generatedAt: string;
  account: Record<string, unknown> | null;
  reports: Record<string, unknown>[];
  emergencyContacts: Record<string, unknown>[];
  alertLogs: Record<string, unknown>[];
  notes: string[];
}

/**
 * A version marker on the format itself.
 *
 * An export is a file somebody keeps. Being able to tell which shape a file on
 * disk is in, two years later, costs one string.
 */
export const EXPORT_FORMAT = 'accident-black-spot-detection/data-export/v1';

/** Fields never copied into an export, whichever document they appear on. */
const REDACTED_FIELDS = new Set(['reviewedBy']);

/**
 * Copy a document, dropping redacted fields and normalising timestamps.
 *
 * Firestore `Timestamp` instances do not survive `JSON.stringify` in a readable
 * form — they serialise as `{_seconds, _nanoseconds}`, which is meaningless to
 * the person reading their own export. Anything with a `toDate()` becomes an
 * ISO 8601 string instead.
 */
function toExportable(document: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(document)) {
    if (REDACTED_FIELDS.has(key)) {
      continue;
    }
    result[key] = normaliseValue(value);
  }

  return result;
}

function normaliseValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date: unknown = (value as { toDate: () => unknown }).toDate();
    return date instanceof Date ? date.toISOString() : null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normaliseValue);
  }

  return value;
}

export function buildDataExport(input: ExportInput): DataExport {
  return {
    format: EXPORT_FORMAT,
    generatedAt: input.generatedAt.toISOString(),
    account: input.profile === null ? null : toExportable(input.profile),
    reports: input.reports.map(toExportable),
    emergencyContacts: input.emergencyContacts.map(toExportable),
    alertLogs: input.alertLogs.map(toExportable),
    notes: [
      'This file contains the data this app holds about your account.',
      'Photographs you attached to reports are not embedded here. Each report lists the URLs of its images, which you can download while your account exists.',
      'The identity of the moderator who reviewed a report is not included, but their decision and any notes are.',
      'Approved reports are kept if you delete your account, with your identity removed, because a published black spot warning depends on them.',
    ],
  };
}
