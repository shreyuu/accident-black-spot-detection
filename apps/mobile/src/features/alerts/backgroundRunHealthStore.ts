import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  parseBackgroundRunHealth,
  recordBackgroundRun,
  type BackgroundRunHealth,
  type BackgroundRunOutcome,
} from '@/features/alerts/backgroundRunHealth';
import { logger } from '@/utils/logger';

/**
 * Disk storage for the background task's run history.
 *
 * A thin wrapper, matching `zoneStateStore`: every decision about what is kept,
 * for how long, and what may be trusted lives in the pure
 * `backgroundRunHealth` module, which is where the tests are.
 *
 * AsyncStorage rather than SecureStore. The record holds outcome labels and
 * timestamps and never a coordinate or a black spot id — see the note in
 * `backgroundRunHealth` on what is deliberately excluded — so it is less
 * sensitive than the zone state that already lives here.
 *
 * **Nothing here throws.** This runs on the background task's path, where an
 * exception has nowhere to go and where failing to record that a run happened
 * must never be the reason a run fails. Losing the telemetry is a cost of
 * exactly one missing row.
 */

const STORAGE_KEY = 'alerts.backgroundRunHealth.v1';

export async function loadBackgroundRunHealth(): Promise<BackgroundRunHealth | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw === null ? null : parseBackgroundRunHealth(JSON.parse(raw));
  } catch (error) {
    logger.warn('backgroundRunHealthStore', 'Could not read the background run history', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

/**
 * Append one run to the history.
 *
 * Read-modify-write, which is safe here because the OS delivers background
 * location batches to a single JS context one at a time; there is no second
 * writer to race with.
 */
export async function noteBackgroundRun(
  outcome: BackgroundRunOutcome,
  nowMs: number = Date.now(),
): Promise<void> {
  try {
    const previous = await loadBackgroundRunHealth();
    const next = recordBackgroundRun(previous, outcome, nowMs);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    logger.warn('backgroundRunHealthStore', 'Could not record the background run', {
      error: error instanceof Error ? error.message : 'unknown',
      outcome,
    });
  }
}

/**
 * Forget everything.
 *
 * Called on sign-out alongside the zone state and the preferences snapshot. The
 * history says when this device was moving with the app installed, which is not
 * something the next account should inherit.
 */
export async function clearBackgroundRunHealth(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do if even removal fails.
  }
}
