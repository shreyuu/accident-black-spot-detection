/**
 * Did the background task actually run, and what happened when it did?
 *
 * ## Why this exists
 *
 * The background proximity task is the only part of this app whose failure is
 * *silent*. Everything else reports itself: a failed report submission shows an
 * error, a denied permission shows a banner, a network problem throws an
 * `AppError` somebody sees. The background task has no UI, no user watching, and
 * no caller to return to — and its failure mode is that no warning arrives,
 * which is indistinguishable from "there was nothing to warn about". The app has
 * 899 tests proving `evaluateProximity` is correct and, until this module,
 * nothing at all establishing that it ever *ran*.
 *
 * That gap matters more here than it would elsewhere. The Settings screen tells
 * the user background warnings are "active"; iOS may stop scheduling the task,
 * Android may kill the process, the cached black spots may have gone stale, and
 * in every one of those cases the switch still reads "active" and the user
 * believes they are covered. This record is what makes the difference visible.
 *
 * ## What it deliberately does not store
 *
 * No coordinates, no black spot identifiers, no distances — nothing that
 * reconstructs where the user has been. This project's standing rule is to keep
 * the minimum personal data necessary and not to retain location history, and a
 * timestamped list of "you were near a hazard" *is* location history, however
 * coarse. What is stored is the outcome category and when it happened, which
 * answers "is the task alive" without answering "where was the user".
 *
 * The alert log (`alertLogRepository`) already records deliveries, server-side,
 * under the rules that govern it. This is not a second copy of that.
 *
 * ## Why pure, with a separate store
 *
 * Same split as `zoneStatePersistence` / `zoneStateStore`. The folding and
 * pruning decisions are testable without a device or a storage backend;
 * `backgroundRunHealthStore` is the thin AsyncStorage wrapper.
 */

/**
 * How a single background invocation ended.
 *
 * These are the exit points of `handleBackgroundLocations`, one label each. They
 * are distinguished because they mean very different things to somebody asking
 * why they were not warned: `no-cached-spots` is a coverage problem the user can
 * fix by opening the app, `stopped` means the task switched itself off, and
 * `failed` is a defect.
 */
export type BackgroundRunOutcome =
  /** A warning was delivered. */
  | 'alert-delivered'
  /** Ran, evaluated, nothing crossed a threshold. The healthy common case. */
  | 'evaluated-no-alert'
  /** No black spots cached for this area, so nothing could be evaluated. */
  | 'no-cached-spots'
  /** The batch carried no usable fix. */
  | 'no-valid-fix'
  /** The task stopped itself: opted out, signed out, or no snapshot. */
  | 'stopped'
  /** An exception escaped the evaluation. */
  | 'failed';

export interface BackgroundRun {
  atMs: number;
  outcome: BackgroundRunOutcome;
}

export interface BackgroundRunHealth {
  version: 1;
  runs: BackgroundRun[];
}

/** Bumped whenever the stored shape changes; an unrecognised version is discarded. */
export const BACKGROUND_RUN_HEALTH_VERSION = 1;

/**
 * How long a run is remembered, in milliseconds.
 *
 * Two days. Long enough to answer "did this work overnight?", which is the
 * question somebody actually asks, and short enough that the file is never a
 * meaningful record of a person's movements even in outline.
 */
export const RUN_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * Upper bound on stored runs, whatever their age.
 *
 * The OS can deliver location batches far more often than expected, and an
 * unbounded array on disk that grows with movement is both a storage leak and a
 * finer-grained movement trace than the age limit alone would allow. 200 entries
 * covers two days at a realistic delivery rate with room to spare.
 */
export const MAX_RUNS = 200;

export const EMPTY_BACKGROUND_RUN_HEALTH: BackgroundRunHealth = {
  version: BACKGROUND_RUN_HEALTH_VERSION,
  runs: [],
};

const OUTCOMES: readonly BackgroundRunOutcome[] = [
  'alert-delivered',
  'evaluated-no-alert',
  'no-cached-spots',
  'no-valid-fix',
  'stopped',
  'failed',
];

function isOutcome(value: unknown): value is BackgroundRunOutcome {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value);
}

