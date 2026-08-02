'use server';

import { revalidatePath } from 'next/cache';
import { geohashForLocation } from 'geofire-common';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import {
  buildReportModerationWrite,
  canManageBlackSpots,
  canManageRoles,
  COLLECTIONS,
  evaluateModerationDecision,
  findDisallowedModerationFields,
  MODERATION_DECISIONS,
  MODERATION_REFUSAL_MESSAGES,
  BLACK_SPOT_CATEGORIES,
  BLACK_SPOT_RADIUS_BOUNDS_M,
  RISK_LEVELS,
  USER_ROLES,
  type ReportStatus,
} from '@accident-black-spot-detection/shared-types';

import { stageAuditEntry } from '@/lib/auditLog';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebaseAdmin';
import { getDashboardActor } from '@/lib/session';

/**
 * Privileged actions.
 *
 * ## Why every one of these re-checks authorisation
 *
 * These run with the Admin SDK, which **bypasses Firestore security rules
 * entirely**. The rules that stop a mobile client approving its own report do not
 * apply to a single line in this file. So the checks are performed here as well,
 * against the same `evaluateModerationDecision` the rules mirror, and a failure
 * returns a refusal rather than proceeding.
 *
 * A server action is also a public HTTP endpoint. Next generates an id for it and
 * anything that can reach the app can invoke it — it is not protected by the fact
 * that the button rendering it is only shown to admins. Hence `getDashboardActor`
 * at the top of each one, never a parameter the caller supplies.
 *
 * ## Why the writes are transactions
 *
 * Each action commits the change and its audit entry together. See
 * `auditLog.ts` for why that is not merely tidy.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

const moderationSchema = z.object({
  reportId: z.string().trim().min(1),
  decision: z.enum(MODERATION_DECISIONS),
  notes: z.string().max(4000).optional(),
});

/**
 * Approve or reject one incident report.
 *
 * The report is read *inside* the transaction, so the status the authorisation
 * check sees is the status being written against. Reading it first and then
 * committing would leave a window in which two moderators both see `pending` and
 * both decide it — the second silently overwriting the first, with two audit
 * entries claiming to be the decision.
 */
export async function moderateReport(formData: FormData): Promise<ActionResult> {
  const actor = await getDashboardActor();
  if (actor === null) {
    return { ok: false, message: 'Your session has expired. Sign in again.' };
  }

  const parsed = moderationSchema.safeParse({
    reportId: formData.get('reportId'),
    decision: formData.get('decision'),
    notes: formData.get('notes') ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: 'That decision could not be read. Please try again.' };
  }

  const { reportId, decision, notes } = parsed.data;
  const firestore = getAdminFirestore();
  const reportRef = firestore.collection(COLLECTIONS.incidentReports).doc(reportId);

  try {
    const outcome = await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reportRef);

      if (!snapshot.exists) {
        return { ok: false, message: 'That report no longer exists.' } satisfies ActionResult;
      }

      const data = snapshot.data() ?? {};
      const reporterId = typeof data.reporterId === 'string' ? data.reporterId : '';
      const currentStatus = (
        typeof data.status === 'string' ? data.status : 'pending'
      ) as ReportStatus;

      const evaluation = evaluateModerationDecision({
        actorId: actor.uid,
        actorRole: actor.role,
        reporterId,
        currentStatus,
        decision,
        notes,
      });

      if (!evaluation.allowed) {
        return {
          ok: false,
          message: MODERATION_REFUSAL_MESSAGES[evaluation.reason],
        } satisfies ActionResult;
      }

      const write = {
        ...buildReportModerationWrite({ actorId: actor.uid, decision, notes }),
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      /**
       * Final assertion before a privileged write.
       *
       * `buildReportModerationWrite` already assembles the payload field by
       * field, so this should never fire. It is here because the thing being
       * guarded — a moderation decision quietly rewriting a report's description
       * or coordinates — is severe enough to be worth a belt as well as braces.
       */
      const disallowed = findDisallowedModerationFields(write);
      if (disallowed.length > 0) {
        throw new Error(`Refusing to write disallowed fields: ${disallowed.join(', ')}`);
      }

      transaction.update(reportRef, write);

      stageAuditEntry(firestore, transaction, {
        actorId: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: decision === 'approved' ? 'report.approved' : 'report.rejected',
        targetType: 'incidentReport',
        targetId: reportId,
        summary: `${decision === 'approved' ? 'Approved' : 'Rejected'} a ${String(data.type)} report`,
        details: {
          decision,
          previousStatus: currentStatus,
          reportType: String(data.type),
          severity: String(data.severity),
          hasNote: (notes?.trim().length ?? 0) > 0,
        },
      });

      return {
        ok: true,
        message:
          decision === 'approved'
            ? 'Approved. This counts as evidence for the area — it does not publish a black spot.'
            : 'Rejected. The reporter will see your note.',
      } satisfies ActionResult;
    });

    if (outcome.ok) {
      revalidatePath('/reports');
      revalidatePath('/audit');
    }

    return outcome;
  } catch (error) {
    console.error('[actions] moderateReport failed', error);
    return { ok: false, message: 'That decision could not be saved. Please try again.' };
  }
}

