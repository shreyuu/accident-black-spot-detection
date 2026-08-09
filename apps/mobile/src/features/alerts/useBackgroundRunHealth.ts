import { useEffect, useState } from 'react';

import {
  summariseBackgroundRuns,
  type BackgroundRunHealth,
  type BackgroundRunSummary,
} from '@/features/alerts/backgroundRunHealth';
import { loadBackgroundRunHealth } from '@/features/alerts/backgroundRunHealthStore';
import { useNow } from '@/utils/useNow';

/**
 * The background task's run history, for display.
 *
 * Read on mount and on demand rather than subscribed to: the writer is a
 * headless task in another JS context, so there is nothing to subscribe to, and
 * the value only needs to be current while somebody is looking at it.
 *
 * The clock comes from `useNow` because both the `stale` flag and the "last ran"
 * caption are relative to the present, and reading `Date.now()` during render is
 * banned by the React Compiler rules. A minute is the coarsest interval that
 * keeps a "3 minutes ago" caption honest.
 */

const CLOCK_INTERVAL_MS = 60 * 1000;

export interface UseBackgroundRunHealthResult {
  summary: BackgroundRunSummary;
  /** False until the first read completes; the summary is empty until then. */
  loaded: boolean;
}

/**
 * Read once on mount. There is deliberately no `refresh`: the record is written
 * by a headless task in another JS context, so a re-read while the screen is
 * open would only ever return the same value — the writer cannot have run
 * without the OS having woken the app. Remounting the screen is the refresh.
 */
export function useBackgroundRunHealth(): UseBackgroundRunHealthResult {
  const now = useNow(CLOCK_INTERVAL_MS);
  const [health, setHealth] = useState<BackgroundRunHealth | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Guards a read still in flight when the screen unmounts: setting state
    // then is a leak warning, and it resurrects a value nobody is looking at.
    let active = true;

    void loadBackgroundRunHealth().then((next) => {
      if (active) {
        setHealth(next);
        setLoaded(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  // Derived during render rather than held in state: `now` changes on a timer
  // and the summary is a pure function of it, so a stored copy would be exactly
  // the "setState in an effect for derived state" the lint rules reject.
  return { summary: summariseBackgroundRuns(health, now), loaded };
}
