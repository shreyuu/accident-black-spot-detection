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
 * ## Why this is a session cookie and not an ID token (Phase 12)
 *
 * The cookie holds a Firebase **session cookie**, minted by `createSessionCookie`
 * in `app/api/session/route.ts`. Until Phase 12 it held the raw ID token, which
 * expired after an hour and — the part that mattered — could not be revoked:
 * demoting or disabling a moderator left their existing token working until it
 * happened to expire. For an account withdrawn *because* of what it was doing,
 * that hour was the whole problem.
 *
 * `verifySessionCookie(cookie, true)` below re-checks revocation on every
 * request, and `grantRole` revokes as part of every role change, so a demotion
 * takes effect on the demoted operator's next click.
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
    // `checkRevoked` costs a lookup on every request, and it is the point: it is
    // what turns "this cookie was valid when it was issued" into "this operator
    // still has access right now". Without it a revoked session keeps working
    // until the cookie's own expiry.
    const decoded = await getAdminAuth().verifySessionCookie(token, true);
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
