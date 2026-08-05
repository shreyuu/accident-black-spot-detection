import { __envSchemaForTests } from '@/config/env';

/**
 * Environment validation tests.
 *
 * The schema is exercised directly rather than through `process.env`, because
 * Metro inlines those reads at build time and they cannot be varied per test.
 *
 * These matter more than they look: a bad alert radius silently breaks the core
 * safety feature, and a half-filled Firebase block fails deep inside the SDK
 * with an opaque error. Both are cheap to catch here.
 */
describe('env schema', () => {
  const validFirebase = {
    firebaseApiKey: 'api-key',
    firebaseAuthDomain: 'project.firebaseapp.com',
    firebaseProjectId: 'project',
    firebaseStorageBucket: 'project.appspot.com',
    firebaseMessagingSenderId: '1234567890',
    firebaseAppId: '1:1234567890:web:abcdef',
  };

  describe('defaults', () => {
    it('applies documented defaults when nothing is set', () => {
      const result = __envSchemaForTests.parse({});

      expect(result.appEnv).toBe('development');
      expect(result.defaultAlertRadiusM).toBe(1000);
      expect(result.useFirebaseEmulator).toBe(false);
      expect(result.firebaseEmulatorHost).toBe('localhost');
    });
  });

  describe('appEnv', () => {
    it.each(['development', 'preview', 'production'] as const)('accepts %s', (value) => {
      expect(__envSchemaForTests.parse({ appEnv: value }).appEnv).toBe(value);
    });

    it('rejects an unknown environment name', () => {
      expect(() => __envSchemaForTests.parse({ appEnv: 'staging' })).toThrow();
    });
  });

  describe('defaultAlertRadiusM', () => {
    it('coerces the numeric string that the environment always provides', () => {
      expect(__envSchemaForTests.parse({ defaultAlertRadiusM: '1500' }).defaultAlertRadiusM).toBe(
        1500,
      );
    });

    it.each([100, 1000, 2000])('accepts %d metres, inside the supported range', (value) => {
      expect(
        __envSchemaForTests.parse({ defaultAlertRadiusM: String(value) }).defaultAlertRadiusM,
      ).toBe(value);
    });

    it('rejects a radius below 100m, which triggers unreliably given GPS accuracy', () => {
      expect(() => __envSchemaForTests.parse({ defaultAlertRadiusM: '99' })).toThrow();
    });

    it('rejects a radius above 2000m, which would alert constantly in a city', () => {
      expect(() => __envSchemaForTests.parse({ defaultAlertRadiusM: '2001' })).toThrow();
    });

    it('rejects a non-numeric value', () => {
      expect(() => __envSchemaForTests.parse({ defaultAlertRadiusM: 'far' })).toThrow();
    });

    it('rejects a fractional radius', () => {
      expect(() => __envSchemaForTests.parse({ defaultAlertRadiusM: '500.5' })).toThrow();
    });
  });

  describe('Firebase configuration is all-or-nothing', () => {
    it('accepts a completely unset block, so Phase 1 runs without Firebase', () => {
      expect(() => __envSchemaForTests.parse({})).not.toThrow();
    });

    it('accepts a fully populated block', () => {
      const result = __envSchemaForTests.parse(validFirebase);
      expect(result.firebaseProjectId).toBe('project');
    });

    it('rejects a partially populated block and names what is missing', () => {
      const { firebaseAppId: _omitted, ...partial } = validFirebase;

      expect(() => __envSchemaForTests.parse(partial)).toThrow(/EXPO_PUBLIC_FIREBASE_APP_ID/);
    });

    it('treats a blank string as unset rather than as a value', () => {
      // A trailing `KEY=` in a .env file yields an empty string. Without this
      // behaviour the config would look complete while being unusable.
      expect(() => __envSchemaForTests.parse({ ...validFirebase, firebaseApiKey: '' })).toThrow();
    });
  });

  describe('useFirebaseEmulator', () => {
    it('parses the string "true" into a boolean', () => {
      expect(__envSchemaForTests.parse({ useFirebaseEmulator: 'true' }).useFirebaseEmulator).toBe(
        true,
      );
    });

    it('rejects a non-boolean flag rather than silently treating it as false', () => {
      expect(() => __envSchemaForTests.parse({ useFirebaseEmulator: 'yes' })).toThrow();
    });
  });

  describe('overpassEndpoint', () => {
    it('defaults to the public reference instance', () => {
      // The happy path first: this is the value every developer and every test
      // actually runs against, and a broken default would take the entire
      // "nearby help" screen with it.
      expect(__envSchemaForTests.parse({}).overpassEndpoint).toBe(
        'https://overpass-api.de/api/interpreter',
      );
    });

    it('accepts a self-hosted https instance', () => {
      const endpoint = 'https://overpass.example.org/api/interpreter';
      expect(__envSchemaForTests.parse({ overpassEndpoint: endpoint }).overpassEndpoint).toBe(
        endpoint,
      );
    });

    it('rejects http, which would put the user position on the wire in clear text', () => {
      expect(() =>
        __envSchemaForTests.parse({ overpassEndpoint: 'http://overpass.example.org/api' }),
      ).toThrow(/https/);
    });

    it('rejects a value that is not a URL at all', () => {
      expect(() =>
        __envSchemaForTests.parse({ overpassEndpoint: 'overpass.example.org' }),
      ).toThrow();
    });
  });
});
