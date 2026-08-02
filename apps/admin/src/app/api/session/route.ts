import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { isUserRole, canAccessDashboard } from '@accident-black-spot-detection/shared-types';

import { serverEnv } from '@/lib/env';
import { getAdminAuth } from '@/lib/firebaseAdmin';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

/** How recently the operator must have authenticated to be given a session cookie. */
const MAX_AUTH_AGE_MS = 5 * 60 * 1000;

/**
 * Exchange a Firebase ID token for the dashboard's session cookie.
 *
 * The sign-in itself happens in the browser with the Firebase client SDK, which
 * is the only part of this app that ever handles a password — this route never
 * sees one. It receives the resulting ID token, verifies it with the Admin SDK,
 * and mints a **Firebase session cookie** stored httpOnly so no script on the
 * page can read it.
 *
 * ## What Phase 12 changed
 *
 * Until Phase 12 the cookie held the ID token itself. That worked, and had two
 * costs that a dashboard authorising privileged writes should not carry:
 *
 *   1. **It expired after an hour**, so an operator part-way through a
 *      moderation queue was bounced to the login screen.
 *   2. **It could not be revoked.** Demoting or disabling a moderator left their
 *      existing token valid until it happened to expire — up to an hour during
 *      which someone whose access had been withdrawn could still approve
 *      reports. For an account removed *because* of what it was doing, that hour
 *      is the whole problem.
 *
 * A session cookie is revocable. `revokeRefreshTokens` invalidates it
 * immediately, and `verifySessionCookie(cookie, true)` in `lib/session.ts`
 * checks that on every request. `grantRole` revokes as part of every role
 * change, so a demotion takes effect on the demoted operator's next click.
 *
 * ## Why the role is checked here and not only in the layout
 *
 * A plain user can authenticate perfectly well; they simply have no business in
 * this dashboard. Refusing the cookie means their browser never holds a
 * dashboard credential at all, rather than holding one that every page then has
 * to remember to reject. The layout still checks, because defence in depth is
 * cheap and a future route could forget.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let idToken: unknown;

  try {
    const body: unknown = await request.json();
    idToken = (body as { idToken?: unknown } | null)?.idToken;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (typeof idToken !== 'string' || idToken.length === 0) {
    return NextResponse.json({ error: 'Missing token.' }, { status: 400 });
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    const role = isUserRole(decoded.role) ? decoded.role : 'user';

    if (!canAccessDashboard(role)) {
      /**
       * Deliberately explicit about *why*, unlike a failed sign-in.
       *
       * This is not an authentication failure and saying "wrong password" would
       * be a lie that sends someone to reset a working one. There is nothing an
       * attacker learns here that they did not already know from having valid
       * credentials.
       */
      return NextResponse.json(
        {
          error: 'This account does not have moderator access. Ask an administrator to grant it.',
        },
        { status: 403 },
      );
    }

    /**
     * Refuse an ID token that is not fresh.
     *
     * `createSessionCookie` accepts a token up to an hour old, which would let a
     * stolen token be traded for a long-lived credential well after the theft.
     * Requiring a recent sign-in narrows that window to minutes. The client
     * always calls `getIdToken()` immediately after authenticating, so a
     * legitimate sign-in is never anywhere near this bound.
     */
    const authTimeMs = decoded.auth_time * 1000;
    if (Date.now() - authTimeMs > MAX_AUTH_AGE_MS) {
      return NextResponse.json(
        { error: 'That sign-in is too old. Please sign in again.' },
        { status: 401 },
      );
    }

    const expiresIn = serverEnv.sessionMaxAgeSeconds * 1000;
    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, { expiresIn });

    const response = NextResponse.json({ ok: true, role });
    response.cookies.set(SESSION_COOKIE, sessionCookie, sessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: 'That sign-in could not be verified.' }, { status: 401 });
  }
}

/**
 * Sign out.
 *
 * Clears the cookie **and** revokes the refresh tokens behind it, so signing out
 * on a shared or lost machine actually ends the session everywhere rather than
 * only deleting one browser's copy of it. Revocation is best-effort: if it
 * fails, the cookie is still cleared, because leaving somebody signed in because
 * the revoke call errored would be the worse outcome.
 */
export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });

  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (cookie !== undefined && cookie.length > 0) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(cookie);
      await getAdminAuth().revokeRefreshTokens(decoded.sub);
    } catch {
      // An expired or malformed cookie has nothing to revoke.
    }
  }

  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
