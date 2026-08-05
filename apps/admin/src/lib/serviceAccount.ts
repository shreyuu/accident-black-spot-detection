import { z } from 'zod';

/**
 * Parsing and validation of the Admin SDK service account, as a pure function.
 *
 * ## Why this is its own module
 *
 * Until Phase 14 this logic lived inline in `firebaseAdmin.ts` behind a
 * `TODO(phase-14)` saying the real-project path "is written but has never been
 * exercised". It still has not been exercised end to end — nothing in this
 * repository has ever authenticated against Google Cloud — but there is a
 * difference between *cannot be tested* and *is not tested*, and almost all of
 * this belonged to the second category.
 *
 * Everything up to the network call is deterministic: reading the variable,
 * parsing JSON, checking the three fields `cert()` needs, and comparing the
 * account's project against the one the dashboard was told to use. That part is
 * tested here. What remains untested is one line — `cert(serviceAccount)` and
 * the credential exchange behind it — and that is stated plainly rather than
 * implied away.
 *
 * ## What the project-mismatch check is for
 *
 * It is the only check here that is about safety rather than typos. A service
 * account carries its own `project_id`, and the Admin SDK will happily
 * initialise with `projectId: A` and a credential for project B — then read and
 * write B. For a dashboard whose entire purpose is to make irreversible
 * moderation decisions with rules bypassed, "moderating the wrong project" is
 * the worst outcome available, and it produces no error of its own. The same
 * reasoning already governs the emulator-host check in `env.ts`: a privileged
 * client pointed half at one place and half at another is refused rather than
 * defaulted.
 */

/**
 * The fields `firebase-admin`'s `cert()` requires.
 *
 * Deliberately not the full service-account shape. Google's JSON carries a
 * dozen keys; requiring all of them would reject a perfectly valid credential
 * for a field the SDK never reads.
 */
const serviceAccountSchema = z.object({
  project_id: z.string().trim().min(1),
  client_email: z.string().trim().min(1),

  /**
   * Checked for emptiness but **never trimmed**, unlike the two above.
   *
   * A PEM block ends with a newline, and `.trim()` would silently remove it —
   * changing the credential on its way to `cert()`. Whitespace in a copy-pasted
   * project id is a typo worth absorbing; whitespace in a private key is part of
   * the format. Caught by the test that asserts the value survives verbatim.
   */
  private_key: z.string().refine((value) => value.trim().length > 0, {
    error: 'must not be blank',
  }),
});

/** The credential, in the camelCase shape `cert()` accepts. */
export interface ParsedServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export class ServiceAccountError extends Error {
  override readonly name = 'ServiceAccountError';
}

/**
 * Parse and validate `FIREBASE_SERVICE_ACCOUNT_JSON`.
 *
 * @param raw The raw environment value, or `undefined` if unset.
 * @param expectedProjectId The project the dashboard was configured for.
 * @throws ServiceAccountError with a message that names the actual problem.
 */
export function parseServiceAccount(
  raw: string | undefined,
  expectedProjectId: string,
): ParsedServiceAccount {
  if (raw === undefined || raw.trim().length === 0) {
    throw new ServiceAccountError(
      'FIREBASE_SERVICE_ACCOUNT_JSON is required when the emulator hosts are not set. ' +
        'Refusing to start: a dashboard with no credential would otherwise fail on the ' +
        'first privileged write, half way through a moderation decision.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // The message deliberately carries no excerpt of the value. It is a private
    // key, and the most likely place this error is read is a deployment log.
    throw new ServiceAccountError(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. It must be the whole downloaded ' +
        'service-account file as a single value — a common cause is a shell stripping the ' +
        'quotes, or the newlines inside private_key being mangled in transit.',
    );
  }

  const result = serviceAccountSchema.safeParse(parsed);
  if (!result.success) {
    // The field name comes from `issue.path`, not from a custom message. Zod
    // reports an *absent* key as a type error ("expected string, received
    // undefined") and never interpolates the field into it — so a message built
    // from `issue.message` alone says something is missing without saying what,
    // which is the least useful possible form of this error. Zod's own text
    // never echoes the value, which matters here: it is a private key.
    throw new ServiceAccountError(
      `FIREBASE_SERVICE_ACCOUNT_JSON is not a usable service account: ${result.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'} — ${issue.message}`)
        .join('; ')}`,
    );
  }

  const account = result.data;

  if (account.project_id !== expectedProjectId) {
    throw new ServiceAccountError(
      `FIREBASE_SERVICE_ACCOUNT_JSON is for project "${account.project_id}" but ` +
        `FIREBASE_PROJECT_ID is "${expectedProjectId}". The Admin SDK follows the credential, ` +
        'not the project id — so this configuration would moderate the wrong project, with ' +
        'security rules bypassed and no error to indicate it.',
    );
  }

  return {
    projectId: account.project_id,
    clientEmail: account.client_email,
    privateKey: account.private_key,
  };
}
