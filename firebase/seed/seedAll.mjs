#!/usr/bin/env node
/**
 * Seed everything the demo needs, around one set of coordinates.
 *
 * Both seed scripts take a latitude and longitude and both must be given the
 * *same* pair, because the incident reports are positioned relative to the same
 * centre as the black spots. Running them separately with different coordinates
 * — easy to do, since the second command is usually recalled from history —
 * produces a dataset that looks fine in the emulator UI and is silently
 * incoherent on the map.
 *
 * Usage (emulators must be running):
 *   npm run seed:all -- 51.5074 -0.1278
 *
 * Defaults to central London.
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const latitude = args[0] ?? '51.5074';
const longitude = args[1] ?? '-0.1278';

if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
  process.stderr.write('Usage: npm run seed:all -- <latitude> <longitude>\n');
  process.exit(1);
}

const SCRIPTS = ['seedBlackSpots.mjs', 'seedIncidentReports.mjs'];

for (const script of SCRIPTS) {
  const result = spawnSync(process.execPath, [resolve(here, script), latitude, longitude], {
    stdio: 'inherit',
  });

  // Stop on the first failure rather than pressing on. The usual cause is that
  // the emulators are not running, and the second script would fail the same
  // way — printing a second, identical wall of connection errors that makes the
  // first one harder to find.
  if (result.status !== 0) {
    process.stderr.write(
      `\n${script} failed. Are the emulators running? Start them with:\n\n  npm run emulators\n`,
    );
    process.exit(result.status ?? 1);
  }

  process.stdout.write('\n');
}

process.stdout.write(
  `Seeded around ${latitude}, ${longitude}.\n` +
    'Next: point the app at the same coordinates, and see docs/demo.md.\n',
);
