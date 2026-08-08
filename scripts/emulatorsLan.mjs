#!/usr/bin/env node
/**
 * Start the Firebase emulators reachable from a physical device on the LAN.
 *
 * ## Why this is not the default
 *
 * `firebase emulators:start` binds every emulator to `127.0.0.1`. That is the
 * right default and it is why device testing has never worked without thought:
 * a phone on the same Wi-Fi cannot reach loopback on your Mac, no matter what
 * address is put in `apps/mobile/.env`. The failure looks like a network error
 * in the app rather than like a misconfiguration.
 *
 * Binding to `0.0.0.0` fixes that and has a cost worth stating plainly: **an
 * unauthenticated Firestore, Auth and Storage emulator become reachable by
 * anything else on the network.** On a home network that is a considered risk;
 * on café or campus Wi-Fi it is not. The emulators hold only seeded demo data
 * and a `demo-` project cannot reach Google Cloud, so the exposure is bounded —
 * but it is real, which is why this is a separate command you have to choose.
 *
 * ## Why it generates a config instead of duplicating one
 *
 * The obvious implementation is a second `firebase.lan.json` committed beside
 * the first. It would drift: rules paths, indexes, the functions codebase and
 * every port would have to be kept in step by hand, and the copy is only ever
 * exercised during device testing, which is rare. This reads the real
 * `firebase.json`, adds a host to each emulator, and writes the result to a
 * gitignored file next to it — same directory, because the relative paths
 * inside resolve against the config file's own location.
 *
 * Usage:
 *   npm run emulators:lan
 *
 * Everything after `--` is passed through to `firebase emulators:start`.
 */

import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_CONFIG = resolve(repoRoot, 'firebase.json');
const GENERATED_CONFIG = resolve(repoRoot, '.firebase-lan.json');

/** Bind address. Every interface, which is the whole point. */
const LAN_HOST = '0.0.0.0';

/**
 * This machine's first non-internal IPv4 address.
 *
 * Printed rather than written anywhere: it belongs in `apps/mobile/.env`, which
 * is the developer's file and not something a script should edit. Getting this
 * value wrong — or leaving it as `localhost` — is the single most common reason
 * a device build cannot sign in.
 */
function lanAddresses() {
  const addresses = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push({ name, address: entry.address });
      }
    }
  }
  return addresses;
}

function generateConfig() {
  const config = JSON.parse(readFileSync(SOURCE_CONFIG, 'utf8'));

  if (typeof config.emulators !== 'object' || config.emulators === null) {
    throw new Error('firebase.json has no `emulators` block to expose.');
  }

  for (const [name, settings] of Object.entries(config.emulators)) {
    // `singleProjectMode` and friends are booleans, not emulator definitions.
    if (typeof settings !== 'object' || settings === null) {
      continue;
    }
    config.emulators[name] = { ...settings, host: LAN_HOST };
  }

  writeFileSync(GENERATED_CONFIG, `${JSON.stringify(config, null, 2)}\n`);
}

function main() {
  generateConfig();

  const addresses = lanAddresses();

  process.stdout.write(
    '\nEmulators will listen on every interface, not just loopback.\n' +
      'Anything on this network can reach them. They hold seeded demo data only,\n' +
      'and a `demo-` project cannot reach Google Cloud — but do not run this on a\n' +
      'network you do not trust.\n\n',
  );

  if (addresses.length === 0) {
    process.stdout.write('No LAN address found. Are you connected to a network?\n\n');
  } else {
    process.stdout.write('Set this in apps/mobile/.env, then rebuild the app:\n\n');
    for (const { name, address } of addresses) {
      process.stdout.write(`  EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=${address}   (${name})\n`);
    }
    process.stdout.write(
      '\nPick the interface your phone is on — usually en0 for Wi-Fi. The value is\n' +
        'read at build time, so a change needs a rebuild, not just a Metro reload.\n\n',
    );
  }

  const passthrough = process.argv.slice(2);
  const child = spawn(
    'firebase',
    ['emulators:start', '--config', GENERATED_CONFIG, ...passthrough],
    { stdio: 'inherit', cwd: repoRoot },
  );

  child.on('error', (error) => {
    process.stderr.write(
      `Could not start the Firebase CLI: ${error.message}\n\n  npm install --global firebase-tools\n`,
    );
    process.exitCode = 1;
  });

  child.on('exit', (code) => {
    process.exitCode = code ?? 0;
  });
}

main();
