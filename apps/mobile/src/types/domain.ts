/**
 * Shared domain vocabulary.
 *
 * Entity interfaces are introduced by the phase that persists them, together
 * with their Zod schemas and Firestore converters, so runtime validation and
 * types always arrive as a pair.
 *
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

// -----------------------------------------------------------------------------
// Black spot
// -----------------------------------------------------------------------------

/** How a black spot came to exist. Drives how much trust the UI conveys. */
export const BLACK_SPOT_SOURCES = ['manual', 'reports', 'algorithm', 'official'] as const;
export type BlackSpotSource = (typeof BLACK_SPOT_SOURCES)[number];

/**
 * A published black spot at `blackSpots/{id}`.
 *
 * Only documents with `verified === true` **and** `active === true` are ever
 * shown to users or used for alerting. Everything else — algorithm candidates,
 * deactivated spots, records still under review — stays invisible. That rule is
 * enforced in the query, in the Firestore security rules, and again on read, so
 * no single mistake can surface an unverified hazard as an official one.
 */
export interface BlackSpot {
  id: string;
  name: string;
  description?: string;
  category: BlackSpotCategory;
  latitude: number;
  longitude: number;
  /**
   * Geohash of the coordinates, written by whoever creates the document.
   *
   * Firestore has no native radius query, so nearby lookups are done as
   * range queries over this field — see blackSpotRepository.
   */
  geohash: string;
  /** Warning radius in metres. */
  radiusM: number;
  riskLevel: RiskLevel;
  /** Normalised 0–100, produced by the analytics service in Phase 10. */
  severityScore: number;
  accidentCount: number;
  crimeCount: number;
  reportCount: number;
  verified: boolean;
  active: boolean;
  source: BlackSpotSource;
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/** A black spot paired with the user's current distance from it. */
export interface NearbyBlackSpot {
  spot: BlackSpot;
  /** Great-circle distance from the user, in metres. */
  distanceM: number;
}

// -----------------------------------------------------------------------------
// Incident report
// -----------------------------------------------------------------------------

/** What the reporter says happened. Drives moderation routing in Phase 7. */
export const INCIDENT_TYPES = ['accident', 'crime', 'pothole', 'unsafe-road', 'other'] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

/**
 * Reporter-assessed severity.
 *
 * Deliberately a three-point scale, not the four-point `RiskLevel` used for
 * published black spots. A member of the public is judging one event they
 * witnessed; a black spot's risk level is a moderated, aggregated judgement.
 * Keeping the vocabularies separate stops a self-reported "critical" from ever
 * reading as an official critical-risk classification.
 */
export const INCIDENT_SEVERITIES = ['low', 'medium', 'high'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

/**
 * Moderation state of a report.
 *
 * A client may only ever cause `pending`. `approved` and `rejected` are set by a
 * moderator through the Admin SDK in Phase 7, and Firestore rules refuse any
 * client write to the field — that is what stops the reporting flow from
 * becoming a way to publish unverified warnings.
 *
 * TODO(phase-11): `draft` is part of the agreed model but nothing writes it yet;
 * local drafts for reports composed offline are Phase 11 work.
 */
export const REPORT_STATUSES = ['draft', 'pending', 'approved', 'rejected'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * A crowdsourced report at `incidentReports/{id}`.
 *
 * An approved report is evidence *towards* a black spot, never a black spot
 * itself: nothing in this app promotes a report automatically. Approval is a
 * human decision, and publishing the resulting black spot is a second, separate
 * one (Phase 7), with the clustering that proposes candidates arriving in
 * Phase 10.
 */
export interface IncidentReport {
  id: string;
  /** Firebase Auth uid of the reporter. Pinned to the caller by the rules. */
  reporterId: string;
  type: IncidentType;
  description: string;
  latitude: number;
  longitude: number;
  /** Geohash of the coordinates, so Phase 10 can cluster without a full scan. */
  geohash: string;
  severity: IncidentSeverity;
  /** When the incident happened, if the reporter said. Not the submission time. */
  occurredAt?: Timestamp | null;
  /** Firebase Storage download URLs. Empty when no photograph was attached. */
  imageUrls: string[];
  status: ReportStatus;
  /** Moderator's explanation, shown to the reporter. Set server-side only. */
  moderationNotes?: string;
  reviewedBy?: string;
  reviewedAt?: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

// -----------------------------------------------------------------------------
// Emergency contact
// -----------------------------------------------------------------------------

/**
 * Someone the user has chosen to notify with an SOS, at
 * `emergencyContacts/{id}`.
 *
 * This is the most sensitive collection in the app: it is a list of real people
 * with real phone numbers, and they never consented to being here. It is
 * therefore deliberately minimal — a name, a number, and an optional label so
 * the user can tell two "Mum"s apart — and readable only by its owner. No email,
 * no address, no notes field that would invite storing more.
 *
 * Nothing is ever sent to these contacts automatically. The phone number is
 * handed to the device's own SMS composer, which the user must then send
 * themselves; this app has no server-side messaging and never will without a
 * separate, explicit decision.
 */
export interface EmergencyContact {
  id: string;
  /** Owner's Firebase Auth uid. Pinned by the security rules. */
  userId: string;
  name: string;
  /** Stored as the user typed it, minus separators. Never normalised to E.164. */
  phone: string;
  /** Free-text label such as "Sister" or "Neighbour". Optional. */
  relationship?: string;
  /**
   * Pre-selected when the SOS screen opens.
   *
   * At most one contact should carry this. It is enforced by the repository
   * writing the change in a batch rather than by the rules, because Firestore
   * rules cannot see other documents cheaply enough to make it a hard guarantee
   * — so the SOS screen also tolerates several, or none.
   */
  isPrimary: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/** Fields the user supplies. The rest is derived or server-set. */
export type EmergencyContactInput = Pick<
  EmergencyContact,
  'name' | 'phone' | 'relationship' | 'isPrimary'
>;

// -----------------------------------------------------------------------------
// Alert log
// -----------------------------------------------------------------------------

export const ALERT_TYPES = ['foreground', 'background', 'push'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/**
 * A record that the user was warned, at `alertLogs/{id}`.
 *
 * Coordinates are deliberately **optional** and are not written by the app in
 * Phase 4. Storing a position with every alert would build exactly the
 * continuous location history the project promised not to keep — the user is
 * told their location is not uploaded. The black spot id already says where the
 * alert happened, to the precision anyone needs.
 */
export interface AlertLog {
  id: string;
  userId: string;
  blackSpotId: string;
  distanceM: number;
  alertType: AlertType;
  latitude?: number;
  longitude?: number;
  createdAt: Timestamp | null;
}
