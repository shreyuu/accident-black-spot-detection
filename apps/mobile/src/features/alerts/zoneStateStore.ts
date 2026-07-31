import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ZoneStates } from '@/features/alerts/proximityEngine';
import { decodeZoneStates, encodeZoneStates } from '@/features/alerts/zoneStatePersistence';
import { logger } from '@/utils/logger';

/**
 * Disk storage for proximity zone state.
 *
 * A deliberately thin wrapper: every decision about what may be trusted lives in
 * the pure `zoneStatePersistence` module, which is where the tests are. This
 * file only knows about AsyncStorage.
 *
 * AsyncStorage rather than SecureStore, matching `blackSpotCache`: the record
 * holds black spot ids and timestamps, never a coordinate. Someone reading it
 * could tell that the device was near a given public hazard within the last
 * quarter of an hour, which is meaningfully less than a location history and is
 * the least that can be stored while still suppressing duplicate warnings.
 *
 * Nothing here throws. A failure to persist costs at most one repeated warning,
 * and this runs on the background task's path where an exception has nowhere to
 * go.
 */

const STORAGE_KEY = 'alerts.zoneStates.v1';

export async function loadZoneStates(now: number = Date.now()): Promise<ZoneStates> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return {};
    }
    return decodeZoneStates(JSON.parse(raw), now);
  } catch (error) {
    logger.warn('zoneStateStore', 'Could not read the saved zone state; starting fresh', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return {};
  }
}

export async function saveZoneStates(states: ZoneStates, now: number = Date.now()): Promise<void> {
  try {
    const encoded = encodeZoneStates(states, now);
    if (encoded.states.length === 0) {
      // Writing an empty record is indistinguishable from having none, and
      // removing it means a user who leaves every zone stops carrying a file
      // that says where they have been.
      await AsyncStorage.removeItem(STORAGE_KEY);
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(encoded));
  } catch (error) {
    logger.warn('zoneStateStore', 'Could not save the zone state', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Forget everything.
 *
 * Called on sign-out: the next person to use the device must not inherit a
 * record of where the previous one was.
 */
export async function clearZoneStates(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do if even removal fails.
  }
}
