/**
 * Secret detection, as a pure function over (path, text).
 *
 * Phase 12's gate is "zero secrets in tracked files". A grep run once proves the
 * repository was clean on the afternoon somebody ran it and nothing afterwards —
 * the same objection `firebase/tests/helpers.mjs` raises about the throwaway
 * rules scripts of Phases 5 and 6. So the scan is a build gate, and the part
 * that decides what counts as a secret is pure and unit-tested rather than
 * buried in a shell pipeline.
 *
 * ## What this can and cannot catch
 *
 * It catches credentials with a recognisable shape: provider key prefixes, PEM
 * blocks, signed JWTs, and `password = "…"`-style assignments. It cannot catch a
 * secret that looks like ordinary prose, and it is not a substitute for keeping
 * credentials out of the repository in the first place. Treat a clean run as
 * "none of the known shapes are present", not as proof of safety.
 *
 * ## Why findings are allow-listed by (path, rule) and not by suppression comment
 *
 * An inline `// scanner:ignore` would let any future file silence the scanner by
 * writing a comment next to the secret. The allow-list here is a small, central,
 * reviewed list; adding to it is a visible diff in a file whose whole purpose is
 * to be looked at.
 */

/**
 * @typedef {object} SecretRule
 * @property {string} id           Stable identifier, used by the allow-list.
 * @property {string} description  What a match means, shown in the failure.
 * @property {RegExp} pattern      Must be global; matched per line.
 */

