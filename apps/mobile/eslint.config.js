// ESLint flat config. `eslint-config-expo` bundles the React, React Hooks,
// React Native and import rules that match this Expo SDK.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'web-build/**',
      'coverage/**',
      'ios/**',
      'android/**',
      'expo-env.d.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // `any` defeats the point of strict mode. Allowed only with an explicit
      // eslint-disable plus a comment explaining why (working rule 6).
      '@typescript-eslint/no-explicit-any': 'error',

      // Unused code is dead weight; `_`-prefixed args are the escape hatch.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // console.* is not a logging strategy. Use src/utils/logger.ts, which can
      // be routed to a crash reporter later without touching call sites.
      'no-console': 'error',

      // Prefer explicit imports over deep relative paths.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../*'],
              message: "Use the '@/' absolute import alias instead of deep relative paths.",
            },
          ],
        },
      ],
    },
  },
  {
    // The logger is the one place allowed to touch console.
    files: ['src/utils/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Config files run on the build machine, not the device.
    files: ['*.config.js', '*.config.ts', 'jest.setup.ts'],
    rules: { 'no-console': 'off' },
  },
];
