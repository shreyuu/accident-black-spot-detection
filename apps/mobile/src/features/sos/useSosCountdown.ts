import { useCallback, useEffect, useRef, useState } from 'react';

import {
  cancelCountdown,
  countdownSecondsRemaining,
  IDLE_COUNTDOWN,
  isCancellable,
  resetCountdown,
  startCountdown,
  tickCountdown,
  type CountdownState,
} from '@/features/sos/sosCountdown';

/**
 * Drives the pure countdown from a real timer.
 *
 * All the decision logic lives in `sosCountdown`; this hook only supplies the
 * clock and turns the terminal state into a single callback. Keeping the split
 * that way is what let the cancellation races be tested properly — none of the
 * interesting cases here need a rendered component.
 */

/**
 * How often the countdown is advanced, in milliseconds.
 *
 * Frequent enough that the displayed second changes promptly, and it does not
 * matter if a tick is late: the state machine reads the wall clock, so a delayed
 * tick still lands on the correct remaining time rather than extending the wait.
 */
const TICK_INTERVAL_MS = 100;

export interface UseSosCountdownResult {
  state: CountdownState;
  secondsRemaining: number;
  cancellable: boolean;
  start: () => void;
  cancel: () => void;
  reset: () => void;
}

export function useSosCountdown(onFire: () => void): UseSosCountdownResult {
  const [state, setState] = useState<CountdownState>(IDLE_COUNTDOWN);

  // Held in a ref so a re-created callback cannot retrigger the fire effect. The
  // ref is written inside an effect, never during render — the React Compiler
  // lint rules reject the latter, and correctly so.
  const onFireRef = useRef(onFire);
  useEffect(() => {
    onFireRef.current = onFire;
  }, [onFire]);

  useEffect(() => {
    if (state.status !== 'counting') {
      return;
    }

    const interval = setInterval(() => {
      setState((current) => tickCountdown(current, Date.now()));
    }, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [state.status]);

  /**
   * Fire exactly once per countdown.
   *
   * The guard ref matters: without it a re-render while the state is still
   * `fired` would call `onFire` again, and this callback opens an SMS composer.
   * It is cleared only when a new countdown starts or the state returns to idle.
   */
  const hasFiredRef = useRef(false);
  useEffect(() => {
    if (state.status === 'fired') {
      if (!hasFiredRef.current) {
        hasFiredRef.current = true;
        onFireRef.current();
      }
      return;
    }
    hasFiredRef.current = false;
  }, [state.status]);

  const start = useCallback(() => {
    setState(startCountdown(Date.now()));
  }, []);

  const cancel = useCallback(() => {
    setState(cancelCountdown);
  }, []);

  const reset = useCallback(() => {
    setState(resetCountdown());
  }, []);

  return {
    state,
    secondsRemaining: countdownSecondsRemaining(state),
    cancellable: isCancellable(state),
    start,
    cancel,
    reset,
  };
}
