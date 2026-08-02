import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

/**
 * Cloud Storage rules (Phase 12).
 *
 * The one upload path in the app is a photograph attached to an incident report,
 * and until Phase 12 it had no automated coverage at all — the rules were
 * verified once, by hand, in Phase 5. The properties below are the ones that
 * would be most damaging to lose and least obvious to notice losing:
 *
 *   - a bucket that anybody may write to is free storage and an open bill;
 *   - `image/*` would admit SVG, which is a scriptable document, and a moderator
 *     opens these in a browser;
 *   - an overwrite of an existing object is how you swap the evidence behind a
 *     report a moderator has already read.
 *
 * That last one is the reason this file exists rather than a longer comment:
 * `allow update: if false` reads as though it prevents overwriting and does
 * not — the emulator evaluates a re-upload as `create` — so the protection is
 * `resource == null`, and only a test keeps that line from being "tidied away".
 */

const PROJECT_ID = 'demo-accident-black-spot-detection';
const here = dirname(fileURLToPath(import.meta.url));

/**
 * Identities are unique per run, and that is load-bearing.
 *
 * `env.clearStorage()` does **not** empty the bucket these contexts write to.
 * Verified against the emulator: `initializeTestEnvironment`'s storage contexts
 * use the bare project id as the bucket name, objects survive `clearStorage()`,
 * and the next run's uploads then hit the `resource == null` guard and fail —
 * so the suite passed once and failed for ever afterwards, which is worse than
 * failing immediately.
 *
 * Deriving the uid from the clock sidesteps it entirely: every run writes to
 * paths nothing has used before, and no test depends on the bucket being empty.
 * The one test that needs an object already in place seeds it itself.
 */
const RUN = Date.now().toString(36);
const OWNER = `owner-${RUN}`;
const OTHER = `other-${RUN}`;

/** A path inside a user's own folder. */
function ownPath(name, uid = OWNER) {
  return `incidentReports/${uid}/${name}`;
}

/** A few bytes. Contents are irrelevant: the rules can only see declared metadata. */
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: readFileSync(join(here, '..', 'storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
});

function asUser(uid) {
  return env.authenticatedContext(uid).storage();
}

function asAnonymous() {
  return env.unauthenticatedContext().storage();
}

/** Upload `BYTES` to a path with a declared content type. */
function upload(storage, path, contentType = 'image/jpeg', bytes = BYTES) {
  return storage.ref(path).put(bytes, { contentType });
}

/** Put an object in place bypassing the rules, so an overwrite has something to hit. */
async function seedObject(path) {
  await env.withSecurityRulesDisabled(async (context) => {
    await context.storage().ref(path).put(BYTES, { contentType: 'image/jpeg' });
  });
}

describe('who may upload', () => {
  it('lets a signed-in user write into their own folder', async () => {
    await assertSucceeds(upload(asUser(OWNER), ownPath('photo.jpg')));
  });

  it('refuses writing into another user’s folder', async () => {
    // Ownership is structural: the uid is a path segment, so there is no lookup
    // to get wrong and no way to claim somebody else's prefix.
    await assertFails(upload(asUser(OTHER), ownPath('photo.jpg', OWNER)));
  });

  it('refuses an anonymous upload', async () => {
    await assertFails(upload(asAnonymous(), ownPath('photo.jpg')));
  });

  it('refuses a path outside the report prefix', async () => {
    // The catch-all at the bottom of the file. A future feature that forgets to
    // add a rule fails closed rather than inheriting this one.
    await assertFails(upload(asUser(OWNER), `somewhereElse/${OWNER}/photo.jpg`));
    await assertFails(upload(asUser(OWNER), 'photo.jpg'));
  });

  it('refuses a nested path, which would escape the single-segment match', async () => {
    await assertFails(upload(asUser(OWNER), ownPath('nested/photo.jpg')));
  });
});

describe('what may be uploaded', () => {
  it('accepts the allowed image types', async () => {
    for (const [index, contentType] of [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ].entries()) {
      await assertSucceeds(upload(asUser(OWNER), ownPath(`photo-${index}.jpg`), contentType));
    }
  });

  it('refuses SVG, which is a scriptable document a moderator would open', async () => {
    // The reason the rule is an allow-list and not `image/*`.
    await assertFails(upload(asUser(OWNER), ownPath('evil.svg'), 'image/svg+xml'));
  });

  it('refuses non-image types outright', async () => {
    for (const contentType of [
      'application/pdf',
      'text/html',
      'application/javascript',
      'video/mp4',
      'application/octet-stream',
    ]) {
      await assertFails(
        upload(asUser(OWNER), ownPath(`file-${contentType.replace(/\W/g, '')}`), contentType),
        `should refuse ${contentType}`,
      );
    }
  });

  it('refuses an upload with no declared content type', async () => {
    await assertFails(asUser(OWNER).ref(ownPath('bare')).put(BYTES));
  });

  it('refuses an object over the size cap', async () => {
    // The bucket must not become free storage, and a quota exhausted by one
    // account is a denial of service against every other reporter.
    const tooBig = new Uint8Array(5 * 1024 * 1024 + 1024);
    await assertFails(upload(asUser(OWNER), ownPath('huge.jpg'), 'image/jpeg', tooBig));
  });
});

describe('an uploaded object is immutable', () => {
  it('refuses overwriting an existing object', async () => {
    // `allow update: if false` alone does NOT do this — the emulator evaluates a
    // re-upload onto an existing path as `create`. `resource == null` is what
    // refuses it, and this test is why that line survives a tidy-up.
    await seedObject(ownPath('overwrite-me.jpg'));

    await assertFails(upload(asUser(OWNER), ownPath('overwrite-me.jpg')));
  });

  it('refuses deleting an object, which would break a report’s evidence', async () => {
    // Deletion happens through the Admin SDK: account erasure and the orphan
    // sweep. Never from a client.
    await seedObject(ownPath('delete-me.jpg'));

    await assertFails(asUser(OWNER).ref(ownPath('delete-me.jpg')).delete());
  });
});

describe('who may read', () => {
  beforeEach(async () => {
    await seedObject(ownPath('readable.jpg'));
  });

  it('lets the owner read their own object', async () => {
    await assertSucceeds(asUser(OWNER).ref(ownPath('readable.jpg')).getDownloadURL());
  });

  it('refuses another signed-in user', async () => {
    await assertFails(asUser(OTHER).ref(ownPath('readable.jpg')).getDownloadURL());
  });

  it('refuses an anonymous reader', async () => {
    await assertFails(asAnonymous().ref(ownPath('readable.jpg')).getDownloadURL());
  });

  it('refuses listing another user’s folder', async () => {
    await assertFails(asUser(OTHER).ref(`incidentReports/${OWNER}`).listAll());
  });
});
