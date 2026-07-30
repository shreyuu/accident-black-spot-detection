import { NextResponse } from 'next/server';

import { isUserRole, canAccessDashboard } from '@accident-black-spot-detection/shared-types';

import { getAdminAuth } from '@/lib/firebaseAdmin';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

/**
 * Exchange a Firebase ID token for the dashboard's session cookie.
 *
 * The sign-in itself happens in the browser with the Firebase client SDK, which
 * is the only part of this app that ever handles a password — this route never
 * sees one. It receives the resulting ID token, verifies it with the Admin SDK,
 * and stores it in an httpOnly cookie so no script on the page can read it.
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

    const response = NextResponse.json({ ok: true, role });
    response.cookies.set(SESSION_COOKIE, idToken, sessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: 'That sign-in could not be verified.' }, { status: 401 });
  }
}

/** Sign out. Clearing the cookie is the whole of it — nothing is stored server-side. */
export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
