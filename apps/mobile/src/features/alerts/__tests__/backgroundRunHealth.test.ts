import {
  EMPTY_BACKGROUND_RUN_HEALTH,
  MAX_RUNS,
  RUN_MAX_AGE_MS,
  STALE_AFTER_MS,
  parseBackgroundRunHealth,
  recordBackgroundRun,
  summariseBackgroundRuns,
  type BackgroundRunHealth,
} from '@/features/alerts/backgroundRunHealth';

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

function healthWith(runs: BackgroundRunHealth['runs']): BackgroundRunHealth {
  return { version: 1, runs };
}

describe('recordBackgroundRun', () => {
  // Happy path first: a record that silently drops everything passes every test
  // that only checks pruning.
  it('appends the first run', () => {
    const result = recordBackgroundRun(null, 'evaluated-no-alert', NOW);

    expect(result.runs).toEqual([{ atMs: NOW, outcome: 'evaluated-no-alert' }]);
  });

  it('appends to an existing history, newest last', () => {
    const previous = healthWith([{ atMs: NOW - HOUR, outcome: 'alert-delivered' }]);

    const result = recordBackgroundRun(previous, 'no-cached-spots', NOW);

    expect(result.runs).toEqual([
      { atMs: NOW - HOUR, outcome: 'alert-delivered' },
      { atMs: NOW, outcome: 'no-cached-spots' },
    ]);
  });

  it('drops runs older than the retention window', () => {
    const previous = healthWith([
      { atMs: NOW - RUN_MAX_AGE_MS - 1, outcome: 'alert-delivered' },
      { atMs: NOW - HOUR, outcome: 'evaluated-no-alert' },
    ]);

    const result = recordBackgroundRun(previous, 'evaluated-no-alert', NOW);

    expect(result.runs).toHaveLength(2);
    expect(result.runs.map((run) => run.atMs)).toEqual([NOW - HOUR, NOW]);
  });

  // A clock correction or a timezone change can leave entries dated ahead of
  // now. Without this they would never fall outside the window and the history
  // would never drain.
  it('drops runs dated in the future', () => {
    const previous = healthWith([{ atMs: NOW + HOUR, outcome: 'alert-delivered' }]);

    const result = recordBackgroundRun(previous, 'evaluated-no-alert', NOW);

    expect(result.runs).toEqual([{ atMs: NOW, outcome: 'evaluated-no-alert' }]);
  });

  it('caps the history, keeping the newest entries', () => {
    const previous = healthWith(
      Array.from({ length: MAX_RUNS }, (_, index) => ({
        atMs: NOW - MAX_RUNS + index,
        outcome: 'evaluated-no-alert' as const,
      })),
    );

    const result = recordBackgroundRun(previous, 'alert-delivered', NOW);

    expect(result.runs).toHaveLength(MAX_RUNS);
    expect(result.runs.at(-1)).toEqual({ atMs: NOW, outcome: 'alert-delivered' });
    // The oldest was pushed out rather than the newest dropped.
    expect(result.runs[0]?.atMs).toBe(NOW - MAX_RUNS + 1);
  });

  // The privacy constraint, asserted rather than trusted to review. Nothing in
  // a stored run may identify where the user was.
  it('stores nothing but a timestamp and an outcome', () => {
    const result = recordBackgroundRun(null, 'alert-delivered', NOW);

    for (const run of result.runs) {
      expect(Object.keys(run).sort()).toEqual(['atMs', 'outcome']);
    }
  });
});

describe('parseBackgroundRunHealth', () => {
  it('round-trips a record it wrote', () => {
    const written = recordBackgroundRun(null, 'alert-delivered', NOW);

    expect(parseBackgroundRunHealth(JSON.parse(JSON.stringify(written)))).toEqual(written);
  });

  it.each([null, undefined, 42, 'nope', [], {}, { version: 2, runs: [] }, { version: 1 }])(
    'rejects %p',
    (raw) => {
      expect(parseBackgroundRunHealth(raw)).toBeNull();
    },
  );

  // A partial history is worth more than none: discarding two days of evidence
  // over one malformed row is the wrong trade for a diagnostic record.
  it('skips malformed entries but keeps the rest', () => {
    const result = parseBackgroundRunHealth({
      version: 1,
      runs: [
        { atMs: NOW, outcome: 'alert-delivered' },
        { atMs: 'not a number', outcome: 'alert-delivered' },
        { atMs: NOW, outcome: 'not-an-outcome' },
        null,
        { atMs: Number.NaN, outcome: 'failed' },
        { atMs: NOW + 1, outcome: 'failed' },
      ],
    });

    expect(result?.runs).toEqual([
      { atMs: NOW, outcome: 'alert-delivered' },
      { atMs: NOW + 1, outcome: 'failed' },
    ]);
  });
});

describe('summariseBackgroundRuns', () => {
  it('reports an empty history without inventing a last run', () => {
    expect(summariseBackgroundRuns(null, NOW)).toEqual({
      lastRunAtMs: null,
      lastOutcome: null,
      totalRuns: 0,
      alertsDelivered: 0,
      missingCoverage: 0,
      failures: 0,
      stale: false,
    });

    expect(summariseBackgroundRuns(EMPTY_BACKGROUND_RUN_HEALTH, NOW).lastRunAtMs).toBeNull();
  });

  it('counts each outcome and reports the most recent run', () => {
    const summary = summariseBackgroundRuns(
      healthWith([
        { atMs: NOW - 3 * HOUR, outcome: 'alert-delivered' },
        { atMs: NOW - 2 * HOUR, outcome: 'no-cached-spots' },
        { atMs: NOW - HOUR, outcome: 'failed' },
        { atMs: NOW, outcome: 'evaluated-no-alert' },
      ]),
      NOW,
    );

    expect(summary).toEqual({
      lastRunAtMs: NOW,
      lastOutcome: 'evaluated-no-alert',
      totalRuns: 4,
      alertsDelivered: 1,
      missingCoverage: 1,
      failures: 1,
      stale: false,
    });
  });

  it('marks a long gap as stale', () => {
    const summary = summariseBackgroundRuns(
      healthWith([{ atMs: NOW - STALE_AFTER_MS - 1, outcome: 'evaluated-no-alert' }]),
      NOW,
    );

    expect(summary.stale).toBe(true);
  });

  it('does not mark a run exactly at the threshold as stale', () => {
    const summary = summariseBackgroundRuns(
      healthWith([{ atMs: NOW - STALE_AFTER_MS, outcome: 'evaluated-no-alert' }]),
      NOW,
    );

    expect(summary.stale).toBe(false);
  });

  // "Never run" and "ran long ago" are different situations with different
  // copy. Conflating them would tell a user who just opted in that something
  // had stopped working.
  it('never reports an empty history as stale', () => {
    expect(summariseBackgroundRuns(healthWith([]), NOW).stale).toBe(false);
  });
});