/**
 * Fold one run into the record.
 *
 * Newest last, pruned by age and then by count. Pruning on write rather than on
 * read because the write is the only moment this module is guaranteed to be
 * reached — the read happens on a Settings screen the user may never open.
 *
 * @param previous The stored record, or `null` on first run.
 * @param outcome How this invocation ended.
 * @param nowMs When it ended.
 */
export function recordBackgroundRun(
  previous: BackgroundRunHealth | null,
  outcome: BackgroundRunOutcome,
  nowMs: number,
): BackgroundRunHealth {
  const existing = previous?.runs ?? [];
  const cutoffMs = nowMs - RUN_MAX_AGE_MS;

  // A clock that has gone backwards — a timezone change, a manual correction —
  // would otherwise leave "future" entries that never expire. Anything ahead of
  // now is dropped along with anything too old.
  const kept = existing.filter((run) => run.atMs > cutoffMs && run.atMs <= nowMs);

  const runs = [...kept, { atMs: nowMs, outcome }];

  return {
    version: BACKGROUND_RUN_HEALTH_VERSION,
    runs: runs.length > MAX_RUNS ? runs.slice(runs.length - MAX_RUNS) : runs,
  };
}

/**
 * Validate a stored record.
 *
 * Returns `null` for anything unrecognised, which the caller treats as "no
 * history yet". Discarding is safe here in a way it is not for
 * `backgroundAlertSnapshot`: this record never gates whether a warning fires, so
 * the worst case is a Settings screen that says it has nothing to report.
 */
export function parseBackgroundRunHealth(raw: unknown): BackgroundRunHealth | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (candidate.version !== BACKGROUND_RUN_HEALTH_VERSION || !Array.isArray(candidate.runs)) {
    return null;
  }

  const runs: BackgroundRun[] = [];
  for (const entry of candidate.runs) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const run = entry as Record<string, unknown>;
    // Individual malformed entries are skipped rather than failing the whole
    // record: a partial history is still worth showing, and the alternative
    // discards two days of evidence over one bad row.
    if (typeof run.atMs === 'number' && Number.isFinite(run.atMs) && isOutcome(run.outcome)) {
      runs.push({ atMs: run.atMs, outcome: run.outcome });
    }
  }

  return { version: BACKGROUND_RUN_HEALTH_VERSION, runs };
}

export interface BackgroundRunSummary {
  /** When the task last ran at all, or `null` if it never has. */
  lastRunAtMs: number | null;
  /** How that run ended. */
  lastOutcome: BackgroundRunOutcome | null;
  /** Runs recorded in the retention window. */
  totalRuns: number;
  /** Of those, how many delivered a warning. */
  alertsDelivered: number;
  /** Of those, how many found nothing cached to evaluate against. */
  missingCoverage: number;
  /** Of those, how many ended in an exception. */
  failures: number;
  /**
   * True when the task has run at all but not recently enough to be trusted.
   *
   * Deliberately *not* called "broken". A stationary phone in a pocket produces
   * no significant-location updates for hours and that is correct behaviour, so
   * this is a prompt to look, not a diagnosis. The copy that renders it must
   * keep that distinction — claiming a fault the app cannot confirm is the same
   * category of dishonesty as claiming coverage it does not have.
   */
  stale: boolean;
}

/**
 * How long without a run before the record is worth remarking on.
 *
 * Twelve hours. Long enough that an overnight gap on a phone that did not move
 * is not flagged, short enough that a task the OS quietly stopped scheduling
 * shows up within a day.
 */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export function summariseBackgroundRuns(
  health: BackgroundRunHealth | null,
  nowMs: number,
): BackgroundRunSummary {
  const runs = health?.runs ?? [];
  const last = runs[runs.length - 1] ?? null;

  return {
    lastRunAtMs: last?.atMs ?? null,
    lastOutcome: last?.outcome ?? null,
    totalRuns: runs.length,
    alertsDelivered: runs.filter((run) => run.outcome === 'alert-delivered').length,
    missingCoverage: runs.filter((run) => run.outcome === 'no-cached-spots').length,
    failures: runs.filter((run) => run.outcome === 'failed').length,
    stale: last !== null && nowMs - last.atMs > STALE_AFTER_MS,
  };
}
