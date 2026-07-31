import { ALERT_RADIUS_BOUNDS_M } from '@/config/env';
import {
  buildBackgroundAlertSnapshot,
  parseBackgroundAlertSnapshot,
  type BackgroundAlertSnapshot,
} from '@/features/alerts/backgroundAlertSnapshot';
import type { UserProfile } from '@/types/domain';

// Only the pure build/parse functions are under test here, but importing them
// pulls in the module's AsyncStorage dependency, whose native side does not
// exist under Jest.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.test',
    role: 'user',
    alertRadiusM: 800,
    alertsEnabled: true,
    backgroundMonitoringEnabled: true,
    hapticsEnabled: false,
    soundEnabled: true,
    darkModePreference: 'system',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function valid(overrides: Partial<BackgroundAlertSnapshot> = {}): BackgroundAlertSnapshot {
  return { ...buildBackgroundAlertSnapshot(profile()), ...overrides };
}

describe('buildBackgroundAlertSnapshot', () => {
  it('carries only the fields the background task needs', () => {
    expect(buildBackgroundAlertSnapshot(profile())).toEqual({
      version: 1,
      userId: 'user-1',
      backgroundMonitoringEnabled: true,
      alertsEnabled: true,
      soundEnabled: true,
      hapticsEnabled: false,
      alertRadiusM: 800,
    });
  });

  it('does not copy the name, email or role onto disk', () => {
    const keys = Object.keys(buildBackgroundAlertSnapshot(profile()));

    expect(keys).not.toEqual(expect.arrayContaining(['name', 'email', 'role']));
  });
});

describe('parseBackgroundAlertSnapshot', () => {
  it('round-trips a snapshot it wrote itself', () => {
    const snapshot = valid();

    expect(parseBackgroundAlertSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['an empty object', {}],
    ['an unknown version', valid({ version: 2 as unknown as 1 })],
    ['a blank user id', valid({ userId: '' })],
    ['a missing user id', { ...valid(), userId: undefined }],
  ])('rejects %s', (_label, raw) => {
    expect(parseBackgroundAlertSnapshot(raw)).toBeNull();
  });

  it.each([
    'backgroundMonitoringEnabled',
    'alertsEnabled',
    'soundEnabled',
    'hapticsEnabled',
  ] as const)('rejects a non-boolean %s rather than coercing it', (field) => {
    // Coercion here would be the dangerous direction: a truthy string would read
    // as "opted in" for a user who is not.
    expect(parseBackgroundAlertSnapshot({ ...valid(), [field]: 'true' })).toBeNull();
  });

  it.each([
    ['below the minimum', ALERT_RADIUS_BOUNDS_M.min - 1],
    ['above the maximum', ALERT_RADIUS_BOUNDS_M.max + 1],
    ['not a number', 'far'],
    ['NaN', Number.NaN],
  ])('rejects an alert radius that is %s', (_label, alertRadiusM) => {
    expect(parseBackgroundAlertSnapshot({ ...valid(), alertRadiusM })).toBeNull();
  });

  it.each([ALERT_RADIUS_BOUNDS_M.min, ALERT_RADIUS_BOUNDS_M.max])(
    'accepts the boundary radius %s',
    (alertRadiusM) => {
      expect(parseBackgroundAlertSnapshot({ ...valid(), alertRadiusM })?.alertRadiusM).toBe(
        alertRadiusM,
      );
    },
  );
});
