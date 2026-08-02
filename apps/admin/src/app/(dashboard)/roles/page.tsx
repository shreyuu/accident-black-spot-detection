import { redirect } from 'next/navigation';

import { canManageRoles } from '@accident-black-spot-detection/shared-types';

import { ActionForm } from '@/components/ActionForm';
import { setUserRole } from '@/lib/actions';
import { getDashboardActor } from '@/lib/session';

/**
 * Role management (Phase 12).
 *
 * Resolves the `TODO(phase-12)` in `firebase/scripts/grantRole.mjs`, which said
 * subsequent moderators should be promotable from a screen, audited like every
 * other privileged action.
 *
 * ## Why the script still exists
 *
 * The **first** administrator cannot be created here. A dashboard able to mint
 * its own first admin is a dashboard anyone can mint an admin in, so the
 * bootstrap stays outside the system: `npm run grant-role`, run by somebody with
 * shell access to the project. This screen only changes roles once an
 * administrator already exists to use it.
 *
 * ## Why there is no list of users
 *
 * The obvious design is a table of every account with a role dropdown on each
 * row. That would mean the dashboard querying the whole `users` collection —
 * every registered person's name and email address on one screen, for a
 * convenience that saves typing an address somebody already knows. The Firestore
 * rules deliberately grant no `list` on `users` for exactly this reason, and the
 * Admin SDK's ability to ignore that is not a reason to.
 *
 * So it is address-in, role-out: the operator states who they mean.
 */
export default async function RolesPage() {
  const actor = await getDashboardActor();
  if (actor === null) {
    return null;
  }

  // The layout admits moderators; this page is admin-only. The action re-checks
  // regardless — a server action is a public endpoint, and this redirect is
  // presentation.
  if (!canManageRoles(actor.role)) {
    redirect('/reports');
  }

  return (
    <>
      <h1>Roles</h1>
      <p className="muted small">
        Grant or withdraw dashboard access. Every change is recorded in the audit log against your
        account.
      </p>

      <div className="notice">
        A role change takes effect <strong>immediately</strong>: the account&rsquo;s existing
        sessions are invalidated, so a withdrawn moderator is signed out rather than keeping access
        until their session happens to expire.
      </div>

      <div className="card">
        <h2>Change someone&rsquo;s role</h2>
        <p className="muted small">
          The account must already exist — people register in the mobile app, not here.
        </p>

        <ActionForm action={setUserRole} submitLabel="Set role">
          <div className="field-row">
            <div>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="off"
                placeholder="moderator@example.test"
              />
            </div>

            <div>
              <label htmlFor="role">Role</label>
              <select id="role" name="role" defaultValue="moderator">
                <option value="moderator">Moderator — decide reports</option>
                <option value="admin">
                  Administrator — also publish black spots and set roles
                </option>
                <option value="user">User — no dashboard access</option>
              </select>
            </div>
          </div>
        </ActionForm>
      </div>

      <div className="card">
        <h2>What each role can do</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Can</th>
              <th scope="col">Cannot</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>User</td>
              <td>Use the app: report incidents, receive warnings.</td>
              <td>Open this dashboard at all.</td>
            </tr>
            <tr>
              <td>Moderator</td>
              <td>Decide reports, read the audit log and the algorithm&rsquo;s candidates.</td>
              <td>Publish or withdraw a black spot. Change roles. Decide their own reports.</td>
            </tr>
            <tr>
              <td>Administrator</td>
              <td>Everything a moderator can, plus black spots and roles.</td>
              <td>Decide their own reports, or change their own role — neither has an override.</td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">
          No role grants write access through the security rules. Every privileged change happens
          here, on the server, and is audited.
        </p>
      </div>
    </>
  );
}
