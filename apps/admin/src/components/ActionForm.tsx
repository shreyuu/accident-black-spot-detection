'use client';

import { useActionState } from 'react';

import type { ActionResult } from '@/lib/actions';

/**
 * A form wrapper around a server action, with its result rendered in place.
 *
 * `useActionState` gives the pending flag needed to disable the submit control
 * while the action runs. That matters more here than in an ordinary form: these
 * actions approve reports and publish public safety warnings, and a double
 * submission would produce two audit entries for one decision — or, before the
 * transaction was in place, two decisions.
 *
 * The result is announced with `role="status"` so a screen reader reports the
 * outcome; an approval that only changes a row's colour tells a non-sighted
 * moderator nothing.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  submitClassName,
  confirm,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  submitLabel: string;
  submitClassName?: string;
  /** Shown in a native confirm dialog before submitting. For destructive acts. */
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: ActionResult | null, formData: FormData) => action(formData),
    null,
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        // A withdrawal removes a live warning from every user near a location.
        // Worth one deliberate confirmation.
        if (confirm !== undefined && !window.confirm(confirm)) {
          event.preventDefault();
        }
      }}
    >
      {children}

      <div className="actions" style={{ marginTop: '0.5rem' }}>
        <button type="submit" className={submitClassName} disabled={pending}>
          {pending ? 'Working…' : submitLabel}
        </button>
      </div>

      {state !== null ? (
        <p className={`result ${state.ok ? 'ok' : 'error'}`} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
