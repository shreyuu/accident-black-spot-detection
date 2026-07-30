import 'server-only';

import { cookies } from 'next/headers';

import {
  canAccessDashboard,
  isUserRole,
  type UserRole,
} from '@accident-black-spot-detection/shared-types';

import { serverEnv } from '@/lib/env';
import { getAdminAuth } from '@/lib/firebaseAdmin';

/**
 * Who is asking, and what they are allowed to do.
 *
 * ## Why the role comes from the token, not from Firestore
 *
 * `request.auth.token.role` is a Firebase Auth **custom claim**, writable only by
 * the Admin SDK. Reading the role from the verified token rather than from
 * `users/{id}.role` means:
 *
 *   - a user who somehow gained write access to their own profile document still
 *     cannot promote themselves, because the claim is what is checked;
 *   - no document read is needed to authorise a request, so the check cannot be
 *     made slow or circular.
 *
 * The profile document keeps a copy for display. If the two disagree, the claim
 * wins and the document is simply wrong — which grants nothing.
 *
 * ## Why this is an ID token and not a Firebase session cookie
 *
 * `createSessionCookie` is the better long-term answer: it produces a
 * long-lived, revocable credential. It is not used yet, so the cookie here holds
 * the ID token itself, which Firebase expires after an hour. The dashboard
 * therefore signs the operator out after at most an hour of use — the login page
 * re-mints it silently if the browser still holds a Firebase session, so in
 * practice this shows up as a redirect rather than a lost session.
 *
 * TODO(phase-12): swap to `createSessionCookie` with revocation on role change,
 * so demoting a moderator takes effect immediately instead of within the hour.
 */

export const SESSION_COOKIE = 'abs_admin_session';

export interface Actor {
  uid: string;
  email: string;
  role: UserRole;
}

/**
 * Cookie attributes.
 *
 * `httpOnly` keeps the token away from any script on the page, which matters
 * because this token authorises privileged writes. `sameSite: 'strict'` is
 * chosen over `'lax'` deliberately: every action in this dashboard is
 * state-changing, and there is no cross-site flow that needs to survive.
 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    // Not secure against localhost over plain HTTP, which is how this runs in
    // development; anything else is served over TLS.
    secure: !serverEnv.usingEmulators,
    path: '/',
    maxAge: serverEnv.sessionMaxAgeSeconds,
  };
}

/**
 * Resolve the current actor, or `null`.
 *
 * Returns `null` for every failure — no cookie, an expired token, a revoked
 * account, a malformed claim — rather than distinguishing them. The caller's
 * response is the same in every case (send them to sign in), and a more specific
 * error would tell an attacker which of their guesses was closer.
 */
export async function getActor(): Promise<Actor | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token === undefined || token.length === 0) {
    return null;
  }

  try {
    // `checkRevoked` costs a lookup but means a disabled account loses access at
    // once rather than when its token happens to expire.
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    const role = isUserRole(decoded.role) ? decoded.role : 'user';
    const email = typeof decoded.email === 'string' ? decoded.email : '';

    return { uid: decoded.uid, email, role };
  } catch {
    return null;
  }
}

/**
 * The actor, but only if they may use the dashboard at all.
 *
 * Used by the dashboard layout. A signed-in plain user gets `null` here exactly
 * as an anonymous visitor does — being authenticated is not the same as being
 * authorised, and this is the distinction the phase gate turns on.
 */
export async function getDashboardActor(): Promise<Actor | null> {
  const actor = await getActor();
  if (actor === null || !canAccessDashboard(actor.role)) {
    return null;
  }
  return actor;
}
