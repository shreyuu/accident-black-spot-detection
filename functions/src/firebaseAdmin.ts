import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

/**
 * The Admin SDK, initialised once per instance.
 *
 * Everything in this workspace runs with a credential that **bypasses every
 * security rule**. That is the point — deleting another collection's documents
 * and removing an Auth record are exactly the things the rules forbid a client
 * to do — but it means each function has to do its own authorisation, because
 * nothing else will. The rule of thumb applied throughout: derive the uid from
 * `request.auth`, never from anything in `request.data`.
 *
 * Initialisation is lazy and guarded by `getApps()` because a warm instance
 * re-enters this module on each invocation, and `initializeApp` throws if it has
 * already run.
 *
 * When `FIRESTORE_EMULATOR_HOST` and friends are set, the SDK routes to the
 * emulators on its own; there is no separate code path here for development.
 */
function app() {
  const existing = getApps()[0];
  return existing ?? initializeApp();
}

export function adminFirestore() {
  return getFirestore(app());
}

export function adminAuth() {
  return getAuth(app());
}

export function adminStorage() {
  return getStorage(app());
}

/**
 * The bucket holding report photographs.
 *
 * ## Why this is not just `storage().bucket()`
 *
 * The Admin SDK's default bucket comes from `FIREBASE_CONFIG`, which derives it
 * as `<project-id>.appspot.com`. Firebase projects created from late 2024
 * onwards use `<project-id>.firebasestorage.app` instead, and this project is
 * one of them — `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` in `.env.example` says so.
 *
 * The two names are both *valid*, which is what makes the mistake dangerous: the
 * SDK does not error on the wrong one, it returns an empty, perfectly functional
 * bucket. Account deletion then reports success having deleted no photographs,
 * and the orphan sweep finds nothing to do, for ever. That failure was caught by
 * `firebase/tests/integration/accountLifecycle.test.mjs` and by nothing else.
 *
 * So the name is resolved explicitly, and a deployment whose bucket is on the
 * older `.appspot.com` domain must set `STORAGE_BUCKET`.
 */
export function bucketName(): string {
  const configured = process.env.STORAGE_BUCKET;
  if (configured !== undefined && configured.length > 0) {
    return configured;
  }

  const projectId =
    process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? app().options.projectId;

  if (projectId === undefined || projectId.length === 0) {
    throw new Error(
      'Cannot determine the Storage bucket: no STORAGE_BUCKET and no project id in the environment.',
    );
  }

  return `${projectId}.firebasestorage.app`;
}

export function adminBucket() {
  return adminStorage().bucket(bucketName());
}
