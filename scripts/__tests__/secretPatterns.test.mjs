import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  findForbiddenTrackedPaths,
  findSecrets,
  partitionFindings,
  SECRET_RULES,
} from '../secretPatterns.mjs';

/**
 * Tests for the secret scanner.
 *
 * The literals below are deliberately synthetic — a scanner test that used a
 * real key would be the exact problem the scanner exists to prevent, and the
 * scanner would (correctly) fail the build on its own test file. Each one is
 * built so that it matches the rule's *shape* without being a usable credential.
 */

test('every rule is global, so multiple matches on one line are all reported', () => {
  for (const rule of SECRET_RULES) {
    assert.equal(rule.pattern.global, true, `${rule.id} must use the g flag`);
  }
});

test('rule ids are unique', () => {
  const ids = SECRET_RULES.map((rule) => rule.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('detects a Google API key', () => {
  const findings = findSecrets('src/config.ts', `const key = 'AIza${'B'.repeat(35)}';`);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'google-api-key');
  assert.equal(findings[0].line, 1);
});

test('detects a PEM private key block', () => {
  const findings = findSecrets('key.txt', '-----BEGIN RSA PRIVATE KEY-----\nabc\n');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'private-key-block');
});

test('detects a service-account JSON by its type field', () => {
  const findings = findSecrets('creds.json', '{ "type": "service_account", "project_id": "x" }');
  assert.equal(findings[0].ruleId, 'firebase-service-account');
});

test('detects a three-segment signed JWT but not an unsigned header alone', () => {
  const segment = 'a'.repeat(20);
  const signed = findSecrets('a.ts', `const t = "eyJhbGciOiJIUzI1NiJ9.${segment}.${segment}";`);
  assert.equal(
    signed.some((finding) => finding.ruleId === 'signed-jwt'),
    true,
  );

  const unsigned = findSecrets('a.ts', 'const header = "eyJhbGciOiJIUzI1NiJ9";');
  assert.equal(
    unsigned.some((finding) => finding.ruleId === 'signed-jwt'),
    false,
  );
});

test('reports the correct 1-indexed line number', () => {
  const findings = findSecrets('a.ts', `line one\nline two\nconst k = 'AIza${'C'.repeat(35)}';`);
  assert.equal(findings[0].line, 3);
});

test('the excerpt masks the value rather than reprinting it', () => {
  const key = `AIza${'D'.repeat(35)}`;
  const findings = findSecrets('a.ts', `const k = '${key}';`);
  assert.equal(findings[0].excerpt.includes(key), false);
  assert.match(findings[0].excerpt, /^AIza\*+ \(39 chars\)$/);
});

test('flags a credential-shaped assignment', () => {
  const findings = findSecrets('a.ts', `const password = "hunter2-hunter2-hunter2";`);
  assert.equal(findings[0].ruleId, 'assigned-credential');
});

test('does not flag placeholder or env-sourced values', () => {
  const benign = [
    'const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;',
    'EXPO_PUBLIC_FIREBASE_API_KEY=demo-api-key',
    'password: "your-password-here"',
    'const token = "<REPLACE_ME_WITH_TOKEN>";',
    'apiKey: `${config.apiKey}`',
    'secret: "example-secret-value"',
  ];

  for (const line of benign) {
    assert.deepEqual(findSecrets('a.ts', line), [], `should not flag: ${line}`);
  }
});

test('does not flag a zod schema or a type declaration', () => {
  const source = [
    'apiKey: z.string().min(1),',
    'export interface Credentials { password: string }',
    'const passwordSchema = z.string();',
  ].join('\n');

  assert.deepEqual(findSecrets('schemas.ts', source), []);
});

test('skips the scanner’s own definitions, which are credential shapes by construction', () => {
  // Otherwise the scanner fails on every run against its own fixtures, and
  // whoever maintains it learns to ignore the output.
  const line = `const password = "hunter2-hunter2-hunter2";`;

  assert.deepEqual(findSecrets('scripts/secretPatterns.mjs', line), []);
  assert.deepEqual(findSecrets('scripts/__tests__/secretPatterns.test.mjs', line), []);
  // Any other file under scripts/ is still scanned.
  assert.equal(findSecrets('scripts/scanSecrets.mjs', line).length, 1);
});

test('skips package-lock.json, whose integrity hashes are not credentials', () => {
  const line = `"integrity": "sha512-${'e'.repeat(80)}"`;
  assert.deepEqual(findSecrets('package-lock.json', line), []);
  assert.deepEqual(findSecrets('apps/mobile/package-lock.json', line), []);
});

test('partitionFindings separates allow-listed findings and records which were used', () => {
  const allowed = {
    path: 'apps/mobile/src/features/auth/__tests__/schemas.test.ts',
    line: 1,
    ruleId: 'assigned-credential',
    description: 'x',
    excerpt: 'y',
  };
  const blocking = {
    path: 'src/leak.ts',
    line: 2,
    ruleId: 'google-api-key',
    description: 'x',
    excerpt: 'y',
  };

  const result = partitionFindings([allowed, blocking]);

  assert.deepEqual(result.allowed, [allowed]);
  assert.deepEqual(result.blocking, [blocking]);
  assert.equal(result.usedKeys.has(`${allowed.path}::assigned-credential`), true);
});

test('an allow-list entry for one rule does not exempt the file from other rules', () => {
  const otherRule = {
    path: 'apps/mobile/src/features/auth/__tests__/schemas.test.ts',
    line: 9,
    ruleId: 'google-api-key',
    description: 'x',
    excerpt: 'y',
  };

  assert.deepEqual(partitionFindings([otherRule]).blocking, [otherRule]);
});

test('forbidden tracked paths catch real env files while allowing the examples', () => {
  const violations = findForbiddenTrackedPaths([
    '.env.example',
    'apps/admin/.env.local.example',
    'apps/mobile/.env',
    'apps/admin/.env.local',
    'firebase/serviceAccountKey.json',
    'android/app/release.keystore',
    'apps/mobile/google-services.json',
    'README.md',
  ]);

  assert.deepEqual(
    violations.map((violation) => violation.path),
    [
      'apps/mobile/.env',
      'apps/admin/.env.local',
      'firebase/serviceAccountKey.json',
      'android/app/release.keystore',
      'apps/mobile/google-services.json',
    ],
  );
});

// ---------------------------------------------------------------------------
// Shapes the scanner used to miss (SECURITY_AUDIT.md L11). Each literal is
// assembled from a repeated block so it matches the shape and is not a key.
// ---------------------------------------------------------------------------

function ruleIdsIn(text) {
  return findSecrets('src/config.ts', text).map((finding) => finding.ruleId);
}

test('detects an OpenAI project key, whose prefix carries a hyphen', () => {
  assert.deepEqual(ruleIdsIn(`const k = 'sk-proj-${'A1b2C3d4'.repeat(6)}';`), ['openai-key']);
});

test('detects an Anthropic key, and does not also report it as OpenAI', () => {
  assert.deepEqual(ruleIdsIn(`const k = 'sk-ant-api03-${'Q7w8E9r0'.repeat(8)}';`), [
    'anthropic-key',
  ]);
});

test('detects a GitHub fine-grained personal access token', () => {
  assert.deepEqual(ruleIdsIn(`const t = 'github_pat_${'K9m8N7b6'.repeat(10)}';`), ['github-token']);
});

test('detects a Stripe live secret key', () => {
  assert.deepEqual(ruleIdsIn(`const s = 'sk_live_${'Z1x2C3v4'.repeat(4)}';`), ['stripe-live-key']);
});

test('refuses a tracked functions/.secret.local, where real API keys live', () => {
  const violations = findForbiddenTrackedPaths(['functions/.secret.local']);
  assert.equal(violations.length, 1);
});
