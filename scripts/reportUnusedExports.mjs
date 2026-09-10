#!/usr/bin/env node
/**
 * Report exported symbols nothing outside their own file imports.
 *
 * ## Why this reports and never fails
 *
 * It is **not** in `verify`, and should not be. The review that prompted it
 * found 146 such symbols across 90 files, and roughly 110 are local `Props`
 * types — `ReportListItemProps` and its siblings, declared, exported, and used
 * once in the same file's component signature. Every one of those is worth
 * tightening and none is worth blocking a push over.
 *
 * Correcting them in one pass would touch 90 files and bury a real change in
 * review, so the plan is to fix them per feature as each is touched. A gate
 * would force the opposite. This gives the number when somebody wants it:
 *
 *   npm run report:exports
 *
 * ## Reading the output
 *
 *   - **dead** — the declaration is the only occurrence anywhere. Delete it.
 *   - **over-exported** — used inside its own module, exported for nobody. Drop
 *     the `export`. Bundlers already tree-shake these, so the gain is not bytes:
 *     it is that the module boundary starts telling the truth about what is API
 *     and what is internal.
 *
 * Tests are read but never treated as declarers, so a helper only a test uses
 * counts as used rather than dead.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findUnusedExports } from './unusedExports.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Trees whose exports are judged. */
const ROOTS = [
  'apps/mobile/src',
  'apps/mobile/app',
  'apps/mobile/plugins',
  'apps/admin/src',
  'packages/shared-types/src',
  'functions/src',
];

/**
 * Trees read as consumers only.
 *
 * `shared-types` exists partly so the rules tests can import it — the package
 * has no runtime dependencies precisely so that `.mjs` under `firebase/` may.
 * Leaving those out reported constants those tests depend on as dead, which is
 * the one direction this report must not get wrong.
 */
const CONSUMER_ONLY_ROOTS = ['firebase/tests', 'firebase/seed', 'firebase/scripts', 'scripts'];

const isTest = (path) => path.includes('__tests__') || path.includes('__mocks__');

function sourceFiles(directory, pattern = /\.tsx?$/) {
  const found = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...sourceFiles(path, pattern));
    } else if (pattern.test(entry.name)) {
      found.push(path);
    }
  }

  return found;
}

function main() {
  const files = new Map();
  const judged = new Set();

  for (const root of ROOTS) {
    for (const path of sourceFiles(resolve(repoRoot, root))) {
      const key = relative(repoRoot, path);
      files.set(key, readFileSync(path, 'utf8'));
      judged.add(key);
    }
  }

  for (const root of CONSUMER_ONLY_ROOTS) {
    for (const path of sourceFiles(resolve(repoRoot, root), /\.(mjs|tsx?)$/)) {
      files.set(relative(repoRoot, path), readFileSync(path, 'utf8'));
    }
  }

  const findings = findUnusedExports(files, (path) => judged.has(path) && !isTest(path));

  if (findings.length === 0) {
    process.stdout.write(`Every export in ${ROOTS.length} source trees has a consumer.\n`);
    return;
  }

  const dead = findings.filter((finding) => finding.selfUses <= 1);
  const overExported = findings.filter((finding) => finding.selfUses > 1);

  const render = (heading, rows) => {
    if (rows.length === 0) {
      return;
    }
    process.stdout.write(`\n${heading} (${rows.length})\n`);
    for (const { file, name } of rows) {
      process.stdout.write(`  ${file} — ${name}\n`);
    }
  };

  render('dead — no occurrence anywhere but the declaration; delete', dead);
  render('over-exported — used only inside its own module; drop the export', overExported);

  process.stdout.write(
    `\n${findings.length} export(s) with no external consumer, in ` +
      `${new Set(findings.map((finding) => finding.file)).size} file(s).\n` +
      'Reporting only — this never fails a build. See the header for why.\n',
  );
}

main();
