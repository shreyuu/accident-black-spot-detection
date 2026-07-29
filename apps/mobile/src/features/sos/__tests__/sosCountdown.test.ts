import {
  cancelCountdown,
  countdownSecondsRemaining,
  IDLE_COUNTDOWN,
  isCancellable,
  resetCountdown,
  SOS_COUNTDOWN_MS,
  startCountdown,
  tickCountdown,
} from '@/features/sos/sosCountdown';

/**
 * The countdown decides whether an emergency message gets composed at all.
 * Both failure directions are serious — firing after a cancel sends an alert the
 * user did not want, and failing to fire leaves someone waiting — so the races
 * around cancellation are tested explicitly rather than assumed.
 */

const T0 = 1_000_000;

describe('startCountdown', () => {
  it('begins counting with the full duration remaining', () => {
    const state = startCountdown(T0);
    expect(state.status).toBe('counting');
    expect(state.remainingMs).toBe(SOS_COUNTDOWN_MS);
    expect(state.startedAt).toBe(T0);
  });

  it('is cancellable straight away', () => {
    expect(isCancellable(startCountdown(T0))).toBe(true);
  });
});

describe('tickCountdown', () => {
  it('reduces the remaining time by the elapsed wall-clock time', () => {
    const state = tickCountdown(startCountdown(T0), T0 + 1000);
    expect(state.status).toBe('counting');
    expect(state.remainingMs).toBe(SOS_COUNTDOWN_MS - 1000);
  });

  it('fires once the duration has elapsed', () => {
    const state = tickCountdown(startCountdown(T0), T0 + SOS_COUNTDOWN_MS);
    expect(state.status).toBe('fired');
    expect(state.remainingMs).toBe(0);
  });

  it('fires when a late tick overshoots the duration', () => {
    // A busy JS thread delivers ticks late. The countdown must still complete,
    // and must not report a negative remaining time.
    const state = tickCountdown(startCountdown(T0), T0 + SOS_COUNTDOWN_MS * 10);
    expect(state.status).toBe('fired');
    expect(state.remainingMs).toBe(0);
  });

  it('derives progress from elapsed time, not from the number of ticks', () => {
    // Many rapid ticks must not shorten the countdown...
    let state = startCountdown(T0);
    for (let i = 0; i < 50; i += 1) {
      state = tickCountdown(state, T0 + 10);
    }
    expect(state.status).toBe('counting');
    expect(state.remainingMs).toBe(SOS_COUNTDOWN_MS - 10);

    // ...and a single late tick must not lengthen it.
    expect(tickCountdown(state, T0 + SOS_COUNTDOWN_MS).status).toBe('fired');
  });

  it('treats a clock that jumped backwards as no progress', () => {
    // An NTP correction or a user changing the device time mid-countdown must
    // not leave remainingMs above the duration or stall the countdown forever.
    const state = tickCountdown(startCountdown(T0), T0 - 5000);
    expect(state.status).toBe('counting');
    expect(state.remainingMs).toBe(SOS_COUNTDOWN_MS);
  });

  it('leaves an idle state alone', () => {
    expect(tickCountdown(IDLE_COUNTDOWN, T0 + 10_000)).toBe(IDLE_COUNTDOWN);
  });
});

describe('cancellation', () => {
  it('stops a running countdown', () => {
    const state = cancelCountdown(startCountdown(T0));
    expect(state.status).toBe('cancelled');
    expect(state.remainingMs).toBe(0);
  });

  it('is no longer cancellable once cancelled', () => {
    expect(isCancellable(cancelCountdown(startCountdown(T0)))).toBe(false);
  });

  /**
   * The important one. A timer callback already scheduled when the user pressed
   * Cancel will still arrive; it must not resurrect the countdown.
   */
  it('a tick arriving after a cancel can never fire', () => {
    const cancelled = cancelCountdown(startCountdown(T0));
    const afterLateTick = tickCountdown(cancelled, T0 + SOS_COUNTDOWN_MS * 5);
    expect(afterLateTick.status).toBe('cancelled');
  });

  it('cancelling an already-fired countdown does not un-fire it', () => {
    const fired = tickCountdown(startCountdown(T0), T0 + SOS_COUNTDOWN_MS);
    expect(cancelCountdown(fired).status).toBe('fired');
  });

  it('cancelling twice is a no-op rather than an error', () => {
    const once = cancelCountdown(startCountdown(T0));
    expect(cancelCountdown(once)).toBe(once);
  });

  it('cancelling an idle countdown is a no-op', () => {
    expect(cancelCountdown(IDLE_COUNTDOWN)).toBe(IDLE_COUNTDOWN);
  });
});

describe('countdownSecondsRemaining', () => {
  it('rounds up, so the last second is never displayed as zero', () => {
    // Rounding down would show "0" for a whole second while cancelling still
    // worked, making the user believe they had run out of time.
    const state = tickCountdown(startCountdown(T0), T0 + 2999);
    expect(state.status).toBe('counting');
    expect(countdownSecondsRemaining(state)).toBe(1);
  });

  it('counts down through whole seconds', () => {
    const started = startCountdown(T0);
    expect(countdownSecondsRemaining(started)).toBe(3);
    expect(countdownSecondsRemaining(tickCountdown(started, T0 + 1000))).toBe(2);
    expect(countdownSecondsRemaining(tickCountdown(started, T0 + 2000))).toBe(1);
  });

  it('reports zero in every terminal state', () => {
    expect(countdownSecondsRemaining(IDLE_COUNTDOWN)).toBe(0);
    expect(countdownSecondsRemaining(cancelCountdown(startCountdown(T0)))).toBe(0);
    expect(countdownSecondsRemaining(tickCountdown(startCountdown(T0), T0 + 9999))).toBe(0);
  });
});

describe('resetCountdown', () => {
  it('returns to idle so another attempt can start', () => {
    expect(resetCountdown()).toEqual(IDLE_COUNTDOWN);
    expect(startCountdown(T0 + 1).status).toBe('counting');
  });
});
