import { z } from 'zod';

/**
 * Server configuration parsing, free of side effects so it can be tested.
 * `env.ts` applies it to `process.env` once at startup — see the notes there on
 * why the server and public halves are separate schemas.
 */

/** The development salt. Accepted only against the emulators. */
const DEVELOPMENT_REPORTER_SALT = 'development-reporter-salt';

/** Shortest salt accepted against a real project. */
const MIN_REPORTER_SALT_LENGTH = 32;

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

  /**
   * Salt for the reporter pseudonyms shown in the moderation queue.
   *
   * Optional, with a development default, because a missing salt must not stop
   * the dashboard starting — the pseudonym is a privacy improvement over showing
   * the uid whether or not it is salted. Unsalted, though, somebody holding a
   * list of uids could confirm which of them filed a given report by
   * recomputing the hash, so a deployment should set this to a long random
   * string and then leave it alone: changing it renumbers every reporter and
   * destroys a moderator's ability to recognise a repeat.
   */
  reporterSalt: z.string().trim().min(1).default(DEVELOPMENT_REPORTER_SALT),
});

export function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

export function parseServerEnv(source: Record<string, string | undefined>) {
  const result = serverSchema.safeParse({
    firebaseProjectId: source.FIREBASE_PROJECT_ID,
    authEmulatorHost: blankToUndefined(source.FIREBASE_AUTH_EMULATOR_HOST),
    firestoreEmulatorHost: blankToUndefined(source.FIRESTORE_EMULATOR_HOST),
    sessionMaxAgeSeconds: source.ADMIN_SESSION_MAX_AGE_SECONDS,
    reporterSalt: blankToUndefined(source.REPORTER_SALT),
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

  const usingEmulators = configured.length === 2;

  /**
   * A real project needs a real salt.
   *
   * The default is published in this file, so pseudonyms salted with it can be
   * recomputed by anyone holding a list of uids — and role changes put uids in
   * the audit log every moderator can read (SECURITY_AUDIT.md L5). Against the
   * emulators the default stays, so a fresh checkout still starts.
   */
  if (
    !usingEmulators &&
    (result.data.reporterSalt === DEVELOPMENT_REPORTER_SALT ||
      result.data.reporterSalt.length < MIN_REPORTER_SALT_LENGTH)
  ) {
    throw new Error(
      `REPORTER_SALT must be set to a random string of at least ${MIN_REPORTER_SALT_LENGTH} ` +
        'characters when the dashboard is not using the emulators. Generate one with ' +
        '`openssl rand -base64 48`, set it once, and leave it alone: changing it renumbers ' +
        'every reporter pseudonym.',
    );
  }

  return { ...result.data, usingEmulators };
}
