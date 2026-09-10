/**
 * Writing seed documents through the Firestore emulator's REST API.
 *
 * ## Why REST rather than the SDK
 *
 * These scripts write documents that `firestore.rules` forbids any client to
 * create — black spots at all, and reports with `status: "approved"`. The
 * emulator accepts `Authorization: Bearer owner`, which bypasses rules the way
 * the Admin SDK does in production, without the scripts needing service-account
 * credentials to exist at all.
 *
 * ## Why the codec is shared
 *
 * Both scripts previously defined their own `toFirestoreFields`, and the two had
 * already diverged: the black-spots copy handled only strings, booleans and
 * numbers, and threw `Unsupported seed value` on a `Date`, an array or a `null`
 * — all of which the incident-reports copy wrote correctly. Adding a timestamp
 * to a black-spot template, an obvious edit, failed at runtime for no reason a
 * reader could see. This is the superset of the two, so nothing lost capability
 * in the merge.
 */

/** Convert a plain JS value into Firestore REST `Value` form. */
export function toFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    // Firestore distinguishes the two, and a whole-number double compares
    // unequal to the integer the app writes for the same field.
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((entry) => toFirestoreValue(entry)) } };
  }

  throw new Error(`Unsupported seed value: ${String(value)}`);
}

/** Convert a flat document into the `fields` map the REST API expects. */
export function toFirestoreFields(document) {
  return Object.fromEntries(
    Object.entries(document).map(([key, value]) => [key, toFirestoreValue(value)]),
  );
}

/**
 * Write one document, replacing it if it already exists.
 *
 * PATCH rather than POST so the scripts are idempotent: re-running around a
 * different centre repositions the existing documents instead of failing with
 * "already exists", which matters because the seed centre has to follow whatever
 * location the simulator or device is reporting.
 */
export async function writeDocument({ host, projectId, collection, id, document }) {
  const url = `http://${host}/v1/projects/${projectId}/databases/(default)/documents/${collection}/${id}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: toFirestoreFields(document) }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to write ${collection}/${id}: ${response.status} ${await response.text()}`,
    );
  }
}