/** @type {readonly SecretRule[]} */
export const SECRET_RULES = Object.freeze([
  {
    id: 'google-api-key',
    description: 'Google API key (AIza…). Includes Maps, Places and Firebase Web keys.',
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
  },
  {
    id: 'aws-access-key-id',
    description: 'AWS access key id (AKIA…).',
    pattern: /AKIA[0-9A-Z]{16}/g,
  },
  {
    id: 'private-key-block',
    description: 'PEM private key block. Service-account and signing keys look like this.',
    pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g,
  },
  {
    id: 'signed-jwt',
    description: 'Signed JWT. Firebase ID tokens and session cookies look like this.',
    // Requires three dot-separated segments, so an unsigned header alone does
    // not match; the third segment is what makes it a usable credential.
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    id: 'github-token',
    description: 'GitHub personal access / OAuth token.',
    pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g,
  },
  {
    id: 'slack-token',
    description: 'Slack token.',
    pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  },
  {
    id: 'openai-key',
    description: 'OpenAI-style API key.',
    pattern: /\bsk-[A-Za-z0-9]{32,}/g,
  },
  {
    id: 'firebase-service-account',
    description: 'Firebase service-account JSON, identified by its type field.',
    pattern: /"type"\s*:\s*"service_account"/g,
  },
  {
    id: 'assigned-credential',
    description: 'A credential-shaped name assigned a hard-coded literal.',
    // Deliberately narrow. `process.env.X`, schema declarations and empty values
    // are excluded by requiring a quoted literal of real length on the right.
    pattern:
      /\b(?:api[_-]?key|apikey|secret|password|passwd|auth[_-]?token|access[_-]?token|credential|private[_-]?key)\b\s*[:=]\s*["'`]([^"'`\s]{12,})["'`]/gi,
  },
]);

/**
 * Values that are obviously not credentials, matched against the captured text.
 *
 * These exist because the `assigned-credential` rule is shape-based: it cannot
 * tell `password = "correct-horse-battery"` in a fixture from a real one. Rather
 * than weaken the rule, placeholder vocabulary is filtered out.
 */
const PLACEHOLDER =
  /example|placeholder|changeme|your[-_]|dummy|sample|redacted|xxxx|\.\.\.|<[^>]+>|\$\{|process\.env|demo-|test-|fake-|not-a-real/i;

/**
 * Files the scanner does not scan.
 *
 * Two kinds, for two different reasons:
 *
 *   - `package-lock.json` and `.gitignore` are machine-generated or are lists of
 *     patterns; neither can hold a credential in a form these rules would read
 *     correctly, and `sha512-…` integrity hashes look like secrets to any
 *     entropy-based check.
 *   - **The scanner's own source and tests.** This file defines what a
 *     credential looks like and the test file contains one synthetic example of
 *     every shape, by construction. A scanner that flagged its own definitions
 *     would fail on every run and would train whoever maintains it to ignore the
 *     output — which is worse than not running it. These two files are exempt
 *     from the *patterns*; they are not exempt from review, and a real key in
 *     either would be visible in a diff that anybody reading this comment is
 *     already looking at.
 */
const SKIPPED_PATHS = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)\.gitignore$/,
  /(^|\/)scripts\/secretPatterns\.mjs$/,
  /(^|\/)scripts\/__tests__\/secretPatterns\.test\.mjs$/,
];

/**
 * Findings deliberately accepted, keyed by `path::ruleId`.
 *
 * Each entry needs a reason. An entry whose match has since disappeared is
 * reported as stale by the CLI, so this list cannot quietly rot into a blanket
 * exemption for a file.
 */
export const ALLOWED_FINDINGS = Object.freeze({
  'apps/mobile/src/features/auth/__tests__/schemas.test.ts::assigned-credential':
    'Fixture passwords for the registration schema tests. They exist to be rejected or accepted by a Zod schema and authenticate nothing. Only this rule is exempted here — a real key in this file would still be caught by the provider-prefix rules.',
  'apps/admin/src/lib/__tests__/serviceAccount.test.ts::assigned-credential':
    'A fake service account for the credential-parsing tests. The field must be called private_key because that is the key the schema reads, so this rule cannot be satisfied by renaming anything. The literal is deliberately NOT a PEM block — see the comment on it — so the private-key-block rule still applies to this file and would catch a real key pasted in beside it.',
});

/** @typedef {{ path: string, line: number, ruleId: string, description: string, excerpt: string }} Finding */

/** Truncate and mask a match so the failure output does not itself leak the value. */
function excerptOf(match) {
  const head = match.slice(0, 4);
  return `${head}${'*'.repeat(Math.min(12, Math.max(0, match.length - 4)))} (${match.length} chars)`;
}

/**
 * Scan one file's text.
 *
 * @param {string} path Repository-relative path, used for skip rules and allow-listing.
 * @param {string} text
 * @returns {Finding[]}
 */
export function findSecrets(path, text) {
  if (SKIPPED_PATHS.some((skip) => skip.test(path))) {
    return [];
  }

  /** @type {Finding[]} */
  const findings = [];
  const lines = text.split('\n');

  for (const rule of SECRET_RULES) {
    for (const [index, line] of lines.entries()) {
      // `lastIndex` persists on a global regex between calls; reset per line.
      rule.pattern.lastIndex = 0;

      let match;
      while ((match = rule.pattern.exec(line)) !== null) {
        const value = match[1] ?? match[0];
        if (PLACEHOLDER.test(value)) {
          continue;
        }

        findings.push({
          path,
          line: index + 1,
          ruleId: rule.id,
          description: rule.description,
          excerpt: excerptOf(value),
        });
      }
    }
  }

  return findings;
}

/**
 * Split findings into those that fail the build and those explicitly accepted.
 *
 * @param {readonly Finding[]} findings
 * @returns {{ blocking: Finding[], allowed: Finding[], usedKeys: Set<string> }}
 */
export function partitionFindings(findings) {
  /** @type {Finding[]} */
  const blocking = [];
  /** @type {Finding[]} */
  const allowed = [];
  const usedKeys = new Set();

  for (const finding of findings) {
    const key = `${finding.path}::${finding.ruleId}`;
    if (Object.hasOwn(ALLOWED_FINDINGS, key)) {
      allowed.push(finding);
      usedKeys.add(key);
    } else {
      blocking.push(finding);
    }
  }

  return { blocking, allowed, usedKeys };
}

/**
 * Paths that must never be tracked, whatever their contents.
 *
 * `.gitignore` already excludes these, but an entry added to the index *before*
 * the ignore rule existed stays tracked for ever and no ignore rule will remove
 * it. This is the check that would have caught `apps/admin/.env.local.example`
 * being on the wrong side of `.env.*` — in the opposite direction.
 */
const FORBIDDEN_TRACKED = [
  {
    pattern: /(^|\/)\.env(\.[^/]+)?$/,
    reason: 'A real environment file. Only *.example belongs in git.',
  },
  { pattern: /serviceAccountKey\.json$/, reason: 'A Firebase Admin service-account key.' },
  { pattern: /-firebase-adminsdk-.*\.json$/, reason: 'A Firebase Admin service-account key.' },
  { pattern: /\.(jks|keystore|p8|p12|pem|mobileprovision)$/, reason: 'Signing material.' },
  { pattern: /(^|\/)google-services\.json$/, reason: 'Per-project Firebase Android config.' },
  { pattern: /(^|\/)GoogleService-Info\.plist$/, reason: 'Per-project Firebase iOS config.' },
];

/**
 * @param {readonly string[]} paths Tracked paths.
 * @returns {{ path: string, reason: string }[]}
 */
export function findForbiddenTrackedPaths(paths) {
  const violations = [];
  for (const path of paths) {
    // A `*.example` file is a template with no real values in it, and tracking
    // it is the point — `.env.example` and `apps/admin/.env.local.example` are
    // both documented setup steps. Checked before the patterns rather than
    // encoded into each one, because every rule below wants the same exemption.
    if (path.endsWith('.example')) {
      continue;
    }

    const rule = FORBIDDEN_TRACKED.find((candidate) => candidate.pattern.test(path));
    if (rule !== undefined) {
      violations.push({ path, reason: rule.reason });
    }
  }
  return violations;
}
