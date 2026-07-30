const coreWebVitals = require('eslint-config-next/core-web-vitals');
const nextTypescript = require('eslint-config-next/typescript');

/**
 * ESLint for the admin dashboard.
 *
 * `eslint-config-next` 16 ships native flat configs, spread directly here. The
 * `FlatCompat` shim that would have been needed for the older eslintrc format
 * throws "Converting circular structure to JSON" against this version — so the
 * compat layer is deliberately absent rather than merely unused.
 *
 * `--max-warnings=0` in the npm script applies the repository-wide standard: a
 * warning fails the build here exactly as it does in the mobile app.
 */
module.exports = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...nextTypescript,
  {
    // This file must stay CommonJS: eslint-config-next publishes CJS, and the
    // admin package has no "type": "module". The rule is correct everywhere else.
    files: ['eslint.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    rules: {
      // The Admin SDK's types are loose in places; an explicit `any` still has to
      // be justified in a comment rather than waved through.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
