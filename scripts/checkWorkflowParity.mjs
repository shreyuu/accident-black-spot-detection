#!/usr/bin/env node
/**
 * Fail if the CI workflow no longer runs everything `npm run verify` runs.
 *
 * Wired into `test:scripts`, which `verify` itself runs — so the check that CI
 * matches `verify` is part of `verify`, and a developer who adds a gate locally
 * is told about the workflow before pushing rather than after.
 *
 * Logic lives in `workflowParity.mjs` so it can be unit-tested without this
 * repository's real files.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { missingFromWorkflow } from './workflowParity.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_PATH = '.github/workflows/ci.yml';

function main() {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
  const verifyScript = packageJson.scripts?.verify;

  if (typeof verifyScript !== 'string') {
    throw new Error(
      'package.json has no `verify` script. It is the gate this check exists to protect; ' +
        'if it was renamed, rename it here too rather than deleting the check.',
    );
  }

  const workflowYaml = readFileSync(resolve(repoRoot, WORKFLOW_PATH), 'utf8');
  const missing = missingFromWorkflow(verifyScript, workflowYaml);

  if (missing.length > 0) {
    process.stderr.write(
      `${WORKFLOW_PATH} does not run ${missing.length} script(s) that \`npm run verify\` does:\n` +
        missing.map((name) => `  • npm run ${name}\n`).join('') +
        '\nCI would pass on a change your local gate rejects. Add a step for each, or ' +
        'remove it from `verify` if it no longer belongs there.\n',
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`${WORKFLOW_PATH} runs all ${'verify'} steps.\n`);
}

main();
