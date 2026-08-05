import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { missingFromWorkflow, referencedScripts, workflowScripts } from '../workflowParity.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('referencedScripts', () => {
  it('reads an && chain in order', () => {
    assert.deepEqual(referencedScripts('npm run a && npm run b && npm run c'), ['a', 'b', 'c']);
  });

  it('keeps colons and dashes, which real script names use', () => {
    assert.deepEqual(referencedScripts('npm run format:check && npm run test:rules-only'), [
      'format:check',
      'test:rules-only',
    ]);
  });

  it('ignores arguments after the script name', () => {
    assert.deepEqual(
      referencedScripts('npm run test --workspace pkg && npm run seed -- 51.5 -0.1'),
      ['test', 'seed'],
    );
  });

  it('deduplicates', () => {
    assert.deepEqual(referencedScripts('npm run lint && npm run lint'), ['lint']);
  });

  it('does not mistake a flag for a script name', () => {
    assert.deepEqual(referencedScripts('npm run --silent'), []);
  });

  it('returns nothing for a script that calls no others', () => {
    assert.deepEqual(referencedScripts('tsc --noEmit'), []);
  });
});

describe('workflowScripts', () => {
  it('finds scripts in run steps', () => {
    const yaml = ['      - name: Lint', '        run: npm run lint'].join('\n');
    assert.deepEqual(workflowScripts(yaml), ['lint']);
  });

  it('ignores scripts named only in a comment', () => {
    // The whole reason the workflow is filtered rather than matched raw: its
    // comments discuss `verify` and `test:rules` at length, and counting those
    // would make the parity check pass on a workflow that runs nothing.
    const yaml = [
      '      # This job replaces npm run typecheck one day',
      '      - name: Lint',
      '        run: npm run lint',
    ].join('\n');
    assert.deepEqual(workflowScripts(yaml), ['lint']);
  });

  it('does not treat a trailing # inside a command as a comment', () => {
    const yaml = '        run: npm run test # keep this';
    assert.deepEqual(workflowScripts(yaml), ['test']);
  });
});

describe('missingFromWorkflow', () => {
  it('reports nothing when the workflow is a superset', () => {
    const verify = 'npm run lint && npm run test';
    const yaml = [
      '        run: npm run lint',
      '        run: npm run test',
      '        run: npm run extra',
    ].join('\n');
    assert.deepEqual(missingFromWorkflow(verify, yaml), []);
  });

  it('reports the gap when a step is missing', () => {
    const verify = 'npm run lint && npm run typecheck && npm run test';
    const yaml = ['        run: npm run lint', '        run: npm run test'].join('\n');
    assert.deepEqual(missingFromWorkflow(verify, yaml), ['typecheck']);
  });
});

describe('this repository', () => {
  // The happy-path assertion. Phase 13's lesson: a suite that only checks the
  // refusals passes even when the thing it guards is entirely broken.
  it('has a CI workflow that runs every step of npm run verify', () => {
    const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    const workflow = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');

    const verify = packageJson.scripts.verify;
    assert.equal(typeof verify, 'string', 'package.json must still have a `verify` script');
    assert.ok(referencedScripts(verify).length > 0, '`verify` must delegate to named scripts');

    assert.deepEqual(missingFromWorkflow(verify, workflow), []);
  });
});
