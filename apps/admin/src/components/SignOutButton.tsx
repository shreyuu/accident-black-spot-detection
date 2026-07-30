'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Clears the session cookie and returns to the sign-in page. */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className="secondary"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void fetch('/api/session', { method: 'DELETE' })
          .catch(() => undefined)
          .finally(() => {
            // Replace rather than push: the dashboard must not be reachable with
            // the browser's back button after signing out.
            router.replace('/login');
            router.refresh();
          });
      }}
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
