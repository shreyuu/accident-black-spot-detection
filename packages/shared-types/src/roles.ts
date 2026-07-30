/**
 * Access roles, shared by the mobile app and the admin dashboard.
 *
 * These strings appear in four places that must agree exactly: the user
 * document, the Firebase Auth custom claim, `firestore.rules`, and the admin
 * dashboard's route guard. A typo in any one of them either locks a legitimate
 * moderator out or — much worse — silently fails a role check open. Defining
 * them once is the point of this package.
 *
 * ## Why the claim, not the user document, is authoritative
 *
 * A role also lives on `users/{id}.role`, but that copy is for display only.
 * Authorisation reads `request.auth.token.role`, a Firebase Auth **custom
 * claim**, because:
 *
 *   - Firestore rules can read a claim from the token with no document read at
 *     all, so a rule cannot be made expensive or circular by checking it.
 *   - A claim can only be written by the Admin SDK. Even a user who somehow got
 *     write access to their own profile document could not escalate themselves.
 *
 * The two can therefore disagree, and the claim wins. `grantRole` writes both so
 * they normally match; the mismatch that matters — document says admin, claim
 * does not — grants nothing.
 */

export const USER_ROLES = ['user', 'moderator', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** The role every account starts with, and the only one a client may cause. */
export const DEFAULT_ROLE: UserRole = 'user';

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Roles allowed into the admin dashboard at all.
 *
 * A moderator gets in; a plain user does not. Note this is a *usability*
 * boundary in the dashboard's own routing — the real enforcement is the Firebase
 * rules and the server-side checks, because a route guard protects a page, not
 * the data behind it.
 */
export const DASHBOARD_ROLES: readonly UserRole[] = ['moderator', 'admin'];

export function canAccessDashboard(role: UserRole | null | undefined): boolean {
  return role !== null && role !== undefined && DASHBOARD_ROLES.includes(role);
}

/**
 * Who may decide a report.
 *
 * Both moderators and admins. Deliberately separate from
 * `canAccessDashboard` even though the sets are identical today: reading the
 * queue and changing a report's status are different privileges, and collapsing
 * them would mean a future read-only role silently gained approval rights.
 */
export function canModerateReports(role: UserRole | null | undefined): boolean {
  return role === 'moderator' || role === 'admin';
}

/**
 * Who may publish or withdraw a black spot.
 *
 * Admins only. Approving a report records that a moderator believed it;
 * publishing a black spot puts a warning in front of every user near that
 * location, which is a materially bigger act and gets a higher bar.
 */
export function canManageBlackSpots(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}

/** Who may change another account's role. Admins only, and never their own. */
export function canManageRoles(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}
