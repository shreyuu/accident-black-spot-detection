import type { AdminAuditAction, AuditTargetType } from './vocabulary.ts';

/**
 * The audit trail for privileged actions.
 *
 * ## What is deliberately not stored
 *
 * No before/after copy of the target document. It is tempting — a diff is
 * genuinely useful — but an audit entry for a moderated report would then hold a
 * second copy of the reporter's free text and coordinates, in a collection with
 * different access rules and no deletion path. The target id already points at
 * the document; the trail records *who decided what, and when*, not a duplicate
 * of the evidence.
 *
 * `details` therefore carries only scalars a reader needs to understand the
 * entry without opening the target — the decision reached, the previous status,
 * a black spot's risk level. `buildAuditDetails` enforces that.
 *
 * ## Why entries are immutable and undeletable
 *
 * An audit trail an administrator can edit is not an audit trail. `firestore.rules`
 * denies every client write, and the only writer is the Admin SDK inside the
 * dashboard's server actions, where each entry is committed in the same
 * transaction as the action it records — so an action cannot happen without its
 * log entry, and vice versa.
 */

export interface AdminAuditLogEntry {
  id: string;
  /** uid of the moderator or admin who acted. */
  actorId: string;
  /** Their email at the time, so a trail stays readable after an account goes. */
  actorEmail: string;
  actorRole: string;
  action: AdminAuditAction;
  targetType: AuditTargetType;
  targetId: string;
  /** One line a human can scan without opening the target. */
  summary: string;
  /** Scalars only — see the note above. */
  details: Record<string, string | number | boolean>;
  /** Server timestamp. Typed loosely so both SDKs can satisfy it. */
  createdAt: unknown;
}

/** The fields a writer supplies; the rest are derived or server-set. */
export interface AdminAuditInput {
  actorId: string;
  actorEmail: string;
  actorRole: string;
  action: AdminAuditAction;
  targetType: AuditTargetType;
  targetId: string;
  summary: string;
  details?: Record<string, unknown> | undefined;
}

export const AUDIT_SUMMARY_MAX_LENGTH = 300;

/**
 * Reduce arbitrary detail to the scalars an audit entry may hold.
 *
 * Anything that is not a string, finite number or boolean is dropped rather than
 * stringified. Stringifying would quietly reintroduce exactly what the note
 * above rules out: an object spread into the log carrying a description, a
 * coordinate pair, or a contact's phone number.
 *
 * Strings are also truncated, so a long free-text field cannot be smuggled in
 * whole by putting it on a scalar key.
 */
export const AUDIT_DETAIL_VALUE_MAX_LENGTH = 120;

export function buildAuditDetails(
  input: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> {
  if (input === undefined) {
    return {};
  }

  const details: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'boolean') {
      details[key] = value;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      details[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      details[key] = value.slice(0, AUDIT_DETAIL_VALUE_MAX_LENGTH);
      continue;
    }
    // Objects, arrays, null, undefined and functions are dropped on purpose.
  }

  return details;
}

/** Trim a summary to the stored bound. */
export function normaliseAuditSummary(summary: string): string {
  return summary.trim().slice(0, AUDIT_SUMMARY_MAX_LENGTH);
}
