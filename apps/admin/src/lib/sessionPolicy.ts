import {
  canAccessDashboard,
  isUserRole,
  type UserRole,
} from '@accident-black-spot-detection/shared-types';

/**
 * The decisions behind a dashboard session, kept free of Firebase so they can be
 * tested directly. `app/api/session/route.ts` applies them when minting the
 * cookie and `lib/session.ts` when reading it back.
 */

/** How recently the operator must have authenticated to be given a session cookie. */
export const MAX_AUTH_AGE_MS = 5 * 60 * 1000;

/** The claims this module reads from a verified ID token or session cookie. */
export interface SessionClaims {
  role?: unknown;
  email_verified?: unknown;
}

/**
 * The role an operator holds *for dashboard purposes*.
 *
 * An unverified email address counts as no role at all. The role claim is set
 * by an administrator typing an address, and nothing proved the account behind
 * that address belonged to the person they meant — so a claim on an unverified
 * account is not trusted, here or anywhere else in the dashboard.
 */
export function dashboardRoleFromClaims(claims: SessionClaims): UserRole {
  if (claims.email_verified !== true) {
    return 'user';
  }
  return isUserRole(claims.role) ? claims.role : 'user';
}

export type SessionRefusal = 'not-staff' | 'email-unverified' | 'stale-sign-in';

export type SessionDecision = { ok: true; role: UserRole } | { ok: false; reason: SessionRefusal };

/**
 * Whether a freshly verified ID token may be exchanged for a session cookie.
 *
 * Checked in this order so each refusal names the thing that would actually fix
 * it: an unverified address is reported as such rather than as "not a
 * moderator", which would send someone to ask for a role they already have.
 */
export function evaluateSessionRequest(
  claims: SessionClaims & { auth_time: number },
  nowMs: number,
): SessionDecision {
  if (
    claims.email_verified !== true &&
    canAccessDashboard(isUserRole(claims.role) ? claims.role : 'user')
  ) {
    return { ok: false, reason: 'email-unverified' };
  }

  const role = dashboardRoleFromClaims(claims);
  if (!canAccessDashboard(role)) {
    return { ok: false, reason: 'not-staff' };
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
  if (nowMs - claims.auth_time * 1000 > MAX_AUTH_AGE_MS) {
    return { ok: false, reason: 'stale-sign-in' };
  }

  return { ok: true, role };
}
