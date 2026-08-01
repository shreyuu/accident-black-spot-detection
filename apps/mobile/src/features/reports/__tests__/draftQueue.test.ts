import {
  BASE_RETRY_DELAY_MS,
  DRAFT_MAX_AGE_MS,
  MAX_AUTOMATIC_ATTEMPTS,
  MAX_RETRY_DELAY_MS,
  canRetryManually,
  describeDraftStatus,
  isExpired,
  partitionExpired,
  recordAttempt,
  retryDelayMs,
  shouldRetryAutomatically,
  sortDrafts,
  type DraftRecord,
  type RetryContext,
} from '@/features/reports/draftQueue';

const NOW = 1_700_000_000_000;
const OWNER = 'reporter-1';

function draft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: 'draft-1',
    reportId: 'report-1',
    reporterId: OWNER,
    createdAt: NOW - 60_000,
    lastAttemptAt: null,
    attempts: 0,
    lastError: null,
    lastErrorRetryable: true,
    ...overrides,
  };
}

function context(overrides: Partial<RetryContext> = {}): RetryContext {
  return { now: NOW, isOnline: true, currentUserId: OWNER, ...overrides };
}

describe('retryDelayMs', () => {
  it('does not wait before the first attempt', () => {
    expect(retryDelayMs(0)).toBe(0);
  });

  it('starts at the base delay', () => {
    expect(retryDelayMs(1)).toBe(BASE_RETRY_DELAY_MS);
  });

  it('backs off exponentially', () => {
    expect(retryDelayMs(2)).toBe(BASE_RETRY_DELAY_MS * 2);
    expect(retryDelayMs(3)).toBe(BASE_RETRY_DELAY_MS * 4);
  });

  it('is capped, so an hour in a tunnel is not sixty attempts', () => {
    expect(retryDelayMs(50)).toBe(MAX_RETRY_DELAY_MS);
  });
});

describe('shouldRetryAutomatically', () => {
  it('retries a fresh draft', () => {
    expect(shouldRetryAutomatically(draft(), context()).shouldRetry).toBe(true);
  });

  it('waits while offline', () => {
    const decision = shouldRetryAutomatically(draft(), context({ isOnline: false }));

    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toBe('offline');
  });

  it('waits out the backoff window', () => {
    const decision = shouldRetryAutomatically(
      draft({ attempts: 1, lastAttemptAt: NOW - 1000 }),
      context(),
    );

    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toBe('backoff');
    expect(decision.nextAttemptAt).toBe(NOW - 1000 + BASE_RETRY_DELAY_MS);
  });

  it('retries once the backoff window has elapsed', () => {
    const decision = shouldRetryAutomatically(
      draft({ attempts: 1, lastAttemptAt: NOW - BASE_RETRY_DELAY_MS - 1 }),
      context(),
    );

    expect(decision.shouldRetry).toBe(true);
  });

  it('stops after the attempt cap', () => {
    const decision = shouldRetryAutomatically(
      draft({ attempts: MAX_AUTOMATIC_ATTEMPTS, lastAttemptAt: NOW - MAX_RETRY_DELAY_MS * 2 }),
      context(),
    );

    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toBe('attempts-exhausted');
  });

  it('stops immediately for a failure retrying cannot fix', () => {
    // A rejected photograph or a validation failure will fail identically
    // forever; retrying burns battery and hides a fixable problem.
    const decision = shouldRetryAutomatically(
      draft({ attempts: 1, lastAttemptAt: 0, lastErrorRetryable: false }),
      context(),
    );

    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toBe('not-retryable');
  });

  describe('account ownership', () => {
    it('never submits a draft while signed out', () => {
      const decision = shouldRetryAutomatically(draft(), context({ currentUserId: null }));

      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe('signed-out');
    });

    it('never submits one user’s draft under another account', () => {
      // The load-bearing case: a shared device must not attribute someone's
      // observation to whoever happens to be signed in.
      const decision = shouldRetryAutomatically(
        draft(),
        context({ currentUserId: 'someone-else' }),
      );

      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe('signed-out');
    });

    it('checks ownership before anything else', () => {
      // Even an otherwise-perfect draft is refused for the wrong account.
      const decision = shouldRetryAutomatically(
        draft({ attempts: 0, lastErrorRetryable: true }),
        context({ currentUserId: 'someone-else', isOnline: false }),
      );

      expect(decision.reason).toBe('signed-out');
    });
  });
});

describe('canRetryManually', () => {
  it('allows a manual retry past the attempt cap', () => {
    // The user pressing the button is new information — they have probably
    // just reconnected or fixed whatever was wrong.
    expect(canRetryManually(draft({ attempts: 99 }), context())).toBe(true);
  });

  it('allows a manual retry inside the backoff window', () => {
    expect(canRetryManually(draft({ attempts: 2, lastAttemptAt: NOW }), context())).toBe(true);
  });

  it('allows a manual retry for a non-retryable failure', () => {
    expect(canRetryManually(draft({ lastErrorRetryable: false }), context())).toBe(true);
  });

  it('still refuses a draft belonging to another account', () => {
    expect(canRetryManually(draft(), context({ currentUserId: 'someone-else' }))).toBe(false);
  });

  it('still refuses while signed out', () => {
    expect(canRetryManually(draft(), context({ currentUserId: null }))).toBe(false);
  });
});