// -----------------------------------------------------------------------------
// Black spots
// -----------------------------------------------------------------------------

const blackSpotSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(BLACK_SPOT_CATEGORIES),
  riskLevel: z.enum(RISK_LEVELS),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusM: z.coerce
    .number()
    .int()
    .min(BLACK_SPOT_RADIUS_BOUNDS_M.min)
    .max(BLACK_SPOT_RADIUS_BOUNDS_M.max),
});

/**
 * Publish a new black spot.
 *
 * Admin-only, a deliberately higher bar than moderating a report: approving a
 * report records that somebody believed it, whereas this puts a warning in front
 * of every user who goes near the location.
 *
 * Created with `verified: true` and `active: true` because an admin creating one
 * by hand *is* the verification step — there is no second workflow behind it. The
 * algorithm-proposed candidates of Phase 10 are the case that arrives
 * unverified, and they will need an approval path of their own.
 */
export async function createBlackSpot(formData: FormData): Promise<ActionResult> {
  const actor = await getDashboardActor();
  if (actor === null) {
    return { ok: false, message: 'Your session has expired. Sign in again.' };
  }

  if (!canManageBlackSpots(actor.role)) {
    return {
      ok: false,
      message: 'Only an administrator can publish a black spot. A moderator can decide reports.',
    };
  }

  const parsed = blackSpotSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? undefined,
    category: formData.get('category'),
    riskLevel: formData.get('riskLevel'),
    latitude: formData.get('latitude'),
    longitude: formData.get('longitude'),
    radiusM: formData.get('radiusM'),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      message: `Check the form: ${first?.path.join('.') ?? 'a field'} ${first?.message ?? 'is invalid'}.`,
    };
  }

  const values = parsed.data;
  const firestore = getAdminFirestore();
  const reference = firestore.collection(COLLECTIONS.blackSpots).doc();

  try {
    await firestore.runTransaction(async (transaction) => {
      transaction.set(reference, {
        name: values.name,
        ...(values.description === undefined || values.description.length === 0
          ? {}
          : { description: values.description }),
        category: values.category,
        latitude: values.latitude,
        longitude: values.longitude,
        // The same precision the mobile app writes, so both sets of documents can
        // be range-scanned together.
        geohash: geohashForLocation([values.latitude, values.longitude], 10),
        radiusM: values.radiusM,
        riskLevel: values.riskLevel,
        // Phase 10 computes a real score; a hand-created spot has none yet, and
        // inventing one would put a number on the map that means nothing.
        severityScore: 0,
        accidentCount: 0,
        crimeCount: 0,
        reportCount: 0,
        verified: true,
        active: true,
        source: 'manual',
        createdBy: actor.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      stageAuditEntry(firestore, transaction, {
        actorId: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'blackSpot.created',
        targetType: 'blackSpot',
        targetId: reference.id,
        summary: `Published black spot "${values.name}"`,
        details: {
          category: values.category,
          riskLevel: values.riskLevel,
          radiusM: values.radiusM,
          latitude: values.latitude,
          longitude: values.longitude,
        },
      });
    });

    revalidatePath('/black-spots');
    revalidatePath('/audit');
    return { ok: true, message: `Published "${values.name}". It is now visible to users nearby.` };
  } catch (error) {
    console.error('[actions] createBlackSpot failed', error);
    return { ok: false, message: 'That black spot could not be saved. Please try again.' };
  }
}

/**
 * Withdraw or restore a black spot.
 *
 * Deactivation rather than deletion. The mobile app only ever reads
 * `verified && active`, so clearing `active` removes the warning from every
 * client immediately, while keeping the record and its audit history — which
 * matters when the question later is "why were users warned about this junction
 * for six months".
 */
export async function setBlackSpotActive(formData: FormData): Promise<ActionResult> {
  const actor = await getDashboardActor();
  if (actor === null) {
    return { ok: false, message: 'Your session has expired. Sign in again.' };
  }

  if (!canManageBlackSpots(actor.role)) {
    return { ok: false, message: 'Only an administrator can withdraw or restore a black spot.' };
  }

  const parsed = z
    .object({ blackSpotId: z.string().trim().min(1), active: z.enum(['true', 'false']) })
    .safeParse({ blackSpotId: formData.get('blackSpotId'), active: formData.get('active') });

  if (!parsed.success) {
    return { ok: false, message: 'That request could not be read.' };
  }

  const nextActive = parsed.data.active === 'true';
  const firestore = getAdminFirestore();
  const reference = firestore.collection(COLLECTIONS.blackSpots).doc(parsed.data.blackSpotId);

  try {
    const outcome = await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) {
        return { ok: false, message: 'That black spot no longer exists.' } satisfies ActionResult;
      }

      const name = String(snapshot.data()?.name ?? 'this location');

      transaction.update(reference, {
        active: nextActive,
        updatedAt: FieldValue.serverTimestamp(),
      });

      stageAuditEntry(firestore, transaction, {
        actorId: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: nextActive ? 'blackSpot.reactivated' : 'blackSpot.deactivated',
        targetType: 'blackSpot',
        targetId: parsed.data.blackSpotId,
        summary: `${nextActive ? 'Restored' : 'Withdrew'} black spot "${name}"`,
        details: { active: nextActive },
      });

      return {
        ok: true,
        message: nextActive
          ? `Restored "${name}". Users nearby will be warned again.`
          : `Withdrew "${name}". Users will no longer be warned about it.`,
      } satisfies ActionResult;
    });

    if (outcome.ok) {
      revalidatePath('/black-spots');
      revalidatePath('/audit');
    }
    return outcome;
  } catch (error) {
    console.error('[actions] setBlackSpotActive failed', error);
    return { ok: false, message: 'That change could not be saved. Please try again.' };
  }
}

