import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * ESLint for the Cloud Functions workspace.
 *
 * Standalone rather than reusing the mobile or dashboard configs: neither
 * applies here. `eslint-config-expo` brings React Native rules for code that has
 * no React in it, and `eslint-config-next` assumes a browser. What this code
 * needs is the TypeScript rules and nothing else.
 *
 * Written as ESM, unlike the other two configs, because this package sets
 * `"type": "module"` — the Cloud Functions runtime loads the emitted `lib/` as
 * ES modules, so the source has to be ESM throughout.
 *
 * `--max-warnings=0` in the npm script applies the repository-wide standard.
 */
export default [
  { ignores: ['lib/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      // `any` defeats the point of strict mode, and this code runs with a
      // credential that bypasses every security rule.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `firebase-functions/logger` is structured and reaches Cloud Logging;
      // console.* does not carry severity or context.
      'no-console': 'error',
    },
  },
];
