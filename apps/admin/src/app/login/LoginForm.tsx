'use client';

import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  signInWithEmailAndPassword,
  type Auth,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  authEmulatorHost?: string | undefined;
}

/**
 * Sign-in form.
 *
 * The only place in the dashboard that touches a password, and it hands it
 * straight to Firebase Authentication — nothing here stores, logs or forwards
 * it. The resulting ID token is posted to `/api/session`, which verifies it
 * server-side and sets the httpOnly cookie every other request uses.
 *
 * ## Why session persistence, not local
 *
 * `browserSessionPersistence` keeps the Firebase session in the tab rather than
 * in localStorage, so closing the browser ends it. This is a tool that can
 * publish public safety warnings and approve reports; a credential that survives
 * indefinitely on a shared machine is not a trade worth making for the
 * convenience of skipping one sign-in.
 */
let cachedApp: FirebaseApp | null = null;

function getClientAuth(config: FirebaseClientConfig): Auth {
  cachedApp ??=
    getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          appId: config.appId,
        });

  const auth = getAuth(cachedApp);

  if (config.authEmulatorHost !== undefined) {
    try {
      connectAuthEmulator(auth, `http://${config.authEmulatorHost}`, { disableWarnings: true });
    } catch {
      // Already connected on a previous render. Harmless.
    }
  }

  return auth;
}

export function LoginForm({ config }: { config: FirebaseClientConfig }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const auth = getClientAuth(config);
      await setPersistence(auth, browserSessionPersistence);
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await credential.user.getIdToken();

      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message =
          typeof (body as { error?: unknown } | null)?.error === 'string'
            ? (body as { error: string }).error
            : 'That sign-in could not be completed.';
        // Signed out again so the browser is not left holding a Firebase session
        // for an account the dashboard has just refused.
        await auth.signOut();
        setError(message);
        return;
      }

      router.replace('/reports');
    } catch {
      /**
       * One message for every authentication failure.
       *
       * Distinguishing "no such account" from "wrong password" would let anyone
       * enumerate which addresses have moderator accounts — the same reasoning
       * as the mobile app's auth error mapping.
       */
      setError('Those details were not recognised.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <div style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={busy}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          disabled={busy}
        />
      </div>

      <button type="submit" disabled={busy || email.length === 0 || password.length === 0}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      {error !== null ? (
        <p className="result error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
