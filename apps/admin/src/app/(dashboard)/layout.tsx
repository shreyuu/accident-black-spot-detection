import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { canManageBlackSpots } from '@accident-black-spot-detection/shared-types';

import { SignOutButton } from '@/components/SignOutButton';
import { getDashboardActor } from '@/lib/session';

/**
 * The guard for every dashboard page.
 *
 * Placed in the group layout rather than in each page, so a route added later is
 * protected by construction and cannot forget to check. A signed-in plain user is
 * redirected exactly as an anonymous visitor is — authentication is not
 * authorisation, and that distinction is what the phase gate turns on.
 *
 * This is still only the *page* boundary. The data behind it is protected by the
 * Firestore rules for anything a client reads, and by the re-checks in
 * `actions.ts` for anything the Admin SDK writes. A layout guard alone would
 * leave the server actions — which are public HTTP endpoints — wide open.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const actor = await getDashboardActor();

  if (actor === null) {
    redirect('/login');
  }

  const isAdmin = canManageBlackSpots(actor.role);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <nav aria-label="Dashboard sections">
            <a href="/reports">Reports</a>
            {/*
              Hidden for a moderator because the actions behind it would refuse
              them anyway, and offering a button that always fails is worse than
              not offering it. The refusal is still enforced server-side — this is
              presentation, not protection.
            */}
            {isAdmin ? <a href="/black-spots">Black spots</a> : null}
            <a href="/audit">Audit log</a>
          </nav>

          <div className="actions">
            <span className="identity">
              {actor.email} · {actor.role}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="shell">{children}</main>
    </>
  );
}
