import { ALERT_RADIUS_BOUNDS_M } from '@/config/env';
import {
  ALERT_RADIUS_STEPS_M,
  DEFAULT_PREFERENCES,
  applyPreferenceChange,
  clampAlertRadius,
  describeAlertRadius,
  normalisePreferences,
  preferencesEqual,
  preferencesFromProfile,
  type AppPreferences,
} from '@/features/settings/preferences';
import type { UserProfile } from '@/types/domain';

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.test',
    role: 'user',
    alertRadiusM: 800,
    alertsEnabled: true,
    backgroundMonitoringEnabled: false,
    hapticsEnabled: true,
    soundEnabled: true,
    darkModePreference: 'dark',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('defaults', () => {
  it('warns by default, because that is what the app is for', () => {
    expect(DEFAULT_PREFERENCES.alertsEnabled).toBe(true);
    expect(DEFAULT_PREFERENCES.soundEnabled).toBe(true);
    expect(DEFAULT_PREFERENCES.hapticsEnabled).toBe(true);
  });

  it('leaves background monitoring off, since it costs battery and a permission', () => {
    expect(DEFAULT_PREFERENCES.backgroundMonitoringEnabled).toBe(false);
  });

  it('uses the configured default radius', () => {
    expect(DEFAULT_PREFERENCES.alertRadiusM).toBe(ALERT_RADIUS_BOUNDS_M.default);
  });
});

describe('ALERT_RADIUS_STEPS_M', () => {
  it('stays inside the validated range, so no step can be rejected', () => {
    for (const step of ALERT_RADIUS_STEPS_M) {
      expect(step).toBeGreaterThanOrEqual(ALERT_RADIUS_BOUNDS_M.min);
      expect(step).toBeLessThanOrEqual(ALERT_RADIUS_BOUNDS_M.max);
    }
  });

  it('spans the full range', () => {
    expect(Math.min(...ALERT_RADIUS_STEPS_M)).toBe(ALERT_RADIUS_BOUNDS_M.min);
    expect(Math.max(...ALERT_RADIUS_STEPS_M)).toBe(ALERT_RADIUS_BOUNDS_M.max);
  });

  it('is ascending and free of duplicates', () => {
    expect([...ALERT_RADIUS_STEPS_M].sort((a, b) => a - b)).toEqual([...ALERT_RADIUS_STEPS_M]);
    expect(new Set(ALERT_RADIUS_STEPS_M).size).toBe(ALERT_RADIUS_STEPS_M.length);
  });

  it('includes the default, so the initial state is a selectable step', () => {
    expect(ALERT_RADIUS_STEPS_M).toContain(ALERT_RADIUS_BOUNDS_M.default);
  });
});