/**
 * Grant or withdraw a role (Phase 12).
 *
 * Resolves the `TODO(phase-12)` in `firebase/scripts/grantRole.mjs`. That script
 * remains, and remains necessary: **the first administrator has to come from
 * outside the system**, because a dashboard that could create its own first
 * admin would be a dashboard anyone could create an admin in. This action
 * promotes subsequent operators, and only an existing admin may call it.
 *
 * ## The three things that happen together
 *
 * 1. **The custom claim is set.** The claim is the authority everywhere — the
 *    Firestore rules read `request.auth.token.role`, and `getActor` reads the
 *    verified token. Nothing consults the Firestore copy for an access decision.
 * 2. **The profile's `role` field is updated**, for display only. If the two ever
 *    disagree the claim wins and the document is merely wrong, which grants
 *    nothing.
 * 3. **Refresh tokens are revoked.** Without this a demotion would not take
 *    effect until the target's session cookie expired — up to twelve hours in
 *    which somebody whose access had just been withdrawn could still moderate.
 *    For an account demoted *because* of what it was doing, that window is the
 *    entire point of demoting it. `verifySessionCookie(cookie, true)` in
 *    `lib/session.ts` is the other half: it re-checks revocation per request.
 *
 * The audit entry is written in the same transaction as the profile update, as
 * every privileged action in this file is.
 */
export async function setUserRole(formData: FormData): Promise<ActionResult> {
  const actor = await getDashboardActor();
  if (actor === null) {
    return { ok: false, message: 'Your session has expired. Sign in again.' };
  }

  if (!canManageRoles(actor.role)) {
    return { ok: false, message: 'Only an administrator can change roles.' };
  }

  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().email(),
      role: z.enum(USER_ROLES),
    })
    .safeParse({ email: formData.get('email'), role: formData.get('role') });

  if (!parsed.success) {
    return { ok: false, message: 'Enter a valid email address and choose a role.' };
  }

  const { email, role } = parsed.data;

  let target;
  try {
    target = await getAdminAuth().getUserByEmail(email);
  } catch {
    // Said plainly. This is an admin-only screen reached by someone who already
    // knows the address they typed, so "no such account" reveals nothing they
    // did not already assume — and "something went wrong" would send them
    // hunting for a fault that is really a typo.
    return {
      ok: false,
      message: `No account exists for ${email}. They need to register in the app first.`,
    };
  }

  /**
   * An admin may not change their own role.
   *
   * The same principle as not approving your own report, and it protects against
   * the duller failure too: an admin who demotes themselves by accident locks
   * everyone out of role management, and the only way back is the bootstrap
   * script and a shell.
   */
  if (target.uid === actor.uid) {
    return { ok: false, message: 'You cannot change your own role. Ask another administrator.' };
  }

  try {
    // The claim first. If the transaction below fails, the worst outcome is a
    // profile document that disagrees with the claim — and the claim is the one
    // that decides, so access is never left in a state nobody intended.
    await getAdminAuth().setCustomUserClaims(target.uid, { role });

    const firestore = getAdminFirestore();
    await firestore.runTransaction(async (transaction) => {
      const reference = firestore.collection(COLLECTIONS.users).doc(target.uid);
      const snapshot = await transaction.get(reference);

      if (snapshot.exists) {
        transaction.update(reference, { role, updatedAt: FieldValue.serverTimestamp() });
      }

      stageAuditEntry(firestore, transaction, {
        actorId: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'role.granted',
        targetType: 'user',
        targetId: target.uid,
        summary: `Set ${email} to ${role}`,
        details: { role, email },
      });
    });

    // After the claim is set, so the next token they mint carries the new role.
    await getAdminAuth().revokeRefreshTokens(target.uid);

    revalidatePath('/roles');
    revalidatePath('/audit');

    return {
      ok: true,
      message:
        role === 'user'
          ? `${email} is no longer a moderator. Any session they had is already invalid.`
          : `${email} is now ${role === 'admin' ? 'an administrator' : 'a moderator'}. They will need to sign in again.`,
    };
  } catch (error) {
    console.error('[actions] setUserRole failed', error);
    return { ok: false, message: 'That role change could not be saved. Please try again.' };
  }
}
