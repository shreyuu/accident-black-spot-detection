import type { IncidentType } from './vocabulary.ts';

/**
 * Rate limiting and duplicate detection for incident reports.
 *
 * ## Why this is a pure module and also a Firestore rule
 *
 * Exactly the arrangement `evaluateModerationDecision` uses, for the same
 * reason. The Firestore rules in `firebase/firestore.rules` are the **control**:
 * they run on Google's servers, cannot be bypassed by a modified client, and
 * refuse the write. But a rule can only say PERMISSION_DENIED — it cannot tell a
 * user *"you have filed 10 reports today, try again tomorrow"* or *"you already
 * reported this junction two hours ago"*. So the same decisions are computed
 * here, before the write, purely to produce an honest message.
 *
 * If the two ever disagree, the rules win and the user sees a generic failure.
 * That is the safe direction: this module can only ever be more conservative
 * than the server, never more permissive.
 *
 * ## How the server enforces something it cannot count
 *
 * Firestore rules cannot count documents in a collection — there is no
 * aggregate, and a rule that read every report a user had ever filed would cost
 * a read per evaluation. So the count is carried in a document the user writes
 * themselves, and the rules constrain the *transition* rather than the value:
 *
 *   - the report write must be committed in the same batch as its rate-limit
 *     document, because the report rule tests the counter's post-commit state
 *     with `getAfter(...)` and requires its `lastReportAt` to equal
 *     `request.time` — a stamp only the server can produce and only for writes
 *     in this very commit;
 *   - the counter's own rules permit only two transitions, increment-within-
 *     window and reset-after-window, so a client cannot write an arbitrary count;
 *   - the counter cannot be deleted, so it cannot be reset by destroying it.
 *
 * Duplicate detection works the same way. The fingerprint document's id is
 * derived from the reporter, the incident type and a truncated geohash, and the
 * rule **recomputes that id from the report's own fields** — so a client cannot
 * satisfy the check by pointing at some unrelated document.
 *
 * ## What duplicate detection does not claim
 *
 * The location component is a geohash prefix, which is a grid cell, not a
 * radius. Two reports 20 m apart either side of a cell boundary land in
 * different cells and are not treated as duplicates. This is a mitigation
 * against accidental and casual repeat submission, not a proof of uniqueness —
 * the thorough version is the proximity-based dedupe the Phase 10 analytics
 * service performs on ingest, where a real haversine distance is available.
 */

/**
 * Geohash characters kept in a fingerprint.
 *
 * 7 characters is roughly a 153 m × 153 m cell — about the span of one junction
 * and its approaches, which is the granularity at which two reports by the same
 * person about the same incident type are far more likely to be the same event
 * than two different ones. Precision 6 (~1.2 km) would fold genuinely distinct
 * urban hazards together and suppress real reports, which is the more damaging
 * error for a safety app.
 */
export const FINGERPRINT_GEOHASH_PRECISION = 7;

/**
 * How long a fingerprint suppresses a repeat.
 *
 * After this, the same person reporting the same type of incident at the same
 * junction is treated as a new event rather than a duplicate — because it
 * probably is one. A black spot is somewhere things happen repeatedly, so a
 * permanent fingerprint would silence exactly the corroboration the analytics
 * service is looking for.
 */
export const DUPLICATE_WINDOW_HOURS = 6;

/** Rate limits applied to report submission, enforced by `firestore.rules`. */
export const REPORT_RATE_LIMIT = {
  /** Rolling window length. */
  windowHours: 24,
  /**
   * Reports permitted per window.
   *
   * Set generously on purpose. Someone driving an unfamiliar route may
   * legitimately file several hazards in an hour, and a limit that stops a
   * conscientious user reporting a real danger has caused more harm than the
   * spam it prevented. The value bounds abuse; it is not meant to be reached.
   */
  maxPerWindow: 10,
  /**
   * Minimum gap between two submissions.
   *
   * The anti-flood control. A person filling in a description and attaching a
   * photo cannot produce two reports inside a minute; a script can produce
   * hundreds.
   */
  minGapSeconds: 60,
} as const;

/** The `reportRateLimits/{userId}` document, as both the client and the rules see it. */
export interface ReportRateLimitState {
  userId: string;
  /** Start of the current window, in epoch milliseconds. */
  windowStartAtMs: number;
  /** Reports filed since `windowStartAtMs`. */
  count: number;
  /** When the most recent report was filed, in epoch milliseconds. */
  lastReportAtMs: number;
}

/** The `reportFingerprints/{fingerprintId}` document. */
export interface ReportFingerprintState {
  reporterId: string;
  /** The report this fingerprint was last claimed by. */
  reportId: string;
  lastReportAtMs: number;
}

export type ReportLimitRefusal =
  | { reason: 'rate-limited'; message: string; retryAfterMs: number }
  | { reason: 'too-soon'; message: string; retryAfterMs: number }
  | { reason: 'duplicate'; message: string; retryAfterMs: number };

