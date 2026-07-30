/**
 * The domain vocabulary both apps must agree on.
 *
 * Every string here is written by the mobile app and read by the admin
 * dashboard, or the reverse, and several are also hard-coded in
 * `firestore.rules`. A value that drifts between the two apps does not fail
 * loudly — it produces a report the moderation queue cannot see, or a risk level
 * the map renders as nothing.
 *
 * Order is meaningful where noted. Do not re-order those arrays.
 */

// -----------------------------------------------------------------------------
// Risk and black spots
// -----------------------------------------------------------------------------

/** Ordered low → critical. Order is meaningful: used for alert prioritisation. */
export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const BLACK_SPOT_CATEGORIES = ['accident', 'crime', 'mixed', 'unsafe-road'] as const;
export type BlackSpotCategory = (typeof BLACK_SPOT_CATEGORIES)[number];

/** How a black spot came to exist. Drives how much trust the UI conveys. */
export const BLACK_SPOT_SOURCES = ['manual', 'reports', 'algorithm', 'official'] as const;
export type BlackSpotSource = (typeof BLACK_SPOT_SOURCES)[number];

/** Bounds of a sane black spot radius, in metres. Mirrored in firestore.rules. */
export const BLACK_SPOT_RADIUS_BOUNDS_M = { min: 50, max: 5000 } as const;

// -----------------------------------------------------------------------------
// Incident reports
// -----------------------------------------------------------------------------

export const INCIDENT_TYPES = ['accident', 'crime', 'pothole', 'unsafe-road', 'other'] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

/**
 * Reporter-assessed severity.
 *
 * Deliberately a three-point scale, not the four-point `RiskLevel`. A member of
 * the public is judging one event they witnessed; a black spot's risk level is a
 * moderated, aggregated judgement. Keeping the vocabularies separate stops a
 * self-reported "critical" from ever reading as an official classification.
 */
export const INCIDENT_SEVERITIES = ['low', 'medium', 'high'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const REPORT_STATUSES = ['draft', 'pending', 'approved', 'rejected'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** The only status a client may ever cause. Enforced in firestore.rules. */
export const CLIENT_CREATABLE_STATUS: ReportStatus = 'pending';

/**
 * Fields on a report that only a moderator may write.
 *
 * Exported so the rules, the mobile client and the dashboard all derive their
 * behaviour from one list instead of three hand-maintained copies. `verified` is
 * included even though reports have no such field: it is on `BlackSpot`, and
 * listing it here keeps a client from inventing one.
 */
export const MODERATION_ONLY_FIELDS = [
  'status',
  'moderationNotes',
  'reviewedBy',
  'reviewedAt',
  'verified',
] as const;

export type ModerationOnlyField = (typeof MODERATION_ONLY_FIELDS)[number];

// -----------------------------------------------------------------------------
// Admin audit log
// -----------------------------------------------------------------------------

/**
 * Every privileged action that must leave a trace.
 *
 * The rule this encodes: if an action changes what users are shown, or changes
 * who can change that, it is auditable. Reads are not audited — a moderator
 * opening the queue is their job, and logging it would bury the decisions that
 * matter in noise.
 */
export const ADMIN_AUDIT_ACTIONS = [
  'report.approved',
  'report.rejected',
  'blackSpot.created',
  'blackSpot.updated',
  'blackSpot.deactivated',
  'blackSpot.reactivated',
  'role.granted',
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

export const AUDIT_TARGET_TYPES = ['incidentReport', 'blackSpot', 'user'] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

// -----------------------------------------------------------------------------
// Collection names
// -----------------------------------------------------------------------------

/** Single source of truth for collection paths across both apps and the rules. */
export const COLLECTIONS = {
  users: 'users',
  blackSpots: 'blackSpots',
  incidentReports: 'incidentReports',
  emergencyContacts: 'emergencyContacts',
  alertLogs: 'alertLogs',
  adminAuditLogs: 'adminAuditLogs',
} as const;
