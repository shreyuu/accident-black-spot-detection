import 'server-only';

import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';

import {
  buildAuditDetails,
  COLLECTIONS,
  normaliseAuditSummary,
  type AdminAuditInput,
} from '@accident-black-spot-detection/shared-types';

/**
 * Writing the audit trail.
 *
 * ## The one rule
 *
 * An audited action and its log entry are committed **in the same transaction**.
 * Not "the log is written immediately afterwards" — in the same commit, so
 * Firestore applies both or neither.
 *
 * The reason is that the alternative fails in exactly the wrong direction. A
 * report approved and then a log write that errored leaves a published decision
 * nobody can attribute; and the person best placed to notice is the one who
 * benefits from it not being noticed. Making the log part of the write means the
 * only way to skip the audit trail is to skip the action.
 *
 * That is why every function here takes a `Transaction` rather than doing its own
 * write: staging the entry is the caller's job, inside their transaction.
 */

/**
 * Stage an audit entry inside an existing transaction.
 *
 * `createdAt` is a server timestamp. An audit trail dated by a workstation clock
 * is worth very little — the sequence of events is the point, and a machine with
 * a wrong clock would reorder it.
 */
export function stageAuditEntry(
  firestore: Firestore,
  transaction: Transaction,
  input: AdminAuditInput,
): string {
  const reference = firestore.collection(COLLECTIONS.adminAuditLogs).doc();

  transaction.set(reference, {
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    summary: normaliseAuditSummary(input.summary),
    // Scalars only — see the note in shared-types/audit.ts for why the target
    // document is never copied in here.
    details: buildAuditDetails(input.details),
    createdAt: FieldValue.serverTimestamp(),
  });

  return reference.id;
}
