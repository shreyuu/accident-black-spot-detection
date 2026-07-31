import AsyncStorage from '@react-native-async-storage/async-storage';

import { ALERT_RADIUS_BOUNDS_M } from '@/config/env';
import type { UserProfile } from '@/types/domain';
import { logger } from '@/utils/logger';

/**
 * The preferences the background task needs, mirrored to disk.
 *
 * The task runs headless: no React tree, no `AuthProvider`, no TanStack cache,
 * and no guarantee that Firebase has finished restoring the session or that the
 * device has a network at all. Reading the user's settings from Firestore at
 * that moment would either block on a request that may never resolve or fall
 * back to defaults — and "fall back to defaults" here would mean warning a user
 * who had switched warnings off.
 *
 * So the foreground writes a snapshot whenever the profile changes, and the task
 * reads that. The snapshot is the *authority* for the background path: absence
 * of a snapshot means "not opted in", never "assume the defaults".
 */

const STORAGE_KEY = 'alerts.backgroundSnapshot.v1';

export interface BackgroundAlertSnapshot {
  version: 1;
  /** Whose preferences these are. Used to attribute the alert log entry. */
  userId: string;
  backgroundMonitoringEnabled: boolean;
  alertsEnabled: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  alertRadiusM: number;
}

export function buildBackgroundAlertSnapshot(profile: UserProfile): BackgroundAlertSnapshot {
  return {
    version: 1,
    userId: profile.id,
    backgroundMonitoringEnabled: profile.backgroundMonitoringEnabled,
    alertsEnabled: profile.alertsEnabled,
    soundEnabled: profile.soundEnabled,
    hapticsEnabled: profile.hapticsEnabled,
    alertRadiusM: profile.alertRadiusM,
  };
}

/**
 * Validate a stored snapshot.
 *
 * Returns `null` for anything unrecognised. That is the safe direction: a `null`
 * snapshot stops the background task, whereas a partially-trusted one could
 * leave it running against preferences that no longer exist.
 *
 * Exported for its tests — the file it comes from is the one thing standing
 * between "the user switched this off" and a task that keeps running.
 */
export function parseBackgroundAlertSnapshot(raw: unknown): BackgroundAlertSnapshot | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (candidate.version !== 1) {
    return null;
  }

  const { userId, alertRadiusM } = candidate;
  if (typeof userId !== 'string' || userId.length === 0) {
    return null;
  }

  const booleans = [
    'backgroundMonitoringEnabled',
    'alertsEnabled',
    'soundEnabled',
    'hapticsEnabled',
  ] as const;
  for (const key of booleans) {
    if (typeof candidate[key] !== 'boolean') {
      return null;
    }
  }

  // Bounds-checked rather than merely type-checked: the radius is fed straight
  // into the proximity engine, and an out-of-range value would either alert
  // constantly or never.
  if (
    typeof alertRadiusM !== 'number' ||
    !Number.isFinite(alertRadiusM) ||
    alertRadiusM < ALERT_RADIUS_BOUNDS_M.min ||
    alertRadiusM > ALERT_RADIUS_BOUNDS_M.max
  ) {
    return null;
  }

  return {
    version: 1,
    userId,
    backgroundMonitoringEnabled: candidate.backgroundMonitoringEnabled as boolean,
    alertsEnabled: candidate.alertsEnabled as boolean,
    soundEnabled: candidate.soundEnabled as boolean,
    hapticsEnabled: candidate.hapticsEnabled as boolean,
    alertRadiusM,
  };
}

export async function saveBackgroundAlertSnapshot(
  snapshot: BackgroundAlertSnapshot,
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    logger.warn('backgroundAlertSnapshot', 'Could not save the background preferences snapshot', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

export async function loadBackgroundAlertSnapshot(): Promise<BackgroundAlertSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw === null ? null : parseBackgroundAlertSnapshot(JSON.parse(raw));
  } catch (error) {
    logger.warn('backgroundAlertSnapshot', 'Could not read the background preferences snapshot', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

/**
 * Remove the snapshot.
 *
 * Called on sign-out. Without it the background task would keep warning using
 * the previous account's settings, and keep attributing alert logs to them.
 */
export async function clearBackgroundAlertSnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do if even removal fails.
  }
}
