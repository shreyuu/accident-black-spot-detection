#!/usr/bin/env node
/**
 * Fail if generated native build output is tracked in the repository.
 *
 * Wired into `test:scripts`, which `verify` itself runs — so a stray
 * `expo prebuild` is caught before the push rather than in review, which is how
 * commit cbd8a2d's root-level Xcode project reached the default branch.
 *
 * Reads `git ls-files` rather than walking the filesystem: the question is
 * "what is *tracked*", and a working tree full of correctly-ignored build
 * output is not a problem. Logic lives in `nativeBuildOutput.mjs` so it can be
 * unit-tested without this repository's real files.
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatOffenders, offendingPaths } from './nativeBuildOutput.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @returns {string[]} Every tracked path, repository-relative.
 */
function trackedFiles() {
  // `-z` and an explicit split, because a filename may legally contain a
  // newline and `git ls-files` quotes such paths when it cannot use NUL.
  const stdout = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  return stdout.split('\0').filter((path) => path !== '');
}

function main() {
  const offenders = offendingPaths(trackedFiles());

  if (offenders.length > 0) {
    process.stderr.write(formatOffenders(offenders));
    process.exitCode = 1;
    return;
  }

  process.stdout.write('No generated native build output is tracked.\n');
}

main();
