import { z } from 'zod';

/**
 * Runtime validation of environment configuration.
 *
 * Why each variable is referenced explicitly below, never via a loop or a
 * computed key: Expo/Metro inlines `process.env.EXPO_PUBLIC_*` at *build* time
 * by static text substitution. `process.env[someVariable]` is not substituted
 * and resolves to `undefined` on device. Keep every read literal.
 *
 * Only `EXPO_PUBLIC_`-prefixed values are readable from app code, and they are
 * embedded in the shipped bundle — so they are configuration, not secrets.
 * Anything genuinely secret belongs in Cloud Functions or the analytics service.
 */

const ALERT_RADIUS_MIN_M = 100;
const ALERT_RADIUS_MAX_M = 2000;
const ALERT_RADIUS_DEFAULT_M = 1000;

/** A Firebase web config value: present and non-blank, or absent entirely. */
const firebaseValue = z
  .string()
  .trim()
  .min(1)
  .optional()
  .transform((value) => (value === '' ? undefined : value));

/** Accepts "true"/"false" from the environment, where everything is a string. */
const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z
  .object({
    appEnv: z.enum(['development', 'preview', 'production']).default('development'),

    defaultAlertRadiusM: z.coerce
      .number()
      .int('Alert radius must be a whole number of metres.')
      .min(
        ALERT_RADIUS_MIN_M,
        `Alert radius must be at least ${ALERT_RADIUS_MIN_M}m — smaller radii trigger unreliably given GPS accuracy.`,
      )
      .max(
        ALERT_RADIUS_MAX_M,
        `Alert radius must be at most ${ALERT_RADIUS_MAX_M}m — larger radii produce constant alerts in urban areas.`,
      )
      .default(ALERT_RADIUS_DEFAULT_M),

    firebaseApiKey: firebaseValue,
    firebaseAuthDomain: firebaseValue,
    firebaseProjectId: firebaseValue,
    firebaseStorageBucket: firebaseValue,
    firebaseMessagingSenderId: firebaseValue,
    firebaseAppId: firebaseValue,

    useFirebaseEmulator: booleanFlag,
    firebaseEmulatorHost: z.string().trim().min(1).default('localhost'),

    googleMapsApiKeyAndroid: z.string().trim().optional(),
    googleMapsApiKeyIos: z.string().trim().optional(),

    /**
     * Optional. Enables the Google Places provider for nearby facilities.
     *
     * Left unset, the app uses OpenStreetMap, which needs no credential at all —
     * see `googlePlacesProvider` for why that is the default and for what has to
     * be true of this key if you do set one. Like every `EXPO_PUBLIC_*` value it
     * ships inside the bundle, so it must be restricted by application and API
     * in the Google Cloud console; it is billable configuration, not a secret.
     */
    googlePlacesApiKey: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
  })
  /**
   * Firebase config is all-or-nothing. A partially filled block is the worst
   * outcome: the app starts, then fails deep inside the SDK on the first
   * network call with an opaque error. Fail here instead, naming the gaps.
   */
  .superRefine((value, ctx) => {
    const fields = {
      EXPO_PUBLIC_FIREBASE_API_KEY: value.firebaseApiKey,
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: value.firebaseAuthDomain,
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: value.firebaseProjectId,
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: value.firebaseStorageBucket,
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: value.firebaseMessagingSenderId,
      EXPO_PUBLIC_FIREBASE_APP_ID: value.firebaseAppId,
    };

    const missing = Object.entries(fields)
      .filter(([, fieldValue]) => fieldValue === undefined)
      .map(([name]) => name);

    const isFullyUnset = missing.length === Object.keys(fields).length;
    if (isFullyUnset || missing.length === 0) {
      return;
    }

    ctx.addIssue({
      code: 'custom',
      message:
        'Firebase configuration is incomplete. Provide every value or leave the whole block blank. ' +
        `Missing: ${missing.join(', ')}`,
    });
  });

/** Fully validated, immutable environment configuration. */
export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse({
    appEnv: process.env.EXPO_PUBLIC_APP_ENV,
    defaultAlertRadiusM: process.env.EXPO_PUBLIC_DEFAULT_ALERT_RADIUS_M,

    firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    firebaseStorageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,

    useFirebaseEmulator: process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR,
    firebaseEmulatorHost: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,

    googleMapsApiKeyAndroid: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID,
    googleMapsApiKeyIos: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS,
    googlePlacesApiKey: process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY,
  });

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path.length > 0 ? `  • ${path}: ${issue.message}` : `  • ${issue.message}`;
      })
      .join('\n');

    // Thrown, not logged: a misconfigured build must not reach users in a
    // half-working state. See .env.example for the expected shape.
    throw new Error(
      `Invalid environment configuration.\n${details}\n\nCheck your .env file against .env.example.`,
    );
  }

  return result.data;
}

export const env: Env = parseEnv();

/** True once every Firebase value is present. Gates Firebase init in Phase 2. */
export const isFirebaseConfigured: boolean =
  env.firebaseApiKey !== undefined &&
  env.firebaseAuthDomain !== undefined &&
  env.firebaseProjectId !== undefined &&
  env.firebaseStorageBucket !== undefined &&
  env.firebaseMessagingSenderId !== undefined &&
  env.firebaseAppId !== undefined;

export const ALERT_RADIUS_BOUNDS_M = {
  min: ALERT_RADIUS_MIN_M,
  max: ALERT_RADIUS_MAX_M,
  default: ALERT_RADIUS_DEFAULT_M,
} as const;

/** Exported for unit testing the schema without touching `process.env`. */
export const __envSchemaForTests = envSchema;