describe('clampAlertRadius', () => {
  it('leaves a valid value alone', () => {
    expect(clampAlertRadius(750)).toBe(750);
  });

  it('clamps rather than resetting, so the user keeps their intent', () => {
    // A stored 3000 became invalid because the bounds changed, not because the
    // user wanted the default.
    expect(clampAlertRadius(3000)).toBe(ALERT_RADIUS_BOUNDS_M.max);
    expect(clampAlertRadius(10)).toBe(ALERT_RADIUS_BOUNDS_M.min);
  });

  it('rounds a fractional value', () => {
    expect(clampAlertRadius(499.6)).toBe(500);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'falls back to the default for %p',
    (value) => {
      expect(clampAlertRadius(value)).toBe(DEFAULT_PREFERENCES.alertRadiusM);
    },
  );
});

describe('normalisePreferences', () => {
  it('round-trips a valid record', () => {
    const preferences: AppPreferences = {
      alertRadiusM: 500,
      alertsEnabled: false,
      soundEnabled: false,
      hapticsEnabled: true,
      backgroundMonitoringEnabled: true,
      darkModePreference: 'light',
    };

    expect(normalisePreferences(preferences)).toEqual(preferences);
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['a number', 42],
  ])('falls back entirely for %s', (_label, raw) => {
    expect(normalisePreferences(raw)).toEqual(DEFAULT_PREFERENCES);
  });

  it('repairs one bad field without discarding the rest', () => {
    // A corrupt radius must not cost the user their haptics setting.
    const restored = normalisePreferences({
      alertRadiusM: 'far',
      alertsEnabled: false,
      hapticsEnabled: false,
      darkModePreference: 'dark',
    });

    expect(restored.alertRadiusM).toBe(DEFAULT_PREFERENCES.alertRadiusM);
    expect(restored.alertsEnabled).toBe(false);
    expect(restored.hapticsEnabled).toBe(false);
    expect(restored.darkModePreference).toBe('dark');
  });

  it.each(['true', 1, 0, null])('refuses to coerce %p into a boolean', (value) => {
    // A truthy string is the classic way a preference silently inverts itself
    // after a serialisation change.
    expect(normalisePreferences({ alertsEnabled: value }).alertsEnabled).toBe(
      DEFAULT_PREFERENCES.alertsEnabled,
    );
  });

  it('rejects an unknown theme preference', () => {
    expect(normalisePreferences({ darkModePreference: 'sepia' }).darkModePreference).toBe('system');
  });

  it('clamps a stored radius that is out of range', () => {
    expect(normalisePreferences({ alertRadiusM: 99_999 }).alertRadiusM).toBe(
      ALERT_RADIUS_BOUNDS_M.max,
    );
  });
});

describe('preferencesFromProfile', () => {
  it('reads every preference off the profile', () => {
    expect(preferencesFromProfile(profile())).toEqual({
      alertRadiusM: 800,
      alertsEnabled: true,
      soundEnabled: true,
      hapticsEnabled: true,
      backgroundMonitoringEnabled: false,
      darkModePreference: 'dark',
    });
  });

  it('normalises a profile carrying an out-of-range radius', () => {
    expect(preferencesFromProfile(profile({ alertRadiusM: 5000 })).alertRadiusM).toBe(
      ALERT_RADIUS_BOUNDS_M.max,
    );
  });
});

describe('applyPreferenceChange', () => {
  it('applies a single field', () => {
    const next = applyPreferenceChange(DEFAULT_PREFERENCES, { alertRadiusM: 250 });

    expect(next.alertRadiusM).toBe(250);
    expect(next.alertsEnabled).toBe(DEFAULT_PREFERENCES.alertsEnabled);
  });

  it('normalises the result, so no caller can build an invalid state', () => {
    expect(applyPreferenceChange(DEFAULT_PREFERENCES, { alertRadiusM: 99_999 }).alertRadiusM).toBe(
      ALERT_RADIUS_BOUNDS_M.max,
    );
  });

  it('does not mutate the input', () => {
    const original = { ...DEFAULT_PREFERENCES };
    applyPreferenceChange(original, { alertsEnabled: false });

    expect(original).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('preferencesEqual', () => {
  it('is true for identical preferences', () => {
    expect(preferencesEqual(DEFAULT_PREFERENCES, { ...DEFAULT_PREFERENCES })).toBe(true);
  });

  it.each([
    ['alertRadiusM', { alertRadiusM: 250 }],
    ['alertsEnabled', { alertsEnabled: false }],
    ['soundEnabled', { soundEnabled: false }],
    ['hapticsEnabled', { hapticsEnabled: false }],
    ['backgroundMonitoringEnabled', { backgroundMonitoringEnabled: true }],
    ['darkModePreference', { darkModePreference: 'dark' as const }],
  ])('detects a change to %s', (_label, change) => {
    expect(preferencesEqual(DEFAULT_PREFERENCES, { ...DEFAULT_PREFERENCES, ...change })).toBe(
      false,
    );
  });
});

describe('describeAlertRadius', () => {
  it('describes every step without repeating itself for very different distances', () => {
    expect(describeAlertRadius(100)).not.toBe(describeAlertRadius(2000));
  });

  it('warns that a short radius leaves little reaction time', () => {
    expect(describeAlertRadius(100)).toMatch(/little time to react/i);
  });

  it('warns that a long radius means frequent alerts', () => {
    expect(describeAlertRadius(2000)).toMatch(/frequent/i);
  });

  it('returns a description for every selectable step', () => {
    for (const step of ALERT_RADIUS_STEPS_M) {
      expect(describeAlertRadius(step).length).toBeGreaterThan(0);
    }
  });
});
