import { after, before, beforeEach, describe, it } from 'node:test';

import {
  asUser,
  assertFails,
  assertSucceeds,
  createTestEnvironment,
  serverTimestamp,
  submitReportBatch,
} from './helpers.mjs';

/**
 * Field-level validation the client also performs, enforced where it counts.
 *
 * Every value below is one the genuine app never sends — its Zod schemas refuse
 * them first. These tests are about the client that is *not* the genuine app: a
 * script driving the SDK with a valid account, which is the posture
 * `firestore.rules` is written against throughout.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const BUCKET = 'demo-accident-black-spot-detection.firebasestorage.app';

/** A download URL of the exact shape `getDownloadURL()` returns. */
function storageUrl(
  uid,
  name = 'mf3k2a-x9q2b1c0.jpg',
  origin = 'https://firebasestorage.googleapis.com',
) {
  return `${origin}/v0/b/${BUCKET}/o/incidentReports%2F${uid}%2F${name}?alt=media&token=00000000-0000-4000-8000-000000000000`;
}

let env;

before(async () => {
  env = await createTestEnvironment();
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

function submit(report) {
  return submitReportBatch(asUser(env, 'author'), { reporterId: 'author', report });
}

describe('occurredAt is bounded on the server, not only in the app', () => {
  it('accepts an occurrence an hour ago', async () => {
    await assertSucceeds(submit({ occurredAt: new Date(Date.now() - 60 * 60 * 1000) }));
  });

  it('refuses an occurrence far in the future, which would pin recency at its maximum', async () => {
    await assertFails(submit({ occurredAt: new Date('2100-01-01T00:00:00Z') }));
  });

  it('refuses an occurrence more than a year ago', async () => {
    await assertFails(submit({ occurredAt: new Date(Date.now() - 400 * DAY_MS) }));
  });
});

describe('imageUrls must be the reporter’s own uploads', () => {
  it('accepts a download URL for an object in the reporter’s own folder', async () => {
    await assertSucceeds(submit({ imageUrls: [storageUrl('author')] }));
  });

  it('accepts the same URL served by the Storage emulator', async () => {
    await assertSucceeds(
      submit({ imageUrls: [storageUrl('author', 'a1-b2.png', 'http://127.0.0.1:9199')] }),
    );
  });

  it('refuses an arbitrary link, which the dashboard would show a moderator as “photo 1”', async () => {
    await assertFails(submit({ imageUrls: ['https://evil.example/fake-login'] }));
  });

  it('refuses a javascript: URL', async () => {
    await assertFails(submit({ imageUrls: ['javascript:alert(1)'] }));
  });

  it('refuses another user’s object', async () => {
    await assertFails(submit({ imageUrls: [storageUrl('someone-else')] }));
  });

  it('refuses a URL on a look-alike host', async () => {
    await assertFails(
      submit({
        imageUrls: [
          storageUrl('author', 'a.jpg', 'https://firebasestorage.googleapis.com.evil.example'),
        ],
      }),
    );
  });

  it('refuses one entry packed with many object paths', async () => {
    const packed = `${storageUrl('author')}${'incidentReports%2Fauthor%2Fkeep.jpg'.repeat(50)}`;
    await assertFails(submit({ imageUrls: [packed] }));
  });

  it('refuses a non-string entry', async () => {
    await assertFails(submit({ imageUrls: [42] }));
  });

  it('refuses the same URL twice', async () => {
    await assertFails(submit({ imageUrls: [storageUrl('author'), storageUrl('author')] }));
  });

  it('checks every entry, not only the first', async () => {
    await assertFails(
      submit({
        imageUrls: [
          storageUrl('author', 'one.jpg'),
          storageUrl('author', 'two.jpg'),
          'https://evil.example/three',
        ],
      }),
    );
  });
});

describe('geohash must be a geohash', () => {
  it('refuses characters outside the geohash alphabet', async () => {
    // `a`, `i`, `l` and `o` are not in base32-geohash. Free text here was a
    // way to mint a new duplicate fingerprint per submission.
    await assertFails(submit({ geohash: 'aaaaaaaaaa' }));
    await assertFails(submit({ geohash: 'gcpvj0 ../' }));
  });
});

describe('profile phone is bounded', () => {
  function profile(phone) {
    return {
      id: 'author',
      name: 'Author',
      email: 'author@example.test',
      phone,
      role: 'user',
      alertRadiusM: 1000,
      alertsEnabled: true,
      backgroundMonitoringEnabled: false,
      hapticsEnabled: true,
      soundEnabled: true,
      darkModePreference: 'system',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  }

  it('accepts an E.164 number', async () => {
    await assertSucceeds(asUser(env, 'author').doc('users/author').set(profile('+447700900123')));
  });

  it('refuses a phone field used as free storage', async () => {
    await assertFails(
      asUser(env, 'author')
        .doc('users/author')
        .set(profile('9'.repeat(5000))),
    );
  });
});
