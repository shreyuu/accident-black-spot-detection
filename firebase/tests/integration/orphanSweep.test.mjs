import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

/**
 * End-to-end verification of the orphaned-image sweep.
 *
 * ## Why this exists
 *
 * `orphanSweep.ts` is pure and thoroughly unit-tested, and it proves what the
 * *plan* is: which objects are orphaned, which are referenced, which are too
 * recent to touch. It cannot prove the plan is carried out. Until this file,
 * `sweepOrphanedImages` was the one Cloud Function in the repository verified
 * only by inspection — and the Phase 12 bug that `bucketName()` exists to fix
 * was exactly this class of defect: the Admin SDK's default bucket name was
 * wrong, `getFiles()` returned an empty list from a bucket that did not exist,
 * and the deletion reported success having deleted nothing. Only an end-to-end
 * test can catch that, because every unit test in the repository passes while
 * it happens.
 *
 * ## Why it does not go through the scheduler
 *
 * The Pub/Sub emulator route was tried and does not work in firebase-tools
 * 15.2.1 — see the comment on `runOrphanSweep` for what fails and where. So the
 * function's body is called directly, which covers everything except the cron
 * expression. Note what is *not* stubbed: a real Firestore, a real bucket, real
 * objects, and the real Admin SDK bucket resolution that Phase 12 got wrong.
 *
 * ## Why the clock is moved rather than the objects backdated
 *
 * An object is spared for 24 hours after creation. The Storage emulator sets
 * `timeCreated` itself and offers no way to write it, so the only way to see a
 * deletion is to ask the sweep to reason about a later instant.
 */

const PROJECT_ID = 'demo-accident-black-spot-detection';
const STORAGE_HOST = '127.0.0.1:9199';
const BUCKET = `${PROJECT_ID}.firebasestorage.app`;
const HOUR_MS = 60 * 60 * 1000;

// The Admin SDK reads these to route to the emulators. They must be set before
// `functions/lib` is imported, because `firebaseAdmin.ts` initialises the app on
// first use and the SDK captures the host at that point.
process.env.GCLOUD_PROJECT ??= PROJECT_ID;
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= STORAGE_HOST;

// The compiled output, not the TypeScript source: this workspace runs under
// `node --test` with no transform, and `functions/lib` is what actually gets
// deployed. `npm run test:functions:ci` builds it first.
const { runOrphanSweep } = await import('../../../functions/lib/sweepOrphanedImages.js');

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8080 },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await emptyBucket();
});

/**
 * Remove every object under the report-images prefix.
 *
 * `env.clearStorage()` is deliberately not used: it does not empty the bucket
 * these tests write to — the same finding that made `storage.test.mjs` derive
 * its paths from the clock.
 */
async function emptyBucket() {
  const response = await fetch(`http://${STORAGE_HOST}/v0/b/${BUCKET}/o`, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (!response.ok) return;

  const body = await response.json();
  for (const item of body.items ?? []) {
    await fetch(`http://${STORAGE_HOST}/v0/b/${BUCKET}/o/${encodeURIComponent(item.name)}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer owner' },
    });
  }
}

/** Put an object in the bucket, bypassing the Storage rules. Arrangement only. */
async function uploadObject(path) {
  const response = await fetch(
    `http://${STORAGE_HOST}/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', Authorization: 'Bearer owner' },
      body: 'not-really-a-jpeg',
    },
  );

  const text = await response.text();
  assert.equal(response.ok, true, `could not upload ${path}: ${text}`);
}

async function objectExists(path) {
  const response = await fetch(
    `http://${STORAGE_HOST}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  return response.ok;
}

/** Write a report document, bypassing the rules that would refuse it. */
async function seedReport(id, imageUrls) {
  await env.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(`incidentReports/${id}`).set({
      reporterId: 'someone',
      status: 'pending',
      type: 'accident',
      description: 'Seeded for the orphan sweep test.',
      imageUrls,
    });
  });
}

/** The download URL shape a report stores, for an object at `path`. */
function downloadUrl(path) {
  return `http://${STORAGE_HOST}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
}

describe('runOrphanSweep', () => {
  // The happy path first. A sweep that deletes nothing passes every test that
  // only asserts "the referenced file survived" — which is precisely how the
  // Phase 12 empty-bucket bug reported success, and how Phase 13's rules bug
  // hid behind 143 tests that asserted only refusals.
  it('deletes an unreferenced object once it is past the grace period', async () => {
    const orphan = 'incidentReports/user-1/orphan.jpg';
    await uploadObject(orphan);

    const outcome = await runOrphanSweep(Date.now() + 48 * HOUR_MS);

    assert.equal(outcome.aborted, false);
    assert.equal(outcome.scanned, 1);
    assert.equal(outcome.deleted, 1, 'the orphan should have been deleted');
    assert.equal(await objectExists(orphan), false, 'the object is still in the bucket');
  });

  it('keeps an object a report refers to, however old', async () => {
    const referenced = 'incidentReports/user-1/referenced.jpg';
    await uploadObject(referenced);
    await seedReport('report-1', [downloadUrl(referenced)]);

    const outcome = await runOrphanSweep(Date.now() + 365 * 24 * HOUR_MS);

    assert.equal(outcome.referenced, 1);
    assert.equal(outcome.deleted, 0);
    assert.equal(await objectExists(referenced), true, 'a referenced photograph was deleted');
  });

  it('spares a recent object even when nothing refers to it', async () => {
    const recent = 'incidentReports/user-1/just-uploaded.jpg';
    await uploadObject(recent);

    // The real clock: the object was created moments ago, which is exactly the
    // window between an upload and the report that will refer to it.
    const outcome = await runOrphanSweep();

    assert.equal(outcome.withinGracePeriod, 1);
    assert.equal(outcome.deleted, 0);
    assert.equal(await objectExists(recent), true, 'an in-flight upload was deleted');
  });

  it('separates orphans from referenced objects in one pass', async () => {
    const orphan = 'incidentReports/user-1/orphan.jpg';
    const referenced = 'incidentReports/user-2/referenced.jpg';
    await uploadObject(orphan);
    await uploadObject(referenced);
    await seedReport('report-1', [downloadUrl(referenced)]);

    const outcome = await runOrphanSweep(Date.now() + 48 * HOUR_MS);

    assert.equal(outcome.scanned, 2);
    assert.equal(outcome.referenced, 1);
    assert.equal(outcome.deleted, 1);
    assert.equal(await objectExists(orphan), false);
    assert.equal(await objectExists(referenced), true);
  });

  // The bug this whole file is insurance against: if `getFiles()` ever reads an
  // empty or wrong bucket again, every assertion above about *deletion* still
  // passes vacuously — nothing was there to delete. This one fails.
  it('actually sees the objects in the bucket', async () => {
    await uploadObject('incidentReports/user-1/a.jpg');
    await uploadObject('incidentReports/user-1/b.jpg');

    const outcome = await runOrphanSweep();

    assert.equal(
      outcome.scanned,
      2,
      'the sweep saw no objects — check bucketName() in functions/src/firebaseAdmin.ts',
    );
  });
});
