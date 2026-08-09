import {
  OUTCOME_DESCRIPTIONS,
  describeBackgroundRuns,
  describeElapsed,
} from '@/features/alerts/backgroundRunCopy';
import type { BackgroundRunSummary } from '@/features/alerts/backgroundRunHealth';

const NOW = 1_800_000_000_000;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function summary(overrides: Partial<BackgroundRunSummary> = {}): BackgroundRunSummary {
  return {
    lastRunAtMs: NOW - 5 * MINUTE,
    lastOutcome: 'evaluated-no-alert',
    totalRuns: 3,
    alertsDelivered: 0,
    missingCoverage: 0,
    failures: 0,
    stale: false,
    ...overrides,
  };
}

describe('describeElapsed', () => {
  it.each([
    [0, 'less than a minute ago'],
    [30 * 1000, 'less than a minute ago'],
    [MINUTE, '1 minute ago'],
    [5 * MINUTE, '5 minutes ago'],
    [59 * MINUTE, '59 minutes ago'],
    [HOUR, 'about an hour ago'],
    [5 * HOUR, 'about 5 hours ago'],
    [24 * HOUR, 'about a day ago'],
    [50 * HOUR, 'about 2 days ago'],
  ])('renders %pms as %p', (elapsed, expected) => {
    expect(describeElapsed(elapsed)).toBe(expected);
  });

  // A clock that moved backwards must not produce "-3 minutes ago".
  it('handles a negative elapsed time', () => {
    expect(describeElapsed(-HOUR)).toBe('just now');
  });
});

describe('describeBackgroundRuns', () => {
  it('says so plainly when the task has never run', () => {
    const copy = describeBackgroundRuns(
      summary({ lastRunAtMs: null, lastOutcome: null, totalRuns: 0 }),
      NOW,
    );

    expect(copy.headline).toBe('Has not run yet on this device.');
    // Not framed as a fault: immediately after opting in this is just true.
    expect(copy.advice).not.toMatch(/error|problem|not working|failed/i);
  });

  it('reports when it last ran and what happened', () => {
    const copy = describeBackgroundRuns(summary(), NOW);

    expect(copy.headline).toBe(
      `Last ran 5 minutes ago. ${OUTCOME_DESCRIPTIONS['evaluated-no-alert']}`,
    );
    expect(copy.advice).toBeNull();
  });

  it('leads with failures when there have been any', () => {
    expect(describeBackgroundRuns(summary({ failures: 1 }), NOW).advice).toBe(
      'One check ended in an error in the last two days.',
    );
    expect(describeBackgroundRuns(summary({ failures: 3 }), NOW).advice).toMatch(/^3 checks/);
  });

  it('tells the user how to fix missing coverage', () => {
    const copy = describeBackgroundRuns(
      summary({ lastOutcome: 'no-cached-spots', missingCoverage: 2 }),
      NOW,
    );

    expect(copy.advice).toMatch(/open the map/i);
  });

  it('prefers the failure message over the coverage message', () => {
    const copy = describeBackgroundRuns(
      summary({ lastOutcome: 'no-cached-spots', missingCoverage: 2, failures: 1 }),
      NOW,
    );

    expect(copy.advice).toMatch(/error/i);
  });

  // The safety-copy rule: the app may report what it observed, never diagnose a
  // fault it cannot confirm. A stationary phone produces no runs, and telling
  // that user their warnings have stopped working is a false alarm about a
  // safety feature.
  it('does not claim the feature is broken when runs are merely stale', () => {
    const copy = describeBackgroundRuns(summary({ stale: true }), NOW);

    expect(copy.advice).toMatch(/expected if your device has not moved/i);
    expect(copy.advice).not.toMatch(/stopped working|broken|not working|disabled/i);
  });

  // The mirror of the rule above: it must not claim success either.
  it.each(['evaluated-no-alert', 'alert-delivered'] as const)(
    'never claims the feature is working, for outcome %p',
    (lastOutcome) => {
      const copy = describeBackgroundRuns(summary({ lastOutcome }), NOW);

      expect(`${copy.headline} ${copy.advice ?? ''}`).not.toMatch(
        /working correctly|you are protected|you're protected|guaranteed/i,
      );
    },
  );

  it('has copy for every outcome', () => {
    for (const [outcome, description] of Object.entries(OUTCOME_DESCRIPTIONS)) {
      expect(description.length).toBeGreaterThan(0);
      expect(outcome.length).toBeGreaterThan(0);
    }
  });
});
