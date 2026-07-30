import { canModerateReports, type UserRole } from './roles.ts';
import { MODERATION_ONLY_FIELDS, type ReportStatus } from './vocabulary.ts';

/**
 * Whether a moderation decision is permitted, and what it writes.
 *
 * Pure, exhaustively tested, and shared by the admin dashboard and the Firestore
 * rules tests. This is the Phase 7 equivalent of the proximity engine: the rule
 * that a user cannot approve their own report lives here, and it is the reason
 * the reporting flow cannot be turned into a way to publish warnings about
 * yourself.
 *
 * ## Why this exists as well as the Firestore rules
 *
 * The rules are the control for anything a *client* does. But the dashboard
 * writes through the Admin SDK, which **bypasses Firestore rules entirely** —
 * that is the whole point of a privileged credential. So the same checks have to
 * exist in code that runs before the Admin SDK is called, and they have to agree
 * with the rules exactly. Putting them in one tested function is how they agree.
 *
 * Neither copy is redundant: remove the rules and a tampered mobile client could
 * approve its own report; remove this and the dashboard could.
 */

/** A decision a moderator may reach. Never back to `pending` or `draft`. */
export const MODERATION_DECISIONS = ['approved', 'rejected'] as const;
export type ModerationDecision = (typeof MODERATION_DECISIONS)[number];

/**
 * Why a decision was refused.
 *
 * Machine-readable so the dashboard can render the right message and the tests
 * can assert on the cause rather than on prose.
 */
export type ModerationRefusal =
  /** The actor's role does not permit moderating reports. */
  | 'not-a-moderator'
  /** The actor is the reporter. The rule this whole module exists for. */
  | 'own-report'
  /** The report has already been decided. */
  | 'already-decided'
  /** A rejection was submitted with no explanation for the reporter. */
  | 'missing-rejection-note'
  /** The note exceeds what the document permits. */
  | 'note-too-long'
  /** The actor is not identifiable, so the decision could not be attributed. */
  | 'unknown-actor';

export type ModerationEvaluation =
  { allowed: true } | { allowed: false; reason: ModerationRefusal };

/** Upper bound on a moderator's note. Mirrored in firestore.rules. */
export const MODERATION_NOTE_MAX_LENGTH = 2000;

export interface ModerationContext {
  actorId: string;
  actorRole: UserRole | null | undefined;
  /** The uid on the report being decided. */
  reporterId: string;
  /** The report's status as currently stored. */
  currentStatus: ReportStatus;
  decision: ModerationDecision;
  /** The moderator's explanation. Required when rejecting. */
  notes?: string | undefined;
}

/**
 * Decide whether this moderation action may proceed.
 *
 * The order of the checks is deliberate: role first, then self-approval, then
 * state, then input quality. It means the reason surfaced for a plain user
 * attempting to approve their own report is "you are not a moderator" rather
 * than a note-formatting complaint, which is the more useful and less
 * informative-to-an-attacker answer.
 */
export function evaluateModerationDecision(context: ModerationContext): ModerationEvaluation {
  const { actorId, actorRole, reporterId, currentStatus, decision, notes } = context;

  if (actorId.trim().length === 0) {
    return { allowed: false, reason: 'unknown-actor' };
  }

  if (!canModerateReports(actorRole)) {
    return { allowed: false, reason: 'not-a-moderator' };
  }

  /**
   * The rule the phase turns on.
   *
   * Checked by identity, not by role: an admin approving their own report is
   * just as much a conflict of interest as a user doing it, and being trusted
   * with the dashboard does not make someone impartial about their own
   * submission. There is no override, deliberately — a genuine case is handled
   * by a second moderator, which is the whole idea.
   */
  if (actorId === reporterId) {
    return { allowed: false, reason: 'own-report' };
  }

  /**
   * Only a pending report can be decided.
   *
   * Re-deciding is refused rather than allowed-and-audited, because an approved
   * report may already have been used as evidence for a published black spot,
   * and silently flipping it would leave that warning resting on something the
   * audit trail says was rejected.
   *
   * TODO(phase-12): a supervised correction path — a second admin reopening a
   * decided report, with the reversal itself audited — is the right way to fix a
   * mistake, and is out of scope here.
   */
  if (currentStatus !== 'pending') {
    return { allowed: false, reason: 'already-decided' };
  }

  const trimmedNotes = notes?.trim() ?? '';

  /**
   * A rejection must say why.
   *
   * The reporter sees this text. Someone who took the trouble to report a hazard
   * and is told only "not accepted" learns nothing, cannot correct a fixable
   * problem, and reasonably stops reporting. An approval needs no note because
   * the outcome already speaks for itself.
   */
  if (decision === 'rejected' && trimmedNotes.length === 0) {
    return { allowed: false, reason: 'missing-rejection-note' };
  }

  if (trimmedNotes.length > MODERATION_NOTE_MAX_LENGTH) {
    return { allowed: false, reason: 'note-too-long' };
  }

  return { allowed: true };
}

/** Human-readable copy per refusal, shown in the dashboard. */
export const MODERATION_REFUSAL_MESSAGES: Record<ModerationRefusal, string> = {
  'not-a-moderator': 'Your account does not have permission to decide reports.',
  'own-report':
    'You cannot decide your own report. Ask another moderator to review it — this restriction has no override.',
  'already-decided': 'This report has already been decided and cannot be changed here.',
  'missing-rejection-note':
    'Add a short explanation. The person who reported this will read it, and “not accepted” on its own tells them nothing.',
  'note-too-long': `Keep the note under ${MODERATION_NOTE_MAX_LENGTH} characters.`,
  'unknown-actor': 'Your session could not be identified. Sign in again.',
};

/**
 * Exactly the fields a moderation decision writes.
 *
 * Assembled field by field rather than by spreading caller input, for the same
 * reason `buildIncidentReportPayload` is: it makes it structurally impossible
 * for a decision to also rewrite the report's description, coordinates or
 * photographs. A moderator judges a report; they do not get to edit it into
 * something else and then approve that.
 *
 * `updatedAt` and `reviewedAt` are omitted — the caller supplies server
 * timestamps, because the server clock is authoritative and an audit trail dated
 * by a workstation clock is worth very little.
 */
export interface ReportModerationWrite {
  status: ModerationDecision;
  reviewedBy: string;
  /** Omitted entirely when there is no note, never written as undefined. */
  moderationNotes?: string;
}

export function buildReportModerationWrite(context: {
  actorId: string;
  decision: ModerationDecision;
  notes?: string | undefined;
}): ReportModerationWrite {
  const trimmed = context.notes?.trim() ?? '';

  return {
    status: context.decision,
    reviewedBy: context.actorId,
    ...(trimmed.length === 0 ? {} : { moderationNotes: trimmed }),
  };
}

/**
 * Guard against a moderation write touching anything it should not.
 *
 * Used by the dashboard's server action as a final assertion before the Admin
 * SDK call. It exists because the Admin SDK will happily write whatever it is
 * given, so the last line of defence has to be in our own code.
 */
export function findDisallowedModerationFields(payload: Record<string, unknown>): string[] {
  const permitted = new Set<string>([
    ...MODERATION_ONLY_FIELDS,
    'updatedAt',
    'reviewedAt',
    'moderationNotes',
  ]);

  return Object.keys(payload).filter((key) => !permitted.has(key));
}
