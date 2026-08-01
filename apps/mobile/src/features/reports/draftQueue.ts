/**
 * Deciding what to do with reports that could not be submitted.
 *
 * Pure: no storage, no network, no React. `draftStore` persists what this
 * decides, and `useDraftQueue` acts on it.
 *
 * ## Why drafts exist at all
 *
 * The whole point of this app is that someone reports what they saw at the
 * roadside — which is exactly where the signal is worst. Before this, a failed
 * submission handed the user their form back with a "Try again": fine if they
 * were still looking at it, useless if they had put the phone away, and total
 * loss if the app was killed. Their observation, which nobody else can
 * reconstruct, was gone.
 *
 * A draft is that observation, kept on the device until it lands.
 *
 * ## What a draft is not
 *
 * A draft is **not a report**. It has never reached Firestore, no moderator has
 * seen it, and it is invisible to everyone but its author. The UI never counts
 * a draft as submitted, because a user who believes they have reported a hazard
 * and has not is worse off than one who knows the report is still waiting.
 */

/** Bumped when the stored shape changes; an unrecognised version is discarded. */
export const DRAFT_SCHEMA_VERSION = 1;

/**
 * How many automatic attempts a draft gets before it waits for the user.
 *
 * Five, then it stops and says so. Retrying for ever against a failure that is
 * never going to resolve — a rejected photograph, a signed-out account — burns
 * battery and data, and hides a problem the user could fix in seconds if asked.
 */
export const MAX_AUTOMATIC_ATTEMPTS = 5;

/**
 * Backoff between automatic attempts, in milliseconds.
 *
 * Exponential from 30 seconds, capped at 30 minutes. The first retry is quick
 * because the commonest cause is a momentary signal drop that has already
 * cleared; the cap exists because a phone in a tunnel for an hour should not
 * make sixty attempts.
 */
export const BASE_RETRY_DELAY_MS = 30_000;
export const MAX_RETRY_DELAY_MS = 30 * 60 * 1000;

/**
 * How long a draft is kept before it is treated as abandoned, in milliseconds.
 *
 * Fourteen days. Long enough to survive a holiday with no signal; short enough
 * that the device is not indefinitely holding a description of an incident and
 * a set of photographs the user has forgotten about. Data kept for no active
 * purpose is data this project has undertaken not to keep.
 */
export const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Why a draft is not currently being retried. */
export type DraftBlockedReason =
  /** Attempts are exhausted; the user must retry or discard it. */
  | 'attempts-exhausted'
  /** The last failure is one retrying cannot fix. */
  | 'not-retryable'
  /** Waiting for the backoff window to elapse. */
  | 'backoff'
  /** No network. */
  | 'offline'
  /** Nobody is signed in, so there is no author to attribute it to. */
  | 'signed-out';

export interface DraftRecord {
  id: string;
  /**
   * The Firestore document id reserved for this report.
   *
   * Held across every retry so a submission whose response was lost overwrites
   * the same document rather than filing the incident twice — the same
   * guarantee `useSubmitReport` makes within a session, extended across
   * restarts.
   */
  reportId: string;
  reporterId: string;
  /** Epoch ms the draft was created. */
  createdAt: number;
  /** Epoch ms of the last attempt, or null if never attempted. */
  lastAttemptAt: number | null;
  attempts: number;
  /** User-facing message from the last failure. */
  lastError: string | null;
  /** Whether that failure is worth retrying automatically. */
  lastErrorRetryable: boolean;
}

export interface RetryDecision {
  shouldRetry: boolean;
  reason: DraftBlockedReason | null;
  /** Epoch ms the next automatic attempt becomes possible, when waiting. */
  nextAttemptAt: number | null;
}

/**
 * Delay before attempt number `attempts + 1`.
 *
 * Exported so the UI can say when it will try again rather than leaving the
 * user watching a spinner with no idea whether anything is happening.
 */
export function retryDelayMs(attempts: number): number {
  if (attempts <= 0) {
    return 0;
  }
  const exponential = BASE_RETRY_DELAY_MS * 2 ** (attempts - 1);
  return Math.min(exponential, MAX_RETRY_DELAY_MS);
}

export interface RetryContext {
  now: number;
  isOnline: boolean;
  /** The signed-in user, or null. */
  currentUserId: string | null;
}

