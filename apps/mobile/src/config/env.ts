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

/**
 * An unset variable and one set to the empty string mean the same thing here.
 * Metro substitutes a missing `EXPO_PUBLIC_*` as `undefined`, but a `.env` line
 * with nothing after the `=` arrives as `''` — which would defeat a `.default()`
 * and fail validation instead.
 */
function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

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
     * **This is a flag, not a key.** Phase 12 moved the credential out of the
     * app entirely: the request now goes to the `nearbyPlacesProxy` Cloud
     * Function, which holds the key as a Secret Manager secret. There is no
     * longer any billable credential in the bundle, which is what the old
     * `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` could never avoid being.
     *
     * The app cannot tell from here whether the server has a key configured, so
     * this says "try the proxy". If the server is not configured the proxy
     * returns `failed-precondition` and the provider chain falls through to
     * OpenStreetMap — which is the default configuration and needs no credential
     * anywhere. See `googlePlacesProvider` and `functions/.env.example`.
     */
    googlePlacesProxyEnabled: booleanFlag,

    /**
     * Overpass API endpoint for the keyless OpenStreetMap nearby-places provider.
     *
     * Defaults to `overpass-api.de`, the reference public instance: free, no
     * credential, and the reason Phase 9's "no secrets committed" gate was met
     * by removing the problem rather than managing it.
     *
     * It is configurable because a public instance is not something to build a
     * road-safety feature's availability on. It rate-limits and refuses under
     * load — which the provider chain treats as recoverable — but any deployment
     * beyond demonstration should point this at an instance the project runs or
     * pays for. That is a deployment decision, and this is where it is made.
     *
     * Validated as an absolute `https:` URL. Plain `http:` is rejected outright:
     * the query carries the user's coordinates, rounded but still a position,
     * and sending that in clear text over a network the user does not control is
     * not a trade-off worth offering a configuration switch for.
     */
    overpassEndpoint: z
      .url({ protocol: /^https$/, error: 'EXPO_PUBLIC_OVERPASS_ENDPOINT must be an https:// URL.' })
      .default('https://overpass-api.de/api/interpreter'),
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
    googlePlacesProxyEnabled: process.env.EXPO_PUBLIC_GOOGLE_PLACES_PROXY_ENABLED,
    // Blank-to-undefined so an empty line in .env falls back to the default
    // rather than failing URL validation on the empty string.
    overpassEndpoint: blankToUndefined(process.env.EXPO_PUBLIC_OVERPASS_ENDPOINT),
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
