import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

import { COLLECTIONS } from './collections.ts';
import { buildDataExport, type DataExport } from './exportPayload.ts';
import { adminFirestore } from './firebaseAdmin.ts';

/**
 * Return everything this app holds about the caller.
 *
 * What goes in, what is left out, and why, is in `exportPayload.ts`. This file
 * fetches.
 *
 * ## Why the export is assembled server-side
 *
 * The app could read most of this itself — a user can query their own profile,
 * reports, contacts and alert logs. Doing it here anyway buys three things:
 *
 *   1. **One definition of "everything".** A client-side export drifts the
 *      moment a collection is added and nobody remembers to include it. Here it
 *      sits next to `deleteAccount`, and the two are read together.
 *   2. **Redaction that the user cannot be blamed for.** `reviewedBy` is
 *      stripped centrally rather than trusted to each caller.
 *   3. **A stable format.** The export is a file somebody keeps; its shape
 *      should not depend on which version of the app produced it.
 *
 * ## Size
 *
 * The result is returned in the callable response rather than written to a file,
 * which bounds it: a callable response must stay under 10 MB. For this app's
 * data — a profile, some reports, a short contact list, an alert log — that is
 * comfortable. `MAX_ROWS` keeps it comfortable even for an outlier account, and
 * the export says when it has been truncated rather than quietly shortening.
 */

/** Per-collection cap, so one very active account cannot blow the response limit. */
const MAX_ROWS = 2000;

async function fetchOwned(
  collection: string,
  field: string,
  uid: string,
): Promise<Record<string, unknown>[]> {
  const snapshot = await adminFirestore()
    .collection(collection)
    .where(field, '==', uid)
    .limit(MAX_ROWS)
    .get();

  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
}

export const exportMyData = onCall(async (request: CallableRequest): Promise<DataExport> => {
  const uid = request.auth?.uid;
  if (uid === undefined) {
    throw new HttpsError('unauthenticated', 'You need to be signed in to export your data.');
  }

  // Every query is filtered to the caller's own uid, so there is no path here
  // that could return another person's data even if the collection were wrong.
  const [profileSnapshot, reports, emergencyContacts, alertLogs] = await Promise.all([
    adminFirestore().collection(COLLECTIONS.users).doc(uid).get(),
    fetchOwned(COLLECTIONS.incidentReports, 'reporterId', uid),
    fetchOwned(COLLECTIONS.emergencyContacts, 'userId', uid),
    fetchOwned(COLLECTIONS.alertLogs, 'userId', uid),
  ]);

  const exported = buildDataExport({
    uid,
    profile: profileSnapshot.exists ? { id: profileSnapshot.id, ...profileSnapshot.data() } : null,
    reports,
    emergencyContacts,
    alertLogs,
    generatedAt: new Date(),
  });

  if (
    reports.length === MAX_ROWS ||
    emergencyContacts.length === MAX_ROWS ||
    alertLogs.length === MAX_ROWS
  ) {
    // Said out loud in the file itself. An export that silently stops short is
    // worse than no export, because the person believes they have everything.
    exported.notes.push(
      `This export was truncated at ${MAX_ROWS} records per section. Please get in touch if you need the remainder.`,
    );
  }

  logger.info('Data export produced', {
    reports: reports.length,
    contacts: emergencyContacts.length,
    alerts: alertLogs.length,
  });

  return exported;
});
