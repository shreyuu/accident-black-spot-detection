import { z } from 'zod';

/**
 * Validated configuration for the admin dashboard.
 *
 * Split deliberately into two schemas, because the split *is* the security
 * boundary. Anything in `NEXT_PUBLIC_*` is inlined into the browser bundle and is
 * configuration, not secret. Everything else is read only in server components,
 * route handlers and server actions, and must never be imported from a `"use
 * client"` file — Next will happily bundle it if you do.
 *
 * The Admin SDK reads `FIREBASE_AUTH_EMULATOR_HOST` and `FIRESTORE_EMULATOR_HOST`
 * from the environment by itself, which is why they are validated here but not
 * passed anywhere: their mere presence is what points the privileged SDK at the
 * emulators instead of a real project.
 */

const serverSchema = z.object({
  firebaseProjectId: z.string().trim().min(1, 'FIREBASE_PROJECT_ID is required.'),

  /**
   * Emulator hosts. Both required together or both absent.
   *
   * A dashboard that holds Admin SDK privileges and is pointed half at an
   * emulator and half at a real project is the single most dangerous
   * misconfiguration in this repository — it would moderate live data from a
   * development machine. So a partial block is rejected outright rather than
   * defaulted.
   */
  authEmulatorHost: z.string().trim().optional(),
  firestoreEmulatorHost: z.string().trim().optional(),

  /** Cookie lifetime in seconds. Bounded so a stale session cannot linger. */
  sessionMaxAgeSeconds: z.coerce
    .number()
    .int()
    .min(300)
    .max(60 * 60 * 12)
    .default(3600),
});

const publicSchema = z.object({
  apiKey: z.string().trim().min(1),
  authDomain: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  appId: z.string().trim().min(1),
  /** Present only when signing in against the emulator. */
  authEmulatorHost: z.string().trim().optional(),
});

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function parseServerEnv() {
  const result = serverSchema.safeParse({
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
    authEmulatorHost: blankToUndefined(process.env.FIREBASE_AUTH_EMULATOR_HOST),
    firestoreEmulatorHost: blankToUndefined(process.env.FIRESTORE_EMULATOR_HOST),
    sessionMaxAgeSeconds: process.env.ADMIN_SESSION_MAX_AGE_SECONDS,
  });

  if (!result.success) {
    throw new Error(
      `Invalid admin server configuration:\n${result.error.issues
        .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')}\n\nSee apps/admin/.env.local.example.`,
    );
  }

  const { authEmulatorHost, firestoreEmulatorHost } = result.data;
  const configured = [authEmulatorHost, firestoreEmulatorHost].filter(
    (value) => value !== undefined,
  );

  if (configured.length === 1) {
    throw new Error(
      'FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST must be set together. ' +
        'A dashboard holding Admin SDK privileges must not point at an emulator for one ' +
        'service and a real project for the other.',
    );
  }

  return { ...result.data, usingEmulators: configured.length === 2 };
}

export const serverEnv = parseServerEnv();

/** Client Firebase config, for the sign-in form only. */
export function getPublicFirebaseConfig() {
  const result = publicSchema.safeParse({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    authEmulatorHost: blankToUndefined(process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST),
  });

  if (!result.success) {
    throw new Error('Firebase client configuration is missing. See apps/admin/.env.local.example.');
  }

  return result.data;
}
