/**
 * Shared domain vocabulary.
 *
 * Entity interfaces are introduced by the phase that persists them, together
 * with their Zod schemas and Firestore converters, so runtime validation and
 * types always arrive as a pair.
 *
 * TODO(phase-4): add BlackSpot and AlertLog.
 * TODO(phase-5): add IncidentReport.
 * TODO(phase-6): add EmergencyContact.
 */

import type { Timestamp } from 'firebase/firestore';

/** Ordered low → critical. Order is meaningful: used for alert prioritisation. */
export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Black spot categories, matching the BlackSpot.category field. */
export const BLACK_SPOT_CATEGORIES = ['accident', 'crime', 'mixed', 'unsafe-road'] as const;
export type BlackSpotCategory = (typeof BLACK_SPOT_CATEGORIES)[number];

/** Human-readable risk labels. Risk is never communicated by colour alone. */
export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
  critical: 'Critical risk',
};

/** Sort weight for prioritising overlapping alerts (higher wins). */
export const RISK_LEVEL_WEIGHT: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// -----------------------------------------------------------------------------
// User profile
// -----------------------------------------------------------------------------

/**
 * Access roles.
 *
 * Only ever assigned server-side. Firestore rules pin `role` to `"user"` on
 * create and forbid changing it, so a client cannot escalate itself; promotion
 * to moderator or admin happens through the Admin SDK in Phase 7.
 */
export const USER_ROLES = ['user', 'moderator', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type DarkModePreference = (typeof THEME_PREFERENCES)[number];

/**
 * A user's profile document at `users/{id}`.
 *
 * Deliberately minimal: no location history, no device fingerprint, nothing that
 * is not needed by a documented feature. `id` matches the Firebase Auth uid.
 *
 * Timestamps are `Timestamp` on read. They are written as
 * `serverTimestamp()` sentinels, so the server clock is authoritative rather
 * than a device clock that may be wrong or deliberately altered.
 */
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  alertRadiusM: number;
  alertsEnabled: boolean;
  backgroundMonitoringEnabled: boolean;
  hapticsEnabled: boolean;
  soundEnabled: boolean;
  darkModePreference: DarkModePreference;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/** Fields a user may change about themselves. */
export type UserProfilePreferences = Pick<
  UserProfile,
  | 'name'
  | 'phone'
  | 'alertRadiusM'
  | 'alertsEnabled'
  | 'backgroundMonitoringEnabled'
  | 'hapticsEnabled'
  | 'soundEnabled'
  | 'darkModePreference'
>;
