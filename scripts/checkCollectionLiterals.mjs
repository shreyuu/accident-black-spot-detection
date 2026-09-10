#!/usr/bin/env node
/**
 * Fail if the mobile app names a Firestore collection as a string literal.
 *
 * Wired into `test:scripts`, which `verify` runs — so the rule is enforced
 * before a push rather than discovered as a PERMISSION_DENIED on a device.
 *
 * Scope is deliberately `apps/mobile/src` only. `apps/admin` and `functions`
 * already import `COLLECTIONS`, and both bypass the security rules through the
 * Admin SDK, so a stale path there fails loudly at the call site. Mobile is the
 * one place where the same mistake fails silently and only in production.
 *
 * Test files are excluded: a fixture asserting on the literal `'blackSpots'` is
 * checking the wire format, which is exactly what should be spelled out rather
 * than derived from the constant under test.
 *
 * Logic lives in `collectionLiterals.mjs` so it can be unit-tested without this
 * repository's real files.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COLLECTIONS } from '@accident-black-spot-detection/shared-types';

import { findCollectionLiterals } from './collectionLiterals.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOT = 'apps/mobile/src';

function sourceFiles(directory) {
  const found = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__mocks__') {
        continue;
      }
      found.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(path);
    }
  }

  return found;
}

function main() {
  const names = Object.values(COLLECTIONS);
  const findings = [];

  for (const path of sourceFiles(resolve(repoRoot, SCAN_ROOT))) {
    for (const { line, name } of findCollectionLiterals(readFileSync(path, 'utf8'), names)) {
      findings.push(`  • ${relative(repoRoot, path)}:${line} — '${name}'`);
    }
  }

  if (findings.length > 0) {
    process.stderr.write(
      `${SCAN_ROOT} names ${findings.length} Firestore collection(s) as string literals:\n` +
        `${findings.join('\n')}\n\n` +
        'Import COLLECTIONS from @accident-black-spot-detection/shared-types instead. A literal ' +
        'here survives a rename that updates COLLECTIONS and firestore.rules together, and the ' +
        'result is a client reading a path the rules no longer match.\n',
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${SCAN_ROOT} derives all ${names.length} collection paths from COLLECTIONS.\n`,
  );
}

main();
