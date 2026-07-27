import { serverTimestamp } from 'firebase/firestore';

import {
  buildDefaultProfileFields,
  userProfileConverter,
} from '@/services/firebase/userProfileRepository';

/**
 * Converter tests.
 *
 * `toFirestore` decides the exact shape that reaches Firestore, which is then
 * judged by firestore.rules. A mismatch between the two shows up only as an
 * opaque PERMISSION_DENIED at runtime, so the contract is pinned here.
 */
describe('userProfileConverter.toFirestore', () => {
  const profile = {
    id: 'uid-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    role: 'user' as const,
    alertRadiusM: 1000,
    alertsEnabled: true,
    backgroundMonitoringEnabled: false,
    hapticsEnabled: true,
    soundEnabled: true,
    darkModePreference: 'system' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  /**
   * Regression test.
   *
   * An earlier converter destructured `createdAt`/`updatedAt` away before
   * writing. The stored document then lacked both fields, so the
   * `hasAll([... 'createdAt', 'updatedAt'])` check in firestore.rules rejected
   * every registration with PERMISSION_DENIED — with no clue as to which
   * condition had failed.
   */
  it('preserves the serverTimestamp sentinels required by firestore.rules', () => {
    const written = userProfileConverter.toFirestore(profile);

    expect(written).toHaveProperty('createdAt');
    expect(written).toHaveProperty('updatedAt');
    expect(written.createdAt).toBeDefined();
    expect(written.updatedAt).toBeDefined();
  });

  /**
   * `isValidProfileShape` in firestore.rules calls `hasAll` with exactly this
   * list. If a field is added to the model without updating the rules, or vice
   * versa, writes start failing — so the two are pinned against each other here.
   */
  it('writes every field the security rules require', () => {
    const written = userProfileConverter.toFirestore(profile);

    const requiredByRules = [
      'id',
      'name',
      'email',
      'role',
      'alertRadiusM',
      'alertsEnabled',
      'backgroundMonitoringEnabled',
      'hapticsEnabled',
      'soundEnabled',
      'darkModePreference',
      'createdAt',
      'updatedAt',
    ];

    for (const field of requiredByRules) {
      expect(Object.keys(written)).toContain(field);
    }
  });

  it('does not invent fields the rules do not expect', () => {
    const written = userProfileConverter.toFirestore(profile);
    expect(Object.keys(written).sort()).toEqual(Object.keys(profile).sort());
  });

  it('carries an optional phone number through when present', () => {
    const written = userProfileConverter.toFirestore({ ...profile, phone: '+447700900123' });
    expect(written.phone).toBe('+447700900123');
  });
});

describe('buildDefaultProfileFields', () => {
  /**
   * Firestore rules pin `role` to "user" on create. If this default ever changed,
   * registration would break — and if the rules were relaxed instead, a client
   * could grant itself admin.
   */
  it('always assigns the plain user role', () => {
    expect(buildDefaultProfileFields().role).toBe('user');
  });

  /**
   * Background location tracking must be opt-in. Defaulting it on would start
   * collecting location without the user ever agreeing to it.
   */
  it('leaves background monitoring disabled', () => {
    expect(buildDefaultProfileFields().backgroundMonitoringEnabled).toBe(false);
  });

  it('produces an alert radius within the range the rules accept', () => {
    const { alertRadiusM } = buildDefaultProfileFields();

    expect(Number.isInteger(alertRadiusM)).toBe(true);
    expect(alertRadiusM).toBeGreaterThanOrEqual(100);
    expect(alertRadiusM).toBeLessThanOrEqual(2000);
  });

  it('enables alerts, haptics and sound by default', () => {
    const defaults = buildDefaultProfileFields();

    expect(defaults.alertsEnabled).toBe(true);
    expect(defaults.hapticsEnabled).toBe(true);
    expect(defaults.soundEnabled).toBe(true);
  });
});
