import { ALERT_RADIUS_BOUNDS_M } from '@/config/env';
import type { ThemePreference } from '@/theme';
import { THEME_PREFERENCES, type UserProfile } from '@/types/domain';

/**
 * The user's settings, and the rules for reading them back safely.
 *
 * Pure — no storage, no Firestore, no React — for the same reason
 * `proximityEngine` is: these values decide whether someone is warned, how far
 * ahead, and whether the phone makes a sound. A preference that silently
 * degrades is a warning that silently stops.
 *
 * ## Why preferences are held locally at all
 *
 * The profile document is the record of truth, but it is not reachable when the
 * user has no signal — and Phase 4 established that Firestore's own cache is no
 * help here, because `getDocs` resolves from an empty local cache rather than
 * failing. Without a local mirror, a user who set their alert radius to 400 m
 * and then went offline would silently be warned at 1000 m again. So the mirror
 * is the fast path and the offline path; Firestore remains authoritative
 * whenever it answers.
 */

export interface AppPreferences {
  /** Warning distance in metres. Bounded by ALERT_RADIUS_BOUNDS_M. */
  alertRadiusM: number;
  alertsEnabled: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  backgroundMonitoringEnabled: boolean;
  darkModePreference: ThemePreference;
}

/**
 * What a user gets before they have chosen anything.
 *
 * Alerts, sound and haptics are on: someone who installed a road-safety app has
 * asked to be warned, and defaulting those off would make the app silently do
 * nothing. Background monitoring is the exception and is off — it costs battery
 * and needs a permission the user has not been asked for yet.
 */
export const DEFAULT_PREFERENCES: AppPreferences = {
  alertRadiusM: ALERT_RADIUS_BOUNDS_M.default,
  alertsEnabled: true,
  soundEnabled: true,
  hapticsEnabled: true,
  backgroundMonitoringEnabled: false,
  darkModePreference: 'system',
};

/**
 * Selectable alert distances, in metres.
 *
 * Discrete steps rather than a free slider. A slider invites 100 m of precision
 * that means nothing against GPS error, and the steps below are the distances
 * that actually differ in use: roughly a junction, a street, a few streets, a
 * neighbourhood. They span exactly the validated range, so no step can be
 * rejected by the repository or the rules.
 */
export const ALERT_RADIUS_STEPS_M: readonly number[] = [100, 250, 500, 1000, 1500, 2000];

/** Short description of what a distance means in practice. */
export function describeAlertRadius(metres: number): string {
  if (metres <= 150) {
    return 'Warns very close to a hazard. Little time to react at speed.';
  }
  if (metres <= 500) {
    return 'Warns about a street away.';
  }
  if (metres <= 1000) {
    return 'Balanced. Enough warning at road speeds without constant alerts.';
  }
  return 'Warns early. In a busy area this can mean frequent alerts.';
}

/**
 * Bring a radius inside the permitted range.
 *
 * Clamps rather than resetting to the default. A stored 3000 became invalid
 * because the bounds changed, not because the user wanted 1000 — clamping to
 * 2000 keeps their intent, and resetting would silently widen or narrow their
 * warnings with no indication anything happened.
 */
export function clampAlertRadius(metres: number): number {
  if (!Number.isFinite(metres)) {
    return DEFAULT_PREFERENCES.alertRadiusM;
  }
  return Math.min(
    Math.max(Math.round(metres), ALERT_RADIUS_BOUNDS_M.min),
    ALERT_RADIUS_BOUNDS_M.max,
  );
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  // Strictly boolean. A truthy string like "false" is the classic way a
  // preference inverts itself after a serialisation change.
  return typeof value === 'boolean' ? value : fallback;
}

function readThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : DEFAULT_PREFERENCES.darkModePreference;
}

/**
 * Rebuild preferences from anything — a stored blob, a partial object, junk.
 *
 * Field by field, because the failure modes are per field: a corrupt radius
 * should not cost the user their haptics setting, and discarding the whole
 * record on one bad value would reset everything they had chosen.
 */
export function normalisePreferences(raw: unknown): AppPreferences {
  if (typeof raw !== 'object' || raw === null) {
    return { ...DEFAULT_PREFERENCES };
  }

  const candidate = raw as Record<string, unknown>;

  return {
    alertRadiusM:
      typeof candidate.alertRadiusM === 'number'
        ? clampAlertRadius(candidate.alertRadiusM)
        : DEFAULT_PREFERENCES.alertRadiusM,
    alertsEnabled: readBoolean(candidate.alertsEnabled, DEFAULT_PREFERENCES.alertsEnabled),
    soundEnabled: readBoolean(candidate.soundEnabled, DEFAULT_PREFERENCES.soundEnabled),
    hapticsEnabled: readBoolean(candidate.hapticsEnabled, DEFAULT_PREFERENCES.hapticsEnabled),
    backgroundMonitoringEnabled: readBoolean(
      candidate.backgroundMonitoringEnabled,
      DEFAULT_PREFERENCES.backgroundMonitoringEnabled,
    ),
    darkModePreference: readThemePreference(candidate.darkModePreference),
  };
}

/** Extract preferences from a loaded profile. */
export function preferencesFromProfile(profile: UserProfile): AppPreferences {
  return normalisePreferences({
    alertRadiusM: profile.alertRadiusM,
    alertsEnabled: profile.alertsEnabled,
    soundEnabled: profile.soundEnabled,
    hapticsEnabled: profile.hapticsEnabled,
    backgroundMonitoringEnabled: profile.backgroundMonitoringEnabled,
    darkModePreference: profile.darkModePreference,
  });
}

/**
 * Apply a change on top of the current preferences.
 *
 * Returns a normalised whole rather than a patch, so a caller cannot construct
 * a state that never passed validation.
 */
export function applyPreferenceChange(
  current: AppPreferences,
  change: Partial<AppPreferences>,
): AppPreferences {
  return normalisePreferences({ ...current, ...change });
}

/** True when two preference sets would produce identical behaviour. */
export function preferencesEqual(a: AppPreferences, b: AppPreferences): boolean {
  return (
    a.alertRadiusM === b.alertRadiusM &&
    a.alertsEnabled === b.alertsEnabled &&
    a.soundEnabled === b.soundEnabled &&
    a.hapticsEnabled === b.hapticsEnabled &&
    a.backgroundMonitoringEnabled === b.backgroundMonitoringEnabled &&
    a.darkModePreference === b.darkModePreference
  );
}