export type ReportLimitDecision =
  | { allowed: true; nextRateLimit: ReportRateLimitState }
  | { allowed: false; refusal: ReportLimitRefusal };

const HOUR_MS = 60 * 60 * 1000;
const SECOND_MS = 1000;

/**
 * The document id used to detect a duplicate.
 *
 * Must stay byte-for-byte identical to the expression in `firestore.rules`,
 * which rebuilds it as
 * `request.auth.uid + '__' + data.type + '__' + data.geohash[0:7]`.
 * A change here without the matching change there does not create a security
 * hole — the rule would simply refuse every report — but it does break
 * submission, so the rules tests assert the two agree.
 *
 * `__` is the separator because a Firestore document id may not contain `/`,
 * and because no uid, incident type or geohash character is an underscore, so
 * the encoding is unambiguous.
 */
export function buildReportFingerprintId(
  reporterId: string,
  type: IncidentType,
  geohash: string,
): string {
  return `${reporterId}__${type}__${geohash.slice(0, FINGERPRINT_GEOHASH_PRECISION)}`;
}

/**
 * Whether a report may be filed now, and what the counter should become.
 *
 * @param rateLimit Current counter, or `null` when the user has never filed one.
 * @param fingerprint Existing fingerprint for this reporter/type/place, or `null`.
 * @param reportId The id reserved for this submission. A retry reuses it, which
 *   is what distinguishes "the same report sent twice because the response was
 *   lost" from "a second report about the same thing".
 * @param nowMs Injected clock. Never `Date.now()` at module scope — see the note
 *   on `buildIncidentReportFormSchema`.
 */
export function evaluateReportLimits(input: {
  rateLimit: ReportRateLimitState | null;
  fingerprint: ReportFingerprintState | null;
  reporterId: string;
  reportId: string;
  nowMs: number;
}): ReportLimitDecision {
  const { rateLimit, fingerprint, reporterId, reportId, nowMs } = input;

  const duplicate = checkDuplicate(fingerprint, reportId, nowMs);
  if (duplicate !== null) {
    return { allowed: false, refusal: duplicate };
  }

  if (rateLimit === null) {
    return {
      allowed: true,
      nextRateLimit: {
        userId: reporterId,
        windowStartAtMs: nowMs,
        count: 1,
        lastReportAtMs: nowMs,
      },
    };
  }

  const sinceLastMs = nowMs - rateLimit.lastReportAtMs;
  const minGapMs = REPORT_RATE_LIMIT.minGapSeconds * SECOND_MS;

  if (sinceLastMs < minGapMs) {
    return {
      allowed: false,
      refusal: {
        reason: 'too-soon',
        message: 'You just submitted a report. Please wait a moment before sending another.',
        retryAfterMs: minGapMs - sinceLastMs,
      },
    };
  }

  const windowMs = REPORT_RATE_LIMIT.windowHours * HOUR_MS;
  const windowEndsAtMs = rateLimit.windowStartAtMs + windowMs;

  // Window elapsed: start a fresh one rather than carrying the old count over.
  if (nowMs > windowEndsAtMs) {
    return {
      allowed: true,
      nextRateLimit: {
        userId: reporterId,
        windowStartAtMs: nowMs,
        count: 1,
        lastReportAtMs: nowMs,
      },
    };
  }

  if (rateLimit.count >= REPORT_RATE_LIMIT.maxPerWindow) {
    return {
      allowed: false,
      refusal: {
        reason: 'rate-limited',
        message: `You have submitted ${REPORT_RATE_LIMIT.maxPerWindow} reports today, which is the daily limit. Your existing reports are unaffected. If this is an emergency, call the emergency services.`,
        retryAfterMs: windowEndsAtMs - nowMs,
      },
    };
  }

  return {
    allowed: true,
    nextRateLimit: {
      userId: reporterId,
      windowStartAtMs: rateLimit.windowStartAtMs,
      count: rateLimit.count + 1,
      lastReportAtMs: nowMs,
    },
  };
}

/**
 * A duplicate is a *different* report claiming a fingerprint still held by a
 * recent one.
 *
 * The `reportId` comparison is what keeps retries working. A submission that
 * failed after the server had already committed it is retried with the same
 * reserved id, so it re-claims its own fingerprint and is not a duplicate. A
 * genuinely new submission carries a new id and is refused.
 */
function checkDuplicate(
  fingerprint: ReportFingerprintState | null,
  reportId: string,
  nowMs: number,
): ReportLimitRefusal | null {
  if (fingerprint === null || fingerprint.reportId === reportId) {
    return null;
  }

  const expiresAtMs = fingerprint.lastReportAtMs + DUPLICATE_WINDOW_HOURS * HOUR_MS;
  if (nowMs > expiresAtMs) {
    return null;
  }

  return {
    reason: 'duplicate',
    message:
      'You have already reported this kind of incident at this location recently. There is no need to report it again — it is in the moderation queue.',
    retryAfterMs: expiresAtMs - nowMs,
  };
}