/**
 * Whether a draft should be retried automatically right now.
 *
 * The order of these checks is deliberate — each one answers a different
 * question for the user, and the first true reason is the one worth showing.
 */
export function shouldRetryAutomatically(draft: DraftRecord, context: RetryContext): RetryDecision {
  const blocked = (reason: DraftBlockedReason, nextAttemptAt: number | null = null) => ({
    shouldRetry: false,
    reason,
    nextAttemptAt,
  });

  // Checked first: a draft belonging to somebody else must never be submitted
  // under the current account, whatever its retry state.
  if (context.currentUserId === null || context.currentUserId !== draft.reporterId) {
    return blocked('signed-out');
  }

  if (!draft.lastErrorRetryable && draft.attempts > 0) {
    return blocked('not-retryable');
  }

  if (draft.attempts >= MAX_AUTOMATIC_ATTEMPTS) {
    return blocked('attempts-exhausted');
  }

  if (!context.isOnline) {
    return blocked('offline');
  }

  if (draft.lastAttemptAt !== null) {
    const readyAt = draft.lastAttemptAt + retryDelayMs(draft.attempts);
    if (context.now < readyAt) {
      return blocked('backoff', readyAt);
    }
  }

  return { shouldRetry: true, reason: null, nextAttemptAt: null };
}

/**
 * Whether the user can still ask for a retry by hand.
 *
 * Deliberately more permissive than the automatic path: a manual retry ignores
 * backoff and the attempt cap, because the user pressing the button is new
 * information — they have probably just reconnected, or fixed whatever was
 * wrong. The only thing it will not do is submit a draft belonging to a
 * different account.
 */
export function canRetryManually(draft: DraftRecord, context: RetryContext): boolean {
  return context.currentUserId !== null && context.currentUserId === draft.reporterId;
}

/** Record the outcome of an attempt. */
export function recordAttempt(
  draft: DraftRecord,
  outcome: { now: number; error: string | null; retryable: boolean },
): DraftRecord {
  return {
    ...draft,
    attempts: draft.attempts + 1,
    lastAttemptAt: outcome.now,
    lastError: outcome.error,
    lastErrorRetryable: outcome.retryable,
  };
}

/** True once a draft is older than the retention limit. */
export function isExpired(draft: DraftRecord, now: number): boolean {
  const age = now - draft.createdAt;
  // A negative age means the clock moved backwards. Treated as fresh: deleting
  // someone's unsent observation because their phone's clock is wrong would be
  // an unrecoverable loss for a recoverable problem.
  return age > DRAFT_MAX_AGE_MS;
}

/**
 * Drop expired drafts.
 *
 * Returns both halves so the caller can tell the user what was removed rather
 * than having their work disappear without explanation.
 */
export function partitionExpired(
  drafts: readonly DraftRecord[],
  now: number,
): { kept: DraftRecord[]; expired: DraftRecord[] } {
  const kept: DraftRecord[] = [];
  const expired: DraftRecord[] = [];

  for (const draft of drafts) {
    (isExpired(draft, now) ? expired : kept).push(draft);
  }

  return { kept, expired };
}

/**
 * Order drafts for display and for retrying: oldest first.
 *
 * Oldest first because the oldest observation is the one most at risk of
 * expiring, and because it is the order the user wrote them in.
 */
export function sortDrafts(drafts: readonly DraftRecord[]): DraftRecord[] {
  return [...drafts].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** One-line status for a draft, for the UI. */
export function describeDraftStatus(draft: DraftRecord, context: RetryContext): string {
  if (draft.attempts === 0) {
    return 'Waiting to send.';
  }

  const decision = shouldRetryAutomatically(draft, context);

  switch (decision.reason) {
    case 'offline':
      return 'Waiting for a connection.';
    case 'backoff':
      return 'Will try again shortly.';
    case 'attempts-exhausted':
      return `Could not send after ${draft.attempts} attempts. Tap to try again.`;
    case 'not-retryable':
      // The specific failure, because it is usually something the user can act
      // on — and "something went wrong" is not actionable.
      return draft.lastError ?? 'Could not send. Tap to try again.';
    case 'signed-out':
      return 'Sign in as the account that wrote this to send it.';
    case null:
      return 'Sending…';
  }
}
