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
};
