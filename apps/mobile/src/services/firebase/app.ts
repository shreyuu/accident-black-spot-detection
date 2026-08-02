import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { Platform } from 'react-native';

import { env, isFirebaseConfigured } from '@/config/env';
import { secureAuthStorage } from '@/services/firebase/secureAuthStorage';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Firebase initialisation.
 *
 * Only the **client** SDK appears anywhere in this app. The Admin SDK is never
 * bundled here — privileged operations (report approval, black spot publication,
 * role assignment) run in the admin dashboard or Cloud Functions, and are
 * enforced by Firestore rules rather than by client-side checks.
 *
 * Services are created lazily and memoised. Initialising at module scope would
 * run during the very first import, before the error boundary is mounted, so a
 * configuration problem would blank the app instead of surfacing a message.
 */

const EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8080,
  storage: 9199,
  functions: 5001,
} as const;

/** Must match the region the functions are deployed to. See `getFirebaseFunctions`. */
const FUNCTIONS_REGION = 'us-central1';

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedFirestore: Firestore | null = null;
let cachedStorage: FirebaseStorage | null = null;
let cachedFunctions: Functions | null = null;

/** Per-service emulator connection state. See `connectEmulator` for why. */
const emulatorsConnected: Record<keyof typeof EMULATOR_PORTS, boolean> = {
  auth: false,
  firestore: false,
  storage: false,
  functions: false,
};

/**
 * Host on which the emulators are reachable from the running device.
 *
 * `localhost` inside the Android emulator refers to the emulated device itself,
 * not the developer's machine; `10.0.2.2` is the alias that reaches the host.
 * Substituting it here means a single `.env` works on both platforms.
 */
function resolveEmulatorHost(): string {
  const configured = env.firebaseEmulatorHost;
  if (Platform.OS === 'android' && (configured === 'localhost' || configured === '127.0.0.1')) {
    return '10.0.2.2';
  }
  return configured;
}

function assertConfigured(): void {
  if (!isFirebaseConfigured) {
    throw new AppError(
      'unavailable',
      'The app is not configured to reach its server yet. Please contact support.',
      {
        technicalMessage:
          'Firebase configuration is missing. Copy .env.example to apps/mobile/.env — the ' +
          'emulator defaults in it work as-is. Then run `npm run emulators`.',
      },
    );
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (cachedApp !== null) {
    return cachedApp;
  }

  assertConfigured();

  // Reuse an existing app across Fast Refresh reloads, which otherwise throw
  // "Firebase App named '[DEFAULT]' already exists".
  cachedApp =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey: env.firebaseApiKey as string,
          authDomain: env.firebaseAuthDomain as string,
          projectId: env.firebaseProjectId as string,
          storageBucket: env.firebaseStorageBucket as string,
          messagingSenderId: env.firebaseMessagingSenderId as string,
          appId: env.firebaseAppId as string,
        });

  return cachedApp;
}

/**
 * Auth instance with persistence configured.
 *
 * `initializeAuth` is used rather than `getAuth` because only the former accepts
 * a `persistence` option. Calling `getAuth` on React Native yields in-memory
 * persistence, which silently signs the user out on every app restart — the
 * exact failure this project needed to avoid.
 *
 * `getReactNativePersistence` is typed by types/firebase-auth-rn.d.ts; see that
 * file for why the declaration is needed despite the function existing at
 * runtime.
 */
export function getFirebaseAuth(): Auth {
  if (cachedAuth !== null) {
    return cachedAuth;
  }

  const app = getFirebaseApp();

  try {
    cachedAuth = initializeAuth(app, {
      persistence: getReactNativePersistence(secureAuthStorage),
    });
  } catch {
    // initializeAuth throws if auth was already initialised for this app, which
    // happens on Fast Refresh. The existing instance already carries the
    // persistence configured on the first call, so reusing it is correct.
    logger.debug('firebase', 'Reusing an already-initialised Auth instance');
    cachedAuth = getAuth(app);
  }

  connectEmulator('auth', () => {
    connectAuthEmulator(
      cachedAuth as Auth,
      `http://${resolveEmulatorHost()}:${EMULATOR_PORTS.auth}`,
      {
        // The emulator's account-management banner is not needed; suppressing it
        // keeps development screenshots clean.
        disableWarnings: true,
      },
    );
  });

  return cachedAuth;
}

/**
 * Firestore instance, pointed at the emulator when enabled.
 *
 * Emulator settings are supplied to `initializeFirestore` at *creation* rather
 * than applied afterwards with `connectFirestoreEmulator`. The latter throws
 * "Firestore has already been started and its settings can no longer be
 * changed" if the instance has issued even one request — which happens routinely
 * under Fast Refresh, because this module's `cachedFirestore` resets while the
 * Firebase SDK keeps the started instance alive for the same app. Configuring at
 * creation removes that window entirely.
 */
