import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

/**
 * End-to-end verification of `deleteAccount` and `exportMyData`.
 *
 * ## Why this is separate from the rules suite
 *
 * Everything in `firebase/tests/*.test.mjs` needs the Firestore emulator alone.
 * This file needs the **Auth, Firestore, Storage and Functions** emulators
 * together, and it builds the functions first — so it runs under its own script,
 * `npm run test:functions`, and is not part of `npm run verify`.
 *
 * ## Why it exists at all
 *
 * The phase gate says deletion must *actually* remove the user's data. That
 * claim cannot be supported by unit tests: `deletionPolicy.ts` is tested and
 * proves what the policy is, but proving the policy is *carried out* — across
 * four collections, an Auth record and a Storage prefix — needs the real
 * services. A deletion routine that silently missed a collection would pass
 * every unit test in the repository.
 *
 * The user here is a real Auth emulator account and the call is a real callable
 * invocation over HTTP with that account's ID token. Nothing is stubbed.
 */

const PROJECT_ID = 'demo-accident-black-spot-detection';
const AUTH_HOST = '127.0.0.1:9099';
const FUNCTIONS_ORIGIN = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1`;
const STORAGE_HOST = '127.0.0.1:9199';
const BUCKET = `${PROJECT_ID}.firebasestorage.app`;

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

/** Create a real account in the Auth emulator and return its uid and ID token. */
async function createAccount(email) {
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'not-a-real-password', returnSecureToken: true }),
    },
  );

  // Read the body once. A template-literal assertion message that calls
  // `response.text()` is evaluated eagerly and consumes the stream, so the
  // `.json()` that follows fails with "Body has already been read" — and the
  // real assertion never runs.
  const text = await response.text();
  assert.equal(response.ok, true, `could not create ${email}: ${text}`);

  const body = JSON.parse(text);
  return { uid: body.localId, idToken: body.idToken };
}

async function accountExists(uid) {
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId: [uid] }),
    },
  );

  const body = await response.json();
  return Array.isArray(body.users) && body.users.length > 0;
}

/** Invoke a callable exactly as the Firebase client SDK does. */
async function callFunction(name, idToken, data = {}) {
  const response = await fetch(`${FUNCTIONS_ORIGIN}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });

  const body = await response.json();
  return { status: response.status, body };
}

/** Arrange state the rules would not let a client create. */
async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(path).set(data);
  });
}

async function readDoc(path) {
  let snapshot;
  await env.withSecurityRulesDisabled(async (context) => {
    snapshot = await context.firestore().doc(path).get();
  });
  return snapshot;
}

/**
 * Put an object in the bucket, bypassing the Storage rules.
 *
 * `Bearer owner` is the emulator's admin credential. This is *arrangement*, not
 * the thing under test — the rules that would otherwise refuse this upload are
 * covered by their own tests, and going through them here would mean
 * reimplementing the whole client upload flow to set up a fixture.
 */
async function uploadObject(path, body) {
  const response = await fetch(
    `http://${STORAGE_HOST}/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', Authorization: 'Bearer owner' },
      body,
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

/** Give the account the full spread of data an established user would have. */
async function seedAccountData(uid) {
  await seed(`users/${uid}`, { id: uid, name: 'Ada Lovelace', email: `${uid}@example.test` });

  await seed(`incidentReports/${uid}-pending`, {
    reporterId: uid,
    status: 'pending',
    type: 'accident',
    description: 'A pending report that was never published.',
    imageUrls: [],
  });

  await seed(`incidentReports/${uid}-approved`, {
    reporterId: uid,
    status: 'approved',
    type: 'accident',
    description: 'An approved report that a black spot may depend on.',
    latitude: 51.5074,
    longitude: -0.1278,
    imageUrls: [`http://${STORAGE_HOST}/v0/b/${BUCKET}/o/whatever`],
  });

  await seed(`emergencyContacts/${uid}-contact`, {
    userId: uid,
    name: 'Sam Doe',
    phone: '+447700900123',
  });

  await seed(`alertLogs/${uid}-alert`, { userId: uid, blackSpotId: 'spot-1', distanceM: 120 });
  await seed(`reportRateLimits/${uid}`, { userId: uid, count: 2 });
  await seed(`reportFingerprints/${uid}__accident__gcpvj0d`, {
    reporterId: uid,
    reportId: `${uid}-pending`,
  });

  await uploadObject(`incidentReports/${uid}/photo.jpg`, 'not-really-a-jpeg');
}

