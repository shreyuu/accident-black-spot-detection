import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';

import {
  emergencyContactDocumentSchema,
  MAX_EMERGENCY_CONTACTS,
} from '@/features/emergency-contacts/contactSchemas';
import { getFirebaseFirestore } from '@/services/firebase/app';
import type { EmergencyContact, EmergencyContactInput } from '@/types/domain';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Data access for `emergencyContacts`.
 *
 * Reads are scoped to the caller's own contacts, mirroring the security rule
 * exactly. Firestore evaluates rules per returned document, so a query without
 * the `userId` filter is rejected outright rather than filtered — the filter is
 * load-bearing, not an optimisation.
 *
 * Unlike incident reports, contacts are fully mutable by their owner: this is
 * the user's own address book and they must be able to correct a wrong number,
 * which in an emergency is the difference between reaching someone and not.
 */

export const EMERGENCY_CONTACTS_COLLECTION = 'emergencyContacts';

function contactsRef() {
  return collection(getFirebaseFirestore(), EMERGENCY_CONTACTS_COLLECTION);
}

/** Parse one snapshot, returning `null` rather than throwing on a bad record. */
function parseSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): EmergencyContact | null {
  const raw = snapshot.data();
  const result = emergencyContactDocumentSchema.safeParse({ ...raw, id: snapshot.id });

  if (!result.success) {
    // One malformed record must not hide the rest of the user's contacts — the
    // remaining numbers are still usable and this list is read under pressure.
    logger.warn('emergencyContactRepository', 'Skipping a contact that failed validation', {
      contactId: snapshot.id,
      issues: result.error.issues.map((issue) => issue.path.join('.')),
    });
    return null;
  }

  const { relationship, ...rest } = result.data;

  return {
    ...rest,
    // Omitted rather than set to undefined — see the note in userProfileRepository.
    ...(relationship === undefined || relationship.length === 0 ? {} : { relationship }),
    createdAt: (raw.createdAt as Timestamp | undefined) ?? null,
    updatedAt: (raw.updatedAt as Timestamp | undefined) ?? null,
  };
}

/**
 * A user's contacts, primary first and then alphabetical.
 *
 * Ordered by `name` in the query and re-sorted here to lift the primary contact,
 * rather than ordering on `isPrimary` server-side. Sorting a boolean would need a
 * second composite index to save a comparison over at most five documents.
 */
export async function fetchEmergencyContacts(userId: string): Promise<EmergencyContact[]> {
  const snapshot = await getDocs(
    query(contactsRef(), where('userId', '==', userId), orderBy('name')),
  );

  /**
   * `getDocs` does not reject when offline — it resolves from Firestore's own
   * local cache, which on a fresh install is empty. "You have no emergency
   * contacts" and "we could not check" must never look the same here of all
   * places: the first invites the user to add one, the second means the SOS
   * screen is lying about being unusable. See the longer note in
   * blackSpotRepository.
   */
  if (snapshot.metadata.fromCache && snapshot.empty) {
    throw new AppError(
      'network',
      'Could not load your emergency contacts — you appear to be offline.',
      {
        retryable: true,
        technicalMessage: 'The contacts query resolved empty from the Firestore local cache.',
      },
    );
  }

  const contacts: EmergencyContact[] = [];
  for (const document of snapshot.docs) {
    const contact = parseSnapshot(document);
    if (contact === null) {
      continue;
    }
    // Defence in depth. The rules and the query both scope this to the caller.
    if (contact.userId !== userId) {
      logger.warn('emergencyContactRepository', 'Discarded a contact belonging to another user', {
        contactId: contact.id,
      });
      continue;
    }
    contacts.push(contact);
  }

  return sortContacts(contacts);
}

/** Primary first, then alphabetical. Exported so the UI can re-sort locally. */
export function sortContacts(contacts: readonly EmergencyContact[]): EmergencyContact[] {
  return [...contacts].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) {
      return a.isPrimary ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Add a contact.
 *
 * The count is checked against the caller's current list rather than re-queried,
 * so a caller that already has the contacts on screen does not pay for a second
 * read. It is a usability guard, not a security control — `firestore.rules`
 * cannot count documents, so a determined client could exceed it. The cap exists
 * to keep the app from becoming an address book, not to defend anything.
 */
export async function createEmergencyContact(
  userId: string,
  input: EmergencyContactInput,
  existingCount: number,
): Promise<string> {
  if (existingCount >= MAX_EMERGENCY_CONTACTS) {
    throw new AppError(
      'validation',
      `You can save up to ${MAX_EMERGENCY_CONTACTS} emergency contacts. Remove one to add another.`,
      { technicalMessage: `Contact cap reached: ${existingCount}.` },
    );
  }

  const reference = doc(contactsRef());

  await setDoc(reference, {
    userId,
    name: input.name,
    phone: input.phone,
    ...(input.relationship === undefined || input.relationship.length === 0
      ? {}
      : { relationship: input.relationship }),
    isPrimary: input.isPrimary,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Done as a separate step so that a failure here leaves the contact saved with
  // the wrong primary flag rather than losing the contact altogether.
  if (input.isPrimary) {
    await setPrimaryContact(userId, reference.id);
  }

  logger.info('emergencyContactRepository', 'Added an emergency contact', {
    contactId: reference.id,
  });

  return reference.id;
}

/** Update a contact in place. */
export async function updateEmergencyContact(
  userId: string,
  contactId: string,
  input: EmergencyContactInput,
): Promise<void> {
  await updateDoc(doc(contactsRef(), contactId), {
    name: input.name,
    phone: input.phone,
    // Written explicitly as an empty string when cleared: `updateDoc` ignores a
    // field that is simply absent, so omitting it would silently keep the old
    // relationship label after the user deleted it.
    relationship: input.relationship ?? '',
    isPrimary: input.isPrimary,
    updatedAt: serverTimestamp(),
  });

  if (input.isPrimary) {
    await setPrimaryContact(userId, contactId);
  }
}

export async function deleteEmergencyContact(contactId: string): Promise<void> {
  await deleteDoc(doc(contactsRef(), contactId));
  logger.info('emergencyContactRepository', 'Deleted an emergency contact', { contactId });
}

/**
 * Make one contact primary and clear the flag on every other.
 *
 * A batch, because this is exactly the case the project's rule about batched
 * writes is for: two contacts both marked primary, or none at all, is an
 * inconsistent state the SOS screen would have to guess its way out of. A batch
 * either applies both halves or neither.
 */
export async function setPrimaryContact(userId: string, contactId: string): Promise<void> {
  const snapshot = await getDocs(query(contactsRef(), where('userId', '==', userId)));

  const batch = writeBatch(getFirebaseFirestore());
  let changed = 0;

  for (const document of snapshot.docs) {
    const shouldBePrimary = document.id === contactId;
    if (document.data().isPrimary === shouldBePrimary) {
      continue;
    }
    batch.update(document.ref, { isPrimary: shouldBePrimary, updatedAt: serverTimestamp() });
    changed += 1;
  }

  if (changed === 0) {
    return;
  }

  await batch.commit();
  logger.debug('emergencyContactRepository', 'Updated the primary contact', { contactId, changed });
}
