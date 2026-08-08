import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * This app must not use remote push notifications.
 *
 * Not a style rule — a build-configuration invariant with a sharp edge.
 * `apps/mobile/plugins/withoutUnusedCapabilities.ts` strips the `aps-environment`
 * entitlement that `expo-notifications` adds by autolinking, because a **free
 * Apple Personal Team cannot provision a profile containing it** and this app has
 * never needed it: alerts are local notifications scheduled on the device by
 * `alertDelivery.ts`. See `docs/ios-device-builds.md`.
 *
 * The failure mode without this test is quiet and expensive. Someone adds
 * `getExpoPushTokenAsync`, it fails opaquely on device, and nothing points at an
 * entitlement removed months earlier in a config plugin nobody is reading.
 *
 * ## Why this lives in scripts/ rather than beside the code it checks
 *
 * It reads the filesystem, and `apps/mobile` deliberately has no `@types/node`:
 * adding it so a test could compile would put Node globals in scope for React
 * Native code, where they do not exist at runtime. The check is about the
 * repository's build configuration rather than about app behaviour, which is the
 * same category as `workflowParity` — so it belongs here, and it runs in
 * `npm run test:scripts`, which `verify` and CI both run.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const mobileSrc = resolve(repoRoot, 'apps/mobile/src');
const pluginPath = resolve(repoRoot, 'apps/mobile/plugins/withoutUnusedCapabilities.ts');

/** APIs that require APNs, and therefore the entitlement. */
const REMOTE_PUSH_APIS = [
  'getExpoPushTokenAsync',
  'getDevicePushTokenAsync',
  'registerForPushNotificationsAsync',
];

function sourceFiles(directory) {
  const found = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      if (entry !== 'node_modules') {
        found.push(...sourceFiles(path));
      }
      continue;
    }

    if (/\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }

  return found;
}

describe('remote push notifications', () => {
  it('finds source files to check, so the assertions below cannot pass vacuously', () => {
    // A traversal that silently returned nothing would make every assertion here
    // succeed while checking nothing at all. Phase 13's rules bug was this shape.
    assert.ok(sourceFiles(mobileSrc).length > 50);
  });

  for (const api of REMOTE_PUSH_APIS) {
    it(`is not requested anywhere in apps/mobile/src — ${api}`, () => {
      const offenders = sourceFiles(mobileSrc)
        .filter((path) => readFileSync(path, 'utf8').includes(api))
        .map((path) => relative(repoRoot, path));

      assert.deepEqual(offenders, []);
    });
  }

  it('still schedules local notifications, which need no entitlement', () => {
    // The positive half. Without it this file would pass just as well if
    // notification delivery were deleted outright.
    const delivery = readFileSync(join(mobileSrc, 'features/alerts/alertDelivery.ts'), 'utf8');
    assert.ok(delivery.includes('scheduleNotificationAsync'));
  });

  it('has the matching entitlement removal still in place', () => {
    // The two halves are only correct together: no push code AND no entitlement.
    // Deleting one without the other produces either an unprovisionable build or
    // a push API that fails with no explanation.
    assert.match(
      readFileSync(pluginPath, 'utf8'),
      /UNUSED_IOS_ENTITLEMENTS[\s\S]*?'aps-environment'/,
    );
  });
});
