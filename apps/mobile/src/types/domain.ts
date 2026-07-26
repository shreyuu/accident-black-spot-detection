/**
 * Shared domain vocabulary.
 *
 * Phase 1 defines only the union types the UI layer needs (risk levels and
 * categories, consumed by RiskBadge). The full entity interfaces — UserProfile,
 * BlackSpot, IncidentReport, EmergencyContact, AlertLog, AdminAuditLog — arrive
 * with the phases that persist them, alongside their Zod schemas and Firestore
 * converters, so that types and runtime validation are introduced together.
 *
 * TODO(phase-2): add UserProfile.
 * TODO(phase-4): add BlackSpot and AlertLog.
 * TODO(phase-5): add IncidentReport.
 * TODO(phase-6): add EmergencyContact.
 */

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