describe('recordAttempt', () => {
  it('counts the attempt and stores the outcome', () => {
    const updated = recordAttempt(draft(), {
      now: NOW,
      error: 'No internet connection.',
      retryable: true,
    });

    expect(updated.attempts).toBe(1);
    expect(updated.lastAttemptAt).toBe(NOW);
    expect(updated.lastError).toBe('No internet connection.');
    expect(updated.lastErrorRetryable).toBe(true);
  });

  it('keeps the reserved report id, so a retry cannot file the incident twice', () => {
    const updated = recordAttempt(draft(), { now: NOW, error: null, retryable: true });

    expect(updated.reportId).toBe('report-1');
  });

  it('does not mutate the input', () => {
    const original = draft();
    recordAttempt(original, { now: NOW, error: 'x', retryable: false });

    expect(original.attempts).toBe(0);
  });
});

describe('expiry', () => {
  it('keeps a recent draft', () => {
    expect(isExpired(draft(), NOW)).toBe(false);
  });

  it('expires one past the retention limit', () => {
    expect(isExpired(draft({ createdAt: NOW - DRAFT_MAX_AGE_MS - 1 }), NOW)).toBe(true);
  });

  it('keeps one exactly at the limit', () => {
    expect(isExpired(draft({ createdAt: NOW - DRAFT_MAX_AGE_MS }), NOW)).toBe(false);
  });

  it('does not expire a draft whose clock ran backwards', () => {
    // Deleting an unsent observation because the phone's clock is wrong would
    // be an unrecoverable loss for a recoverable problem.
    expect(isExpired(draft({ createdAt: NOW + 86_400_000 }), NOW)).toBe(false);
  });

  it('partitions, so the user can be told what was removed', () => {
    const { kept, expired } = partitionExpired(
      [draft({ id: 'fresh' }), draft({ id: 'stale', createdAt: NOW - DRAFT_MAX_AGE_MS - 1 })],
      NOW,
    );

    expect(kept.map((d) => d.id)).toEqual(['fresh']);
    expect(expired.map((d) => d.id)).toEqual(['stale']);
  });
});

describe('sortDrafts', () => {
  it('puts the oldest first, since it is closest to expiring', () => {
    const sorted = sortDrafts([
      draft({ id: 'new', createdAt: NOW }),
      draft({ id: 'old', createdAt: NOW - 100_000 }),
    ]);

    expect(sorted.map((d) => d.id)).toEqual(['old', 'new']);
  });

  it('breaks ties by id, so the order cannot vary between runs', () => {
    const sorted = sortDrafts([
      draft({ id: 'b', createdAt: NOW }),
      draft({ id: 'a', createdAt: NOW }),
    ]);

    expect(sorted.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the input', () => {
    const input = [draft({ id: 'b', createdAt: NOW }), draft({ id: 'a', createdAt: 0 })];
    sortDrafts(input);

    expect(input[0]?.id).toBe('b');
  });
});

describe('describeDraftStatus', () => {
  it('says a new draft is waiting', () => {
    expect(describeDraftStatus(draft(), context())).toMatch(/waiting to send/i);
  });

  it('says it is waiting for a connection when offline', () => {
    expect(
      describeDraftStatus(draft({ attempts: 1, lastAttemptAt: 0 }), context({ isOnline: false })),
    ).toMatch(/connection/i);
  });

  it('reports the attempt count once they are exhausted', () => {
    const text = describeDraftStatus(
      draft({ attempts: MAX_AUTOMATIC_ATTEMPTS, lastAttemptAt: 0 }),
      context(),
    );

    expect(text).toContain(String(MAX_AUTOMATIC_ATTEMPTS));
    expect(text).toMatch(/try again/i);
  });

  it('surfaces the actual error when retrying cannot fix it', () => {
    // "Something went wrong" is not actionable; the real message usually is.
    const text = describeDraftStatus(
      draft({
        attempts: 1,
        lastAttemptAt: 0,
        lastErrorRetryable: false,
        lastError: 'Photo too large.',
      }),
      context(),
    );

    expect(text).toBe('Photo too large.');
  });

  it('asks the right account to sign in', () => {
    expect(describeDraftStatus(draft({ attempts: 1 }), context({ currentUserId: null }))).toMatch(
      /sign in/i,
    );
  });

  it('never claims a draft has been submitted', () => {
    // A user who believes they reported a hazard and has not is worse off than
    // one who knows it is still waiting.
    const contexts = [context(), context({ isOnline: false }), context({ currentUserId: null })];
    const drafts = [
      draft(),
      draft({ attempts: 1, lastAttemptAt: NOW }),
      draft({ attempts: MAX_AUTOMATIC_ATTEMPTS, lastAttemptAt: 0 }),
      draft({ attempts: 1, lastErrorRetryable: false, lastError: 'Nope.' }),
    ];

    for (const ctx of contexts) {
      for (const entry of drafts) {
        expect(describeDraftStatus(entry, ctx)).not.toMatch(/\b(sent|submitted|reported)\b/i);
      }
    }
  });
});
