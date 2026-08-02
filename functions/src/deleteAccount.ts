import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

import { COLLECTIONS, REPORT_IMAGES_PREFIX } from './collections.ts';
import {
  anonymisedReportFields,
  buildDeletionReceipt,
  planReportDeletion,
} from './deletionPolicy.ts';
import { adminAuth, adminBucket, adminFirestore } from './firebaseAdmin.ts';

/**
 * Delete the caller's account and their data.
 *
 * What happens to each kind of data, and the reasoning behind the split, is in
 * `deletionPolicy.ts` — it is a policy decision with real tension in it and it
 * is tested on its own. This file is the mechanism.
 *
 * ## Why this is a function and not a client operation
 *
 * The Firestore rules deny a client `delete` on reports, alert logs and its own
 * profile, and deny it entirely on Storage objects. A user therefore cannot
 * erase their own data no matter how the app is written — which is the correct
 * posture for a report that a black spot may depend on, and it is why erasure
 * has to happen through a credential that bypasses those rules.
 *
 * ## Order of operations
 *
 * The Auth record is deleted **last**, and that ordering is the whole recovery
 * story. If a step fails part-way, the user still has an account and can call
 * this again; every step is idempotent, so a second run finishes the job. The
 * opposite order would leave orphaned data with no signed-in owner able to
 * trigger its removal — data that is unreachable but not gone, which is the
 * worst of both.
 */

/** Firestore refuses a batch larger than this. */
const BATCH_LIMIT = 400;

interface DeleteAccountResult {
  documentsDeleted: number;
  reportsAnonymised: number;
  imagesDeleted: number;
}

/** Delete every document a query returns, in batches. */
async function deleteQuery(
  query: FirebaseFirestore.Query,
): Promise<{ deleted: number; imageUrls: string[] }> {
  const snapshot = await query.get();
  const firestore = adminFirestore();
  const imageUrls: string[] = [];

  let deleted = 0;
  for (let index = 0; index < snapshot.docs.length; index += BATCH_LIMIT) {
    const batch = firestore.batch();

    for (const document of snapshot.docs.slice(index, index + BATCH_LIMIT)) {
      const urls: unknown = document.get('imageUrls');
      if (Array.isArray(urls)) {
        imageUrls.push(...urls.filter((url): url is string => typeof url === 'string'));
      }
      batch.delete(document.ref);
      deleted += 1;
    }

    await batch.commit();
  }

  return { deleted, imageUrls };
}

async function deleteAccountData(uid: string): Promise<DeleteAccountResult> {
  const firestore = adminFirestore();

  let documentsDeleted = 0;

  // ---- Reports: split by whether anything was published from them ----------
  const reportsSnapshot = await firestore
    .collection(COLLECTIONS.incidentReports)
    .where('reporterId', '==', uid)
    .get();

  const plan = planReportDeletion(
    reportsSnapshot.docs.map((document) => ({
      id: document.id,
      status: typeof document.get('status') === 'string' ? (document.get('status') as string) : '',
    })),
  );

  const reportBatch = firestore.batch();
  for (const reportId of plan.reportsToDelete) {
    reportBatch.delete(firestore.collection(COLLECTIONS.incidentReports).doc(reportId));
    documentsDeleted += 1;
  }
  for (const reportId of plan.reportsToAnonymise) {
    reportBatch.update(
      firestore.collection(COLLECTIONS.incidentReports).doc(reportId),
      anonymisedReportFields(),
    );
  }
  await reportBatch.commit();

  // ---- Everything else owned by this uid, deleted outright ----------------
  for (const [collection, field] of [
    [COLLECTIONS.emergencyContacts, 'userId'],
    [COLLECTIONS.alertLogs, 'userId'],
  ] as const) {
    const result = await deleteQuery(firestore.collection(collection).where(field, '==', uid));
    documentsDeleted += result.deleted;
  }

  // The rate-limit counter and the fingerprints are keyed by uid, so they are
  // addressed directly rather than queried. Deleting the counter resets the
  // allowance, which is harmless: the account it belonged to is going.
  const rateLimitRef = firestore.collection(COLLECTIONS.reportRateLimits).doc(uid);
  if ((await rateLimitRef.get()).exists) {
    await rateLimitRef.delete();
    documentsDeleted += 1;
  }

  const fingerprintResult = await deleteQuery(
    firestore.collection(COLLECTIONS.reportFingerprints).where('reporterId', '==', uid),
  );
  documentsDeleted += fingerprintResult.deleted;

  // ---- Photographs --------------------------------------------------------
  // Deleted by *prefix*, not by walking the URLs on the reports. A report whose
  // document was already removed still has objects behind it, and an upload the
  // user abandoned never had a document at all — neither is reachable from a
  // URL list, and both belong to this person.
  const [files] = await adminBucket().getFiles({ prefix: `${REPORT_IMAGES_PREFIX}/${uid}/` });
  await Promise.all(files.map(async (file) => file.delete({ ignoreNotFound: true })));

  // ---- The profile, last among the documents ------------------------------
  const profileRef = firestore.collection(COLLECTIONS.users).doc(uid);
  if ((await profileRef.get()).exists) {
    await profileRef.delete();
    documentsDeleted += 1;
  }

  return {
    documentsDeleted,
    reportsAnonymised: plan.reportsToAnonymise.length,
    imagesDeleted: files.length,
  };
}

export const deleteAccount = onCall(
  async (request: CallableRequest): Promise<DeleteAccountResult> => {
    // The uid comes from the verified token and nowhere else. Taking it from
    // `request.data` would turn this into a way to delete anybody's account.
    const uid = request.auth?.uid;
    if (uid === undefined) {
      throw new HttpsError('unauthenticated', 'You need to be signed in to delete your account.');
    }

    logger.info('Account deletion requested');

    let result: DeleteAccountResult;
    try {
      result = await deleteAccountData(uid);
    } catch (error) {
      logger.error('Account deletion failed before the Auth record was removed', { error });
      throw new HttpsError(
        'internal',
        'Your account could not be deleted. Nothing has been removed — please try again.',
      );
    }

    // The tombstone identifies nobody: random id, counts only. It exists so an
    // operator can confirm a deletion ran, not so anyone can look one up.
    await adminFirestore()
      .collection(COLLECTIONS.deletedAccounts)
      .add(buildDeletionReceipt({ ...result, now: new Date() }));

    // Last. Until this succeeds the user still has an account and can retry.
    await adminAuth().deleteUser(uid);

    logger.info('Account deleted', result);
    return result;
  },
);