export function getFirebaseFirestore(): Firestore {
  if (cachedFirestore !== null) {
    return cachedFirestore;
  }

  const app = getFirebaseApp();

  if (!env.useFirebaseEmulator) {
    cachedFirestore = getFirestore(app);
    return cachedFirestore;
  }

  const host = resolveEmulatorHost();

  try {
    cachedFirestore = initializeFirestore(app, {
      host: `${host}:${EMULATOR_PORTS.firestore}`,
      ssl: false,
      // React Native's networking stack does not support Firestore's default
      // WebChannel streaming reliably, and it is the usual cause of writes that
      // hang without ever reaching the emulator.
      experimentalForceLongPolling: true,
    });
    logger.info('firebase', 'Connected firestore to the Firebase Emulator Suite', {
      host,
      port: EMULATOR_PORTS.firestore,
      projectId: env.firebaseProjectId,
    });
  } catch {
    // Already initialised in this JS context (Fast Refresh). The existing
    // instance already carries the emulator settings from the first call.
    logger.debug('firebase', 'Reusing an already-initialised Firestore instance');
    cachedFirestore = getFirestore(app);
  }

  return cachedFirestore;
}

/**
 * How long a Storage upload may keep retrying before it fails, in milliseconds.
 *
 * The SDK's own defaults did not bound this in practice. Verified on the iOS
 * simulator with the emulator stopped: an upload sat at 0% with the submit
 * button spinning for over eight minutes and never surfaced an error, so the
 * user had no way to retry, no way to cancel, and nothing to tell them anything
 * was wrong. Report photographs are attached at the roadside on whatever signal
 * exists, so a bounded, reportable failure is far more useful than an
 * indefinitely optimistic one — the same reasoning as the fix timeout in
 * locationService.
 */
const STORAGE_UPLOAD_RETRY_MS = 45_000;
const STORAGE_OPERATION_RETRY_MS = 20_000;

export function getFirebaseStorage(): FirebaseStorage {
  if (cachedStorage === null) {
    cachedStorage = getStorage(getFirebaseApp());
    const storage = cachedStorage;
    storage.maxUploadRetryTime = STORAGE_UPLOAD_RETRY_MS;
    // Covers getDownloadURL and metadata reads, which otherwise hang just as
    // long as an upload does.
    storage.maxOperationRetryTime = STORAGE_OPERATION_RETRY_MS;
    connectEmulator('storage', () => {
      connectStorageEmulator(storage, resolveEmulatorHost(), EMULATOR_PORTS.storage);
    });
  }
  return cachedStorage;
}

/**
 * Callable Cloud Functions (Phase 12).
 *
 * Three things reach the app through here, and each is something a client
 * genuinely cannot do for itself: erasing data the security rules deliberately
 * stop it erasing, assembling one authoritative export of everything held about
 * it, and searching Google Places without carrying the billable key in the
 * bundle.
 *
 * The region is pinned. `getFunctions(app)` defaults to `us-central1`, and a
 * mismatch between here and the deployed region fails at call time with a 404
 * that reads like the function does not exist.
 */
export function getFirebaseFunctions(): Functions {
  if (cachedFunctions === null) {
    cachedFunctions = getFunctions(getFirebaseApp(), FUNCTIONS_REGION);
    const functions = cachedFunctions;
    connectEmulator('functions', () => {
      connectFunctionsEmulator(functions, resolveEmulatorHost(), EMULATOR_PORTS.functions);
    });
  }
  return cachedFunctions;
}

/**
 * Point a single service at the local Emulator Suite.
 *
 * Tracked **per service**, not with one shared flag. An earlier version used a
 * single `emulatorsConnected` boolean and attempted to connect whichever services
 * happened to be cached at the time. Because `getFirebaseAuth()` runs first —
 * before Firestore or Storage exist — it set the shared flag while connecting
 * only Auth, and every later call short-circuited. The result was Auth on the
 * emulator and Firestore silently pointed at the real backend, so profile writes
 * never arrived anywhere and no request appeared in the emulator logs at all.
 *
 * Each service must therefore be connected at the moment it is created, and the
 * connect call must happen before any read or write is issued against it —
 * `connectFirestoreEmulator` throws once the instance has started making
 * requests.
 */
function connectEmulator(service: keyof typeof EMULATOR_PORTS, connect: () => void): void {
  if (!env.useFirebaseEmulator || emulatorsConnected[service]) {
    return;
  }

  const host = resolveEmulatorHost();

  try {
    connect();
    emulatorsConnected[service] = true;
    logger.info('firebase', `Connected ${service} to the Firebase Emulator Suite`, {
      host,
      port: EMULATOR_PORTS[service],
      projectId: env.firebaseProjectId,
    });
  } catch (error) {
    // A failed connection must be loud in development: silently falling through
    // to a real backend would be far worse than an error here.
    logger.error('firebase', `Failed to connect ${service} to the emulator`, error, { host });
    throw new AppError('unavailable', 'Could not reach the local development server.', {
      cause: error,
      technicalMessage:
        `Emulator connection for ${service} at ${host}:${EMULATOR_PORTS[service]} failed. ` +
        'Is `npm run emulators` running?',
    });
  }
}

/** Test-only reset of the memoised singletons. */
export function __resetFirebaseForTests(): void {
  cachedApp = null;
  cachedAuth = null;
  cachedFirestore = null;
  cachedStorage = null;
  emulatorsConnected.auth = false;
  emulatorsConnected.firestore = false;
  emulatorsConnected.storage = false;
}
