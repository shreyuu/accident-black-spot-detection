import { redirect } from 'next/navigation';

import { getPublicFirebaseConfig } from '@/lib/env';
import { getDashboardActor } from '@/lib/session';

import { LoginForm } from './LoginForm';

/**
 * Sign-in page.
 *
 * Reads the public Firebase config on the server and passes it to the client
 * form, so the client never imports `env.ts` — which also reaches server-only
 * values and would drag them into the browser bundle if it were imported from a
 * `"use client"` file.
 */
export default async function LoginPage() {
  // Already signed in with access: skip the form rather than asking again.
  if ((await getDashboardActor()) !== null) {
    redirect('/reports');
  }

  const config = getPublicFirebaseConfig();

  return (
    <main className="shell" style={{ maxWidth: 420, paddingTop: '3rem' }}>
      <h1>Moderation sign-in</h1>
      <p className="muted small">
        For moderators and administrators of Accident Black Spot Detection. A normal user account
        cannot sign in here.
      </p>

      <div className="card">
        <LoginForm
          config={{
            apiKey: config.apiKey,
            authDomain: config.authDomain,
            projectId: config.projectId,
            appId: config.appId,
            ...(config.authEmulatorHost === undefined
              ? {}
              : { authEmulatorHost: config.authEmulatorHost }),
          }}
        />
      </div>

      <p className="muted small">
        Roles are granted by an administrator and can never be self-assigned. Run{' '}
        <code>npm run grant-role</code> against the emulator to create the first one.
      </p>
    </main>
  );
}
