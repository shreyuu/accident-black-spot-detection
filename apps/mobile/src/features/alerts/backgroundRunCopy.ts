import type {
  BackgroundRunOutcome,
  BackgroundRunSummary,
} from '@/features/alerts/backgroundRunHealth';

/**
 * User-facing copy for the background task's run history.
 *
 * Kept in one module, like `blackSpotCopy`, so the wording can be reviewed
 * against the project's safety rules in one place.
 *
 * ## The rule this copy has to obey
 *
 * The app must never claim more than it can confirm. That cuts both ways here.
 * It must not imply background warnings are working when the record does not
 * show that — but it also must not announce a fault it cannot establish. A phone
 * that sat still overnight produces no location updates, and "background
 * warnings have stopped working" would be a false alarm about a safety feature,
 * which is its own kind of harm.
 *
 * So the copy reports **observations**, not diagnoses: when the task last ran,
 * what happened, and what the user can do. It never says "working" and never
 * says "broken".
 */

/** What the last run did, in the user's terms. */
export const OUTCOME_DESCRIPTIONS: Record<BackgroundRunOutcome, string> = {
  'alert-delivered': 'Sent you a warning.',
  'evaluated-no-alert': 'Checked your surroundings and found nothing to warn about.',
  'no-cached-spots':
    'Ran, but had no black spot data saved for that area, so it could not check anything.',
  'no-valid-fix': 'Ran, but the location reading was not usable.',
  stopped: 'Stopped itself, because background warnings are switched off.',
  failed: 'Ran into an error and could not finish.',
};

/**
 * A coarse "how long ago", for a caption that updates once a minute.
 *
 * Deliberately imprecise past an hour. "Yesterday" is what somebody needs to
 * know; "19 hours and 40 minutes ago" is noise that also happens to be a
 * sharper record of when they were moving.
 */
export function describeElapsed(elapsedMs: number): string {
  if (elapsedMs < 0) return 'just now';

  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return 'less than a minute ago';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'about an hour ago';
  if (hours < 24) return `about ${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'about a day ago' : `about ${days} days ago`;
}

export interface BackgroundRunCopy {
  /** One line: when it last ran, and what happened. */
  headline: string;
  /** What the user might do about it, or `null` when there is nothing to do. */
  advice: string | null;
}

/**
 * Turn a summary into the two lines Settings shows.
 *
 * @param summary From `summariseBackgroundRuns`.
 * @param nowMs The clock the summary was taken against.
 */
export function describeBackgroundRuns(
  summary: BackgroundRunSummary,
  nowMs: number,
): BackgroundRunCopy {
  if (summary.lastRunAtMs === null || summary.lastOutcome === null) {
    return {
      headline: 'Has not run yet on this device.',
      // Not framed as a problem. Immediately after opting in this is simply
      // true, and the first run waits on the user actually moving.
      advice: 'It runs when your device reports a significant change in location.',
    };
  }

  const when = describeElapsed(nowMs - summary.lastRunAtMs);
  const headline = `Last ran ${when}. ${OUTCOME_DESCRIPTIONS[summary.lastOutcome]}`;

  // Ordered by what is worth saying most. A run that failed outright matters
  // more than missing coverage, which matters more than a long quiet gap.
  if (summary.failures > 0) {
    return {
      headline,
      advice:
        summary.failures === 1
          ? 'One check ended in an error in the last two days.'
          : `${summary.failures} checks ended in an error in the last two days.`,
    };
  }

  if (summary.lastOutcome === 'no-cached-spots' || summary.missingCoverage > 0) {
    return {
      headline,
      advice:
        'Open the map where you travel so black spots for that area are saved to this device. ' +
        'Background checks can only use data already saved.',
    };
  }

  if (summary.stale) {
    return {
      headline,
      // "Has not run" rather than "has stopped working" — see the note above.
      advice:
        'It has not run for a while. That is expected if your device has not moved much. ' +
        'If you have been travelling, open the app to let it start again.',
    };
  }

  return { headline, advice: null };
}
