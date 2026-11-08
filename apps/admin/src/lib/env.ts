import { z } from 'zod';

import { blankToUndefined, parseServerEnv } from '@/lib/serverConfig';

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

const publicSchema = z.object({
  apiKey: z.string().trim().min(1),
  authDomain: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  appId: z.string().trim().min(1),
  /** Present only when signing in against the emulator. */
  authEmulatorHost: z.string().trim().optional(),
});

export const serverEnv = parseServerEnv(process.env);

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
