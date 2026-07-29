/**
 * The cancellable SOS countdown.
 *
 * A pure state machine, kept out of the component for the same reason the
 * proximity engine is: this is the piece that decides whether a message is
 * composed at all, and both of its failure modes are serious. Firing when the
 * user cancelled sends an emergency alert they did not want. Failing to fire
 * when they did not cancel leaves someone waiting for help that never came.
 *
 * ## Why elapsed time, not a tick count
 *
 * The countdown is derived from the wall clock, never from "how many times has
 * `tick` been called". A JS thread busy rendering a map, or one throttled in the
 * background, delivers ticks late and irregularly — counting them would stretch
 * a three-second countdown into five and leave the user staring at a button they
 * think is broken. Passing `now` in also makes every case below testable without
 * fake timers.
 */

/**
 * How long the user has to change their mind, in milliseconds.
 *
 * Three seconds is the brief's figure and it is a deliberate compromise: long
 * enough to catch a pocket press or a misplaced thumb, short enough that someone
 * who genuinely needs help is not made to wait. It is NOT a confirmation
 * dialogue — an injured user should not have to read and tap twice.
 */
export const SOS_COUNTDOWN_MS = 3000;

export type CountdownStatus =
  /** Nothing running. */
  | 'idle'
  /** Running; the user can still cancel. */
  | 'counting'
  /** The user cancelled. Terminal — see the note on `tick`. */
  | 'cancelled'
  /** The countdown completed and the message should be composed. Terminal. */
  | 'fired';

export interface CountdownState {
  status: CountdownStatus;
  /** Epoch ms the countdown began, or `null` when it is not running. */
  startedAt: number | null;
  /** Milliseconds left. Zero in every terminal state. */
  remainingMs: number;
}

export const IDLE_COUNTDOWN: CountdownState = {
  status: 'idle',
  startedAt: null,
  remainingMs: 0,
};

export function startCountdown(now: number, durationMs: number = SOS_COUNTDOWN_MS): CountdownState {
  return {
    status: 'counting',
    startedAt: now,
    remainingMs: durationMs,
  };
}

/**
 * Advance the countdown to `now`.
 *
 * Terminal states are returned unchanged. That is the property that makes
 * cancellation safe: a timer callback already in flight when the user pressed
 * Cancel will still call `tick`, and it must not be able to resurrect a
 * cancelled countdown into a fired one. The same guard stops a second `tick`
 * from firing an already-fired countdown twice.
 */
export function tickCountdown(
  state: CountdownState,
  now: number,
  durationMs: number = SOS_COUNTDOWN_MS,
): CountdownState {
  if (state.status !== 'counting' || state.startedAt === null) {
    return state;
  }

  const elapsed = now - state.startedAt;

  // A clock that has gone backwards — an NTP correction, or a user changing the
  // device time mid-countdown — must not extend the wait indefinitely. Treating
  // it as no progress keeps `remainingMs` sane until the clock recovers.
  const safeElapsed = elapsed > 0 ? elapsed : 0;
  const remainingMs = Math.max(0, durationMs - safeElapsed);

  if (remainingMs <= 0) {
    return { status: 'fired', startedAt: state.startedAt, remainingMs: 0 };
  }

  return { status: 'counting', startedAt: state.startedAt, remainingMs };
}

/**
 * Cancel a running countdown.
 *
 * Cancelling anything that is not running is a no-op rather than an error: the
 * user may hit Cancel at the exact moment the countdown fires, and that race
 * must resolve quietly one way or the other, not throw.
 */
export function cancelCountdown(state: CountdownState): CountdownState {
  if (state.status !== 'counting') {
    return state;
  }
  return { status: 'cancelled', startedAt: state.startedAt, remainingMs: 0 };
}

/** Back to the start, ready for another attempt. */
export function resetCountdown(): CountdownState {
  return IDLE_COUNTDOWN;
}

/**
 * Whole seconds left, for the on-screen number.
 *
 * Rounded **up**, so a countdown with 2001 ms remaining shows "3" and not "2".
 * Rounding down would display 0 for the last full second and make the user
 * believe they had run out of time to cancel when they had not.
 */
export function countdownSecondsRemaining(state: CountdownState): number {
  if (state.status !== 'counting') {
    return 0;
  }
  return Math.ceil(state.remainingMs / 1000);
}

/** True while the user can still stop the message being composed. */
export function isCancellable(state: CountdownState): boolean {
  return state.status === 'counting';
}