describe('exportMyData', () => {
  it('refuses an unauthenticated caller', async () => {
    const response = await fetch(`${FUNCTIONS_ORIGIN}/exportMyData`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    });

    assert.equal(response.ok, false);
  });

  it('returns the caller’s own data and nothing else', async () => {
    const mine = await createAccount(`export-${Date.now()}@example.test`);
    const theirs = await createAccount(`other-${Date.now()}@example.test`);

    await seedAccountData(mine.uid);
    await seed(`incidentReports/${theirs.uid}-secret`, {
      reporterId: theirs.uid,
      status: 'pending',
      description: 'Somebody else’s report.',
    });

    const { body } = await callFunction('exportMyData', mine.idToken);
    const result = body.result;

    assert.equal(result.account.name, 'Ada Lovelace');
    assert.equal(result.reports.length, 2);
    assert.equal(result.emergencyContacts.length, 1);
    assert.equal(result.alertLogs.length, 1);

    // The decisive assertion: no trace of the other account anywhere in the file.
    const serialised = JSON.stringify(result);
    assert.equal(serialised.includes(theirs.uid), false);
    assert.equal(serialised.includes('Somebody else'), false);
  });

  it('does not name the moderator who reviewed a report', async () => {
    const account = await createAccount(`redact-${Date.now()}@example.test`);
    await seed(`incidentReports/${account.uid}-reviewed`, {
      reporterId: account.uid,
      status: 'rejected',
      moderationNotes: 'Could not be located.',
      reviewedBy: 'moderator-uid-7',
    });

    const { body } = await callFunction('exportMyData', account.idToken);

    assert.equal(JSON.stringify(body.result).includes('moderator-uid-7'), false);
    assert.equal(JSON.stringify(body.result).includes('Could not be located.'), true);
  });
});

describe('deleteAccount', () => {
  it('refuses an unauthenticated caller', async () => {
    const response = await fetch(`${FUNCTIONS_ORIGIN}/deleteAccount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    });

    assert.equal(response.ok, false);
  });

  it('actually removes the account’s data', async () => {
    const account = await createAccount(`delete-${Date.now()}@example.test`);
    await seedAccountData(account.uid);

    const { body } = await callFunction('deleteAccount', account.idToken);
    assert.ok(body.result, `deleteAccount failed: ${JSON.stringify(body)}`);

    // Personal data: gone.
    assert.equal((await readDoc(`users/${account.uid}`)).exists, false, 'profile survived');
    assert.equal(
      (await readDoc(`emergencyContacts/${account.uid}-contact`)).exists,
      false,
      'emergency contact survived — this is another person’s phone number',
    );
    assert.equal(
      (await readDoc(`alertLogs/${account.uid}-alert`)).exists,
      false,
      'alert log survived',
    );
    assert.equal(
      (await readDoc(`reportRateLimits/${account.uid}`)).exists,
      false,
      'rate-limit counter survived',
    );
    assert.equal(
      (await readDoc(`reportFingerprints/${account.uid}__accident__gcpvj0d`)).exists,
      false,
      'fingerprint survived',
    );

    // A report nothing was published from: gone.
    assert.equal(
      (await readDoc(`incidentReports/${account.uid}-pending`)).exists,
      false,
      'pending report survived',
    );

    // The photograph: gone.
    assert.equal(
      await objectExists(`incidentReports/${account.uid}/photo.jpg`),
      false,
      'report photograph survived',
    );

    // The Auth record: gone, and deleted last.
    assert.equal(await accountExists(account.uid), false, 'Auth record survived');
  });

  it('keeps an approved report but cuts the link to the person', async () => {
    // The deliberate exception. A published black spot depends on its evidence,
    // so the incident is kept while the reporter is not — see deletionPolicy.ts.
    const account = await createAccount(`anon-${Date.now()}@example.test`);
    await seedAccountData(account.uid);

    await callFunction('deleteAccount', account.idToken);

    const approved = await readDoc(`incidentReports/${account.uid}-approved`);
    assert.equal(approved.exists, true, 'approved report should be kept');
    assert.equal(approved.get('reporterId'), 'deleted-account');
    assert.notEqual(approved.get('reporterId'), account.uid);
    assert.deepEqual(approved.get('imageUrls'), [], 'photographs must not survive on it');
    // The incident facts remain, which is what the black spot rests on.
    assert.equal(approved.get('latitude'), 51.5074);
  });

  it('writes a tombstone that identifies nobody', async () => {
    const account = await createAccount(`tomb-${Date.now()}@example.test`);
    await seedAccountData(account.uid);

    await callFunction('deleteAccount', account.idToken);

    let tombstones;
    await env.withSecurityRulesDisabled(async (context) => {
      tombstones = await context.firestore().collection('deletedAccounts').get();
    });

    assert.ok(tombstones.size > 0, 'a deletion receipt should be written');

    const serialised = JSON.stringify(tombstones.docs.map((document) => document.data()));
    assert.equal(
      serialised.includes(account.uid),
      false,
      'a deletion record that identified the person would defeat the deletion',
    );
  });

  it('leaves other accounts untouched', async () => {
    const mine = await createAccount(`mine-${Date.now()}@example.test`);
    const theirs = await createAccount(`theirs-${Date.now()}@example.test`);

    await seedAccountData(mine.uid);
    await seedAccountData(theirs.uid);

    await callFunction('deleteAccount', mine.idToken);

    assert.equal((await readDoc(`users/${theirs.uid}`)).exists, true);
    assert.equal((await readDoc(`incidentReports/${theirs.uid}-pending`)).exists, true);
    assert.equal(await objectExists(`incidentReports/${theirs.uid}/photo.jpg`), true);
    assert.equal(await accountExists(theirs.uid), true);
  });
});
