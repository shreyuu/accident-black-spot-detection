import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  CLIENT_CREATABLE_STATUS,
  COLLECTIONS,
  MODERATION_ONLY_FIELDS,
} from '@accident-black-spot-detection/shared-types';

/**
 * Every collection has a rule, and every rule has a collection.
 *
 * Phase 0 deferred a full rule review to Phase 12 because rules were being added
 * by whichever phase happened to create a collection — which works right up
 * until somebody adds a collection and forgets. The failure mode is quiet: the
 * catch-all at the bottom of `firestore.rules` denies everything, so the feature
 * simply does not work, and the reason is a PERMISSION_DENIED with no
 * explanation of which rule was missing.
 *
 * This test makes that loud instead. It reads the rules as text rather than
 * exercising the emulator, because the question is about the file's structure,
 * not its behaviour — the behaviour is what every other file here covers.
 *
 * The reverse direction matters too: a `match` block for a collection no name in
 * the codebase refers to is either a typo or dead access nobody reviews.
 */

const here = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(join(here, '..', 'firestore.rules'), 'utf8');
const storageRules = readFileSync(join(here, '..', 'storage.rules'), 'utf8');

/**
 * Top-level collection names from `match /name/{id} {` lines.
 *
 * The trailing `{` after the wildcard is what excludes the enclosing
 * `match /databases/{database}/documents {`, which is a path prefix rather than
 * a collection.
 */
function matchedCollections(source) {
  return new Set(
    [...source.matchAll(/^\s*match \/([A-Za-z][A-Za-z0-9]*)\/\{[A-Za-z][A-Za-z0-9]*\}\s*\{/gm)].map(
      (match) => match[1],
    ),
  );
}

describe('firestore.rules covers the shared collection vocabulary', () => {
  const declared = new Set(Object.values(COLLECTIONS));
  const matched = matchedCollections(rules);

  it('has a match block for every collection in COLLECTIONS', () => {
    const missing = [...declared].filter((name) => !matched.has(name));
    assert.deepEqual(
      missing,
      [],
      `These collections are named in the codebase but denied by the catch-all: ${missing.join(', ')}`,
    );
  });

  it('has no match block for a collection nothing refers to', () => {
    const orphaned = [...matched].filter((name) => !declared.has(name));
    assert.deepEqual(
      orphaned,
      [],
      `These rules grant access to collections no code names: ${orphaned.join(', ')}`,
    );
  });

  it('still ends with a deny-all catch-all', () => {
    // The single most important line in the file. Everything above it is an
    // exception to this, and without it an unmatched path would be *allowed*.
    assert.match(rules, /match \/\{document=\*\*\} \{\s*\n\s*allow read, write: if false;/);
  });

  it('grants no write capability to a role anywhere', () => {
    // Privileged writes go through the Admin SDK, which bypasses these rules
    // entirely. A rule that granted a write to `isModerator()` would create a
    // second, client-reachable path to publication — the one thing the whole
    // moderation design exists to prevent.
    const roleWrites = [...rules.matchAll(/allow [^:]*write[^:]*:\s*if\s+([^;]+);/g)].filter(
      ([, condition]) => condition.includes('isModerator') || condition.includes('callerRole'),
    );

    assert.deepEqual(roleWrites, []);
  });
});

/**
 * The moderation vocabulary the rules hard-code, held to the shared constants.
 *
 * `MODERATION_ONLY_FIELDS` says it exists "so the rules, the mobile client and
 * the dashboard all derive their behaviour from one list instead of three
 * hand-maintained copies". Two of those three do. `firestore.rules` cannot
 * import TypeScript, so it spells the list out — which makes it exactly the
 * hand-maintained third copy the constant was written to prevent, and nothing
 * noticed the difference.
 *
 * Same for `CLIENT_CREATABLE_STATUS`: its own comment says "Enforced in
 * firestore.rules", and until now nothing checked that claim. Both constants
 * were unreferenced by any TypeScript, which is what made them look like dead
 * weight during a cleanup — the value was real, but only as documentation, and
 * documentation nothing verifies is a comment with a version number.
 *
 * Reading the rules as text is the only way to close this. It is the same
 * approach the collection parity above takes, for the same reason.
 */
describe('firestore.rules matches the shared moderation vocabulary', () => {
  it('refuses every moderation-only field on a client write', () => {
    const listed = rules.match(/function hasNoModerationFields\(data\) \{[\s\S]*?\}/);
    assert.ok(listed, '`hasNoModerationFields` is gone — the rules no longer refuse these fields.');

    const inRules = new Set([...listed[0].matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]));

    // `status` is in the shared list but not in this function: a client *does*
    // write it, and the separate `status == CLIENT_CREATABLE_STATUS` line below
    // constrains the value rather than forbidding the key.
    const expected = MODERATION_ONLY_FIELDS.filter((field) => field !== 'status');
    const missing = expected.filter((field) => !inRules.has(field));

    assert.deepEqual(
      missing,
      [],
      `MODERATION_ONLY_FIELDS names ${missing.join(', ')}, which a client may still write: ` +
        'add them to `hasNoModerationFields` in firestore.rules.',
    );
  });

  it('pins a created report to the only status a client may cause', () => {
    assert.ok(
      rules.includes(`request.resource.data.status == '${CLIENT_CREATABLE_STATUS}'`),
      `firestore.rules no longer pins a created report to '${CLIENT_CREATABLE_STATUS}'. ` +
        'That line is what stops a tampered client from publishing its own report.',
    );
  });
});

describe('storage.rules', () => {
  it('ends with a deny-all catch-all', () => {
    assert.match(storageRules, /match \/\{allPaths=\*\*\} \{\s*\n\s*allow read, write: if false;/);
  });

  it('never admits an image content type by wildcard', () => {
    // `image/*` would admit SVG, which is a scriptable document. A moderator
    // opening one in the browser-based dashboard would execute it.
    assert.doesNotMatch(storageRules, /contentType\.matches\('image\/\.\*'\)/);
    assert.ok(storageRules.includes("'image/jpeg'"));
  });
});
