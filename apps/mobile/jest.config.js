/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',

    // `@firebase/util/dist/index.esm.js` does `import ... from './postinstall.mjs'`,
    // and Jest's CommonJS runtime cannot parse a `.mjs` file even with the
    // package in the transform allowlist above.
    //
    // The pattern matches the *request string* (`./postinstall.mjs`) rather than
    // a resolved path, because that is what moduleNameMapper sees. See the stub
    // for why it reimplements the function instead of pointing at the package's
    // own CJS sibling.
    '^\\./postinstall\\.mjs$': '<rootDir>/__mocks__/firebaseUtilPostinstall.js',
  },
  // jest-expo ships a transformIgnorePatterns for the RN ecosystem; extend it
  // rather than replace it when a new untranspiled dependency is added.
  //
  // `firebase` and `@firebase` are in the list because the Firebase JS SDK
  // publishes ESM (`import` syntax) that Jest's CommonJS runtime cannot execute
  // untransformed — without this, importing anything from `firebase/*` in a test
  // fails with "Cannot use import statement outside a module".
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-worklets|firebase|@firebase/.*))',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    // Test scaffolding. Counting it would flatter the number without testing
    // anything — see src/test-utils/render.tsx.
    '!src/test-utils/**',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/', '/.expo/'],

  /**
   * Coverage floors, per path rather than one number for the repository.
   *
   * ## Why not a single global percentage
   *
   * Overall line coverage is ~48%, and that shape is deliberate: the pure
   * safety-critical cores are covered exhaustively, presentational components
   * and hooks are thin. A single global floor set at 48% would be satisfied by
   * a change that guts `proximityEngine.ts`'s tests and adds snapshot tests for
   * three buttons — the number holds while the part that decides whether a
   * driver gets a warning stops being tested. It would also fight the shape:
   * every new screen drags the average down and pressures the floor downward.
   *
   * So the floors are attached to the modules where a regression is a safety
   * regression, pinned at the level each one has actually reached. These are
   * pure functions over plain data — no clock, no network, no device — so the
   * measurement is exact and reproducible, and pinning at the current value
   * carries no flakiness risk. A drop is a real loss of coverage, not noise.
   *
   * This is the structural form of the Phase 13 lesson. That bug survived
   * eleven phases because 143 rules tests asserted only refusals; nothing
   * asserted the happy path, and nothing required that anything did.
   *
   * ## Raising these
   *
   * They are a ratchet. When a module's real coverage rises, raise its floor in
   * the same commit. Never lower one to make a change pass — that is the
   * failure this exists to catch.
   *
   * ## The `global` entry, and the trap in it
   *
   * Jest removes path-matched files from the global pool, so `global` here
   * covers *everything else*: screens, hooks, components, repositories.
   *
   * Which means **pinning a well-covered file lowers the global number**, and
   * the effect is not small. The pinned list is almost entirely 100% modules, so
   * every addition takes coverage out of the pool and drags the residual down —
   * adding `zoneStateStore` and `zoneStatePersistence` alone moved it from 41.8%
   * to 39.8% and broke a floor that had been passing. The headline figure Jest
   * prints (~48%) is the *whole* repository and is never the right number to put
   * here.
   *
   * So: when adding a path threshold, recompute this from the summary with all
   * pinned files excluded, and leave a couple of points of slack. Lowering it
   * for that reason is expected and is not the ratchet being defeated —
   * lowering it because a *file* got worse is.
   *
   * Currently 39.8% lines / 31.8% functions with the pinned files excluded.
   */
  coverageThreshold: {
    // The proximity engine decides whether a warning fires at all: hysteresis,
    // cooldown, overlap folding, risk prioritisation. Branches are 97.56% —
    // pinned just below, because the uncovered branch is a defensive default.
    './src/features/alerts/proximityEngine.ts': {
      statements: 100,
      lines: 100,
      functions: 100,
      branches: 97,
    },

    // Decides whether background monitoring may run at all, given permission
    // state and the user's opt-in.
    './src/features/alerts/backgroundMonitoringPolicy.ts': {
      statements: 100,
      lines: 100,
      functions: 100,
      branches: 100,
    },

    // Zone state on disk. `zoneStatePersistence.ts` decides what may be trusted;
    // this is the AsyncStorage wrapper around it, and the pair is what stops a
    // relaunch either repeating a warning or swallowing one. Two of its
    // behaviours look like housekeeping and are not: removing the record rather
    // than writing an empty one is a privacy decision, and never throwing is
    // what the headless background task depends on.
    './src/features/alerts/zoneStatePersistence.ts': {
      statements: 100,
      lines: 100,
      functions: 100,
      branches: 95,
    },
    './src/features/alerts/zoneStateStore.ts': {
      statements: 100,
      lines: 100,
      functions: 100,
      branches: 100,
    },

    // The background task's run record and the copy that renders it. Pinned not
    // because a bug here is unsafe — it is a diagnostic — but because this is
    // the only evidence that the background task ran at all, and telemetry
    // nobody tests is telemetry that quietly stops recording. The copy carries
    // its own constraint: it must never claim the feature is working, and never
    // diagnose a fault the app cannot confirm. Those are assertions in
    // `backgroundRunCopy.test.ts`, and the floor keeps them running.
    './src/features/alerts/backgroundRunHealth.ts': {
      statements: 100,
      lines: 100,
      functions: 100,
      branches: 100,
    },
    './src/features/alerts/backgroundRunCopy.ts': {
      statements: 100,
      lines: 100,
      functions: 100,
      branches: 100,
    },

    // The offline queue. A regression here loses a report the user believes
    // they filed.
    './src/features/reports/draftQueue.ts': {
      statements: 97,
      lines: 97,
      functions: 100,
      branches: 94,
    },

    // The shape written to Firestore, and the image handling behind it. Both
    // are validated again by the security rules, but a malformed document is
    // rejected server-side as an opaque failure the user cannot act on.
    './src/features/reports/reportDocument.ts': {
      statements: 100,
      lines: 100,
      functions: 100,
      branches: 100,
    },
    './src/features/reports/reportImages.ts': {
      statements: 98,
      lines: 98,
      functions: 100,
      branches: 93,
    },

    // The submission orchestration. The weakest of the set at 70% branches —
    // pinned where it is rather than aspirationally, so the floor stays true.
    './src/features/reports/submitIncidentReport.ts': {
      statements: 92,
      lines: 92,
      functions: 80,
      branches: 70,
    },

    // The SOS countdown and the message it sends. The countdown must be
    // cancellable; the message must carry the accuracy disclosure.
    './src/features/sos/sosCountdown.ts': {
      statements: 100,
      lines: 100,
      functions: 100,
      branches: 100,
    },
    './src/features/sos/sosMessage.ts': {
      statements: 100,
      lines: 100,
      functions: 100,
      branches: 100,
    },

    // Haversine and the geohash helpers. Everything above depends on these
    // being right.
    './src/utils/geo.ts': {
      statements: 100,
      lines: 100,
      functions: 100,
      branches: 100,
    },

    global: {
      statements: 37,
      lines: 37,
      functions: 29,
      branches: 37,
    },
  },
};
