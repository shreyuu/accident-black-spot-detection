/**
 * Collection names, duplicated from `packages/shared-types`.
 *
 * ## Why this is a copy and not an import
 *
 * `shared-types` is consumed as TypeScript **source** — that is the whole point
 * of it, and it is what lets a change to a safety-critical enum reach both apps
 * without a publish. But Cloud Functions run compiled JavaScript on a Node 22
 * runtime that does not strip types, so a deployed function importing that
 * package would fail at load time with a syntax error in production and nowhere
 * else. Giving `shared-types` a build step to solve this would add a compile to
 * the mobile and dashboard pipelines to serve one consumer.
 *
 * A copy is the honest trade, and it is the same trade `services/analytics`
 * already makes in Python. What makes it safe is that it is a *checked* copy:
 * `__tests__/collections.test.ts` imports the real thing — tests are not
 * deployed, so they may — and fails if the two lists ever disagree.
 */
export const COLLECTIONS = {
  users: 'users',
  blackSpots: 'blackSpots',
  incidentReports: 'incidentReports',
  emergencyContacts: 'emergencyContacts',
  alertLogs: 'alertLogs',
  adminAuditLogs: 'adminAuditLogs',
  blackSpotCandidates: 'blackSpotCandidates',
  analysisJobs: 'analysisJobs',
  reportRateLimits: 'reportRateLimits',
  reportFingerprints: 'reportFingerprints',
  deletedAccounts: 'deletedAccounts',
} as const;

/** Storage prefix holding report photographs, one folder per uid. */
export const REPORT_IMAGES_PREFIX = 'incidentReports';
