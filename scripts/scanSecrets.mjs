#!/usr/bin/env node
/**
 * Fail the build if a tracked file contains something credential-shaped.
 *
 * Scans **tracked files only**, which is exactly the phase gate: an untracked
 * `.env` on a developer's disk is expected and fine, and a secret is a problem
 * precisely when git is carrying it.
 *
 * Run directly, or as part of `npm run verify`. Detection lives in
 * `secretPatterns.mjs` so it can be unit-tested without a repository.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALLOWED_FINDINGS,
  findForbiddenTrackedPaths,
  findSecrets,
  partitionFindings,
} from './secretPatterns.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Everything git would carry: tracked files, plus untracked ones that are not
 * ignored.
 *
 * The second half matters more than it looks. A scan of tracked files alone is
 * always one commit behind — a new file holding a key passes every check right
 * up until the moment it is committed, at which point the secret is in history
 * and has to be treated as compromised. Including files that are *about* to be
 * tracked is what makes this a gate rather than a report.
 *
 * Ignored files are excluded, which is the point: an untracked `.env` on a
 * developer's disk is expected and fine.
 */
function scannablePaths() {
  const run = (args) =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
      .split('\0')
      .filter((path) => path.length > 0);

  const tracked = run(['ls-files', '-z']);
  const untracked = run(['ls-files', '-z', '--others', '--exclude-standard']);

  return [...new Set([...tracked, ...untracked])];
}

/**
 * Read a tracked file as text, or `null` if it is binary or unreadable.
 *
 * A NUL byte in the first block is the same heuristic `grep -I` uses. Scanning a
 * PNG for JWTs produces noise, not findings.
 */
function readTextFile(path) {
  let buffer;
  try {
    buffer = readFileSync(resolve(repoRoot, path));
  } catch {
    return null;
  }

  if (buffer.subarray(0, 8000).includes(0)) {
    return null;
  }
  return buffer.toString('utf8');
}

function main() {
  const paths = scannablePaths();

  const forbidden = findForbiddenTrackedPaths(paths);

  /** @type {import('./secretPatterns.mjs').Finding[]} */
  const findings = [];
  let scanned = 0;

  for (const path of paths) {
    const text = readTextFile(path);
    if (text === null) {
      continue;
    }
    scanned += 1;
    findings.push(...findSecrets(path, text));
  }

  const { blocking, allowed, usedKeys } = partitionFindings(findings);

  // An allow-list entry whose match has gone is reported, so the list cannot
  // accumulate exemptions for code that no longer exists.
  const stale = Object.keys(ALLOWED_FINDINGS).filter((key) => !usedKeys.has(key));

  console.log(
    `Secret scan: ${scanned} text files scanned (${paths.length} tracked or staged-to-be).`,
  );

  for (const finding of allowed) {
    console.log(`  allowed  ${finding.path}:${finding.line}  [${finding.ruleId}]`);
  }

  for (const key of stale) {
    console.warn(`  stale allow-list entry, no longer matches anything: ${key}`);
  }

  if (forbidden.length === 0 && blocking.length === 0) {
    console.log('No secrets found in tracked files.');
    // Stale entries are reported but do not fail: removing a secret should never
    // be the change that breaks the build.
    process.exit(0);
  }

  console.error('\nSecret scan FAILED.\n');

  for (const violation of forbidden) {
    console.error(`  file that must not be in git: ${violation.path}`);
    console.error(`    ${violation.reason}`);
    console.error(`    Fix: git rm --cached "${violation.path}", then rotate the credential.\n`);
  }

  for (const finding of blocking) {
    console.error(`  ${finding.path}:${finding.line}  [${finding.ruleId}]`);
    console.error(`    ${finding.description}`);
    console.error(`    match: ${finding.excerpt}\n`);
  }

  console.error(
    'If a finding is a false positive, add it to ALLOWED_FINDINGS in\n' +
      'scripts/secretPatterns.mjs with a reason. If it is real: rotate the\n' +
      'credential first — removing it from the working tree does not remove it\n' +
      'from history, and it must be assumed compromised.',
  );
  process.exit(1);
}

main();
