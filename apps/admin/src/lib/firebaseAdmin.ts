import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { serverEnv } from '@/lib/env';
import { parseServiceAccount } from '@/lib/serviceAccount';

/**
 * The Firebase Admin SDK — the only privileged credential in this repository.
 *
 * ## What this being here means
 *
 * The Admin SDK **bypasses Firestore security rules completely**. Every check the
 * rules perform for a mobile client is simply absent for code running here. That
 * is deliberate and necessary — a moderator has to be able to write fields no
 * client may write — but it means the rules stop being the enforcement point for
 * anything the dashboard does, and our own code becomes it.
 *
 * Two consequences run through the rest of this app:
 *
 *   1. Every privileged action re-checks authorisation in code, using the same
 *      `evaluateModerationDecision` the rules mirror. Not because the rules will
 *      catch it — they will not — but because nothing else will.
 *   2. This module must never be imported from a `"use client"` file. Next would
 *      attempt to bundle a service credential into the browser. The
 *      `server-only` import below turns that mistake into a build error rather
 *      than a breach.
 *
 * ## Emulator vs real project
 *
 * Against the emulators no credential exists or is needed: `FIRESTORE_EMULATOR_HOST`
 * and `FIREBASE_AUTH_EMULATOR_HOST` redirect the SDK, and a `demo-` project id
 * cannot reach Google Cloud at all. Against a real project a service account is
 * required, and `env.ts` refuses a configuration that is half one and half the
 * other.
 */

import 'server-only';

let cachedApp: App | null = null;

function initialise(): App {
  // Reuse across hot reloads, which otherwise throw "The default Firebase app
  // already exists" on every edit in development.
  if (getApps().length > 0) {
    return getApp();
  }

  if (serverEnv.usingEmulators) {
    // No credential: the emulators accept any caller, and asking for application
    // default credentials here would fail on a machine that has none.
    return initializeApp({ projectId: serverEnv.firebaseProjectId });
  }

  /**
   * Real project. The service account arrives as a JSON blob in the environment
   * rather than a file path, because the deployment targets for this dashboard
   * provide secrets as environment variables and a file would have to be written
   * to disk to be read back.
   *
   * ## How far this is verified
   *
   * Everything up to `cert()` is a pure function with its own tests — see
   * `serviceAccount.ts` and its test file, which cover a missing variable,
   * malformed JSON, each missing field, and a credential belonging to a
   * different project than the one configured.
   *
   * `cert()` itself and the credential exchange with Google are **still
   * unexercised**: this project has only ever run against emulators and has no
   * real Firebase project to authenticate to. Do not read the tests as evidence
   * that a deployment works — they are evidence that a misconfiguration is
   * rejected with a message naming the cause, which is a smaller claim.
   */
  const serviceAccount = parseServiceAccount(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    serverEnv.firebaseProjectId,
  );

  return initializeApp({
    projectId: serverEnv.firebaseProjectId,
    // Structurally typed rather than asserted from `any`: the fields below are
    // exactly `ServiceAccount`'s, and every one has been checked to be a
    // non-empty string before reaching here.
    credential: cert(serviceAccount satisfies ServiceAccount),
  });
}

export function getAdminApp(): App {
  cachedApp ??= initialise();
  return cachedApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}
