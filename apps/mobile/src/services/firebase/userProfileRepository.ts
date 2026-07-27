import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type Timestamp,
  type WithFieldValue,
} from 'firebase/firestore';

import { ALERT_RADIUS_BOUNDS_M, env } from '@/config/env';
import { getFirebaseFirestore } from '@/services/firebase/app';
import type { UserProfile, UserProfilePreferences } from '@/types/domain';
import { userProfileSchema } from '@/features/auth/schemas';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Data access for `users/{userId}`.
 *
 * All Firestore reads and writes for user profiles go through here — screens and
 * hooks never touch the SDK directly. That keeps the query surface auditable and
 * means a schema change has one place to update.
 */

export const USERS_COLLECTION = 'users';

/**
 * Firestore converter with runtime validation on read.
 *
 * Validating documents coming *out* of the database matters as much as
 * validating input: a document may predate a schema change, or have been written
 * by an older app version or by an admin tool. Without this, a malformed
 * document would flow into the UI as a well-typed lie and fail somewhere far
 * from the cause.
 */
export const userProfileConverter: FirestoreDataConverter<UserProfile> = {
  /**
   * Persist the document exactly as supplied.
   *
   * In particular the `createdAt` / `updatedAt` `serverTimestamp()` sentinels
   * must be passed through untouched. An earlier version destructured them away
   * — the reasoning being that timestamps are "set separately" — which was
   * wrong: the converter runs on the data being written, so it stripped the very
   * sentinels the caller had just set. The stored document then had no
   * timestamps, the `hasAll([...'createdAt','updatedAt'])` check in
   * firestore.rules correctly rejected it, and every registration failed with an
   * opaque PERMISSION_DENIED.
   */
  toFirestore(profile: WithFieldValue<UserProfile>): DocumentData {
    return { ...profile };
  },

  fromFirestore(snapshot: QueryDocumentSnapshot): UserProfile {
    const raw = snapshot.data();
    const result = userProfileSchema.safeParse({ ...raw, id: snapshot.id });

    if (!result.success) {
      logger.error('userProfileRepository', 'Stored profile failed validation', result.error, {
        userId: snapshot.id,
        issues: result.error.issues.map((issue) => issue.path.join('.')),
      });
      throw new AppError('validation', 'Your profile could not be loaded. Please sign in again.', {
        technicalMessage: `Invalid user document ${snapshot.id}: ${result.error.message}`,
      });
    }

    const { phone, ...rest } = result.data;

    return {
      ...rest,
      // `phone` is omitted rather than set to `undefined`. Under
      // `exactOptionalPropertyTypes` those are different things, and the
      // distinction is real here: writing an explicit `undefined` back to
      // Firestore would either be rejected or stored as null, whereas an absent
      // optional field is what "no phone number given" should mean.
      ...(phone === undefined || phone.length === 0 ? {} : { phone }),
      // Timestamp instances pass through untouched — they are class instances
      // rather than plain data, so Zod cannot usefully validate them.
      createdAt: (raw.createdAt as Timestamp | undefined) ?? null,
      updatedAt: (raw.updatedAt as Timestamp | undefined) ?? null,
    };
  },
};

function profileDoc(userId: string) {
  return doc(getFirebaseFirestore(), USERS_COLLECTION, userId).withConverter(userProfileConverter);
}

/** Defaults applied to a newly registered account. */
export function buildDefaultProfileFields(): Omit<
  UserProfile,
  'id' | 'name' | 'email' | 'phone' | 'createdAt' | 'updatedAt'
> {
  return {
    // Always 'user'. Firestore rules reject anything else on create, so this
    // cannot be used to self-assign a privileged role.
    role: 'user',
    alertRadiusM: env.defaultAlertRadiusM,
    alertsEnabled: true,
    backgroundMonitoringEnabled: false, // Opt-in only — never enabled by default.
    hapticsEnabled: true,
    soundEnabled: true,
    darkModePreference: 'system',
  };
}

export interface CreateProfileInput {
  userId: string;
  name: string;
  email: string;
  phone?: string;
}

/**
 * Create the Firestore profile for a freshly registered account.
 *
 * Uses the uid as the document id so ownership is structural: the security rule
 * `request.auth.uid == userId` is then sufficient, with no lookup required.
 */
export async function createUserProfile(input: CreateProfileInput): Promise<void> {
  const { userId, name, email, phone } = input;

  await setDoc(profileDoc(userId), {
    id: userId,
    name,
    email,
    // Only include `phone` when supplied. Writing `undefined` would either be
    // rejected by Firestore or stored as null, and the rules validate that the
    // field is a string whenever it is present.
    ...(phone === undefined || phone.length === 0 ? {} : { phone }),
    ...buildDefaultProfileFields(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  logger.info('userProfileRepository', 'Created a user profile', { userId });
}

/** Read a profile. Returns `null` when the document does not exist. */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(profileDoc(userId));
  return snapshot.exists() ? snapshot.data() : null;
}

/**
 * Update the preferences a user is allowed to change.
 *
 * `id`, `email`, `role` and `createdAt` are deliberately not updatable here, and
 * Firestore rules reject them too — client-side omission alone would not be a
 * security control.
 */
export async function updateUserPreferences(
  userId: string,
  preferences: Partial<UserProfilePreferences>,
): Promise<void> {
  if (preferences.alertRadiusM !== undefined) {
    const { min, max } = ALERT_RADIUS_BOUNDS_M;
    if (preferences.alertRadiusM < min || preferences.alertRadiusM > max) {
      throw new AppError(
        'validation',
        `Choose an alert distance between ${min} and ${max} metres.`,
        { technicalMessage: `alertRadiusM out of range: ${preferences.alertRadiusM}` },
      );
    }
  }

  await updateDoc(doc(getFirebaseFirestore(), USERS_COLLECTION, userId), {
    ...preferences,
    updatedAt: serverTimestamp(),
  });
}
