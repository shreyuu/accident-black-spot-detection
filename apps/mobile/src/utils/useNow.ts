import { useEffect, useState } from 'react';

/**
 * A clock value that updates on an interval.
 *
 * Exists because reading `Date.now()` while rendering is not allowed — the
 * React Compiler lint rules reject it, and they are right to: an impure read
 * during render produces a value that changes whenever the component happens to
 * re-render, which is neither predictable nor reproducible.
 *
 * The fix is to treat the current time as what it actually is — an external
 * source that changes over time — and subscribe to it explicitly. Note this is
 * not derived state being written from an effect (also banned, and for good
 * reason); the clock is genuinely outside React, like a network response.
 *
 * Use this only where a *displayed* time must stay current. Anything that needs
 * the exact moment of an action should call `Date.now()` in the event handler,
 * where purity rules do not apply and the answer is precise.
 *
 * @param intervalMs How often to update. Pick the coarsest value that still
 * looks correct — every tick re-renders the subscriber.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
