import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_PREFERENCES,
  normalisePreferences,
  type AppPreferences,
} from '@/features/settings/preferences';
import { logger } from '@/utils/logger';

/**
 * Local mirror of the user's preferences.
 *
 * AsyncStorage rather than SecureStore: none of this is a secret. An alert
 * radius and a haptics toggle are configuration, and putting them behind the
 * Keychain would cost a native round trip on every launch for no benefit.
 *
 * Every decision about what a stored value may become lives in the pure
 * `preferences` module. This file only knows how to read and write bytes, and
 * never throws — a preferences read happens on the launch path, where an
 * exception would take the app down before the first frame.
 */

const STORAGE_KEY = 'settings.preferences.v1';

export async function loadPreferences(): Promise<AppPreferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { ...DEFAULT_PREFERENCES };
    }
    return normalisePreferences(JSON.parse(raw));
  } catch (error) {
    logger.warn('preferenceStore', 'Could not read preferences; using defaults', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function savePreferences(preferences: AppPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    // Not surfaced. The change has already been applied in memory and written
    // to Firestore; failing to mirror it costs the user their setting only if
    // they go offline before the next successful sync.
    logger.warn('preferenceStore', 'Could not save preferences', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Forget the local mirror.
 *
 * Called on sign-out. Without it, the next person to use the device inherits
 * the previous user's alert radius and theme — and, more to the point, the app
 * would apply them before their own profile loaded.
 */
export async function clearPreferences(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do if even removal fails.
  }
}
