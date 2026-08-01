import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { logger } from '@/utils/logger';

/**
 * Whether the user has asked the system to reduce motion.
 *
 * People turn this on because animation makes them ill — vestibular disorders
 * make sliding and scaling movement genuinely nauseating — so ignoring it is
 * not a polish issue. This app's animations are on the SOS countdown and the
 * proximity banner, which is to say they appear at exactly the moments a user
 * is least able to cope with being made dizzy.
 *
 * The setting is read once and then subscribed to, because it can be changed
 * from Control Centre without the app restarting.
 *
 * Defaults to `false` — animation on — if the platform cannot answer. That is
 * the right way round: guessing "reduce motion" for someone who did not ask
 * makes the app feel broken, whereas the reverse is a preference that is
 * momentarily unmet and corrects itself as soon as the query resolves.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const enabled = await AccessibilityInfo.isReduceMotionEnabled();
        if (!cancelled) {
          setReduced(enabled);
        }
      } catch (error) {
        // Not every platform implements it. Not worth surfacing.
        logger.debug('useReducedMotion', 'Could not read the reduce-motion setting', {
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    })();

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduced(enabled);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}
