import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { COLLECTIONS as SHARED } from '@accident-black-spot-detection/shared-types';

import { COLLECTIONS } from '../collections.ts';

/**
 * The drift guard for the copied collection names.
 *
 * `src/collections.ts` explains why the functions workspace holds its own copy
 * rather than importing `shared-types`: the deployed runtime cannot load
 * TypeScript source. This file is the check that makes the copy safe, and it can
 * import the real thing precisely because tests are excluded from the emit and
 * never deployed — see the `exclude` in tsconfig.json.
 *
 * Without this, adding a collection in one place and not the other produces a
 * function that writes to a path nothing else reads, or that silently misses
 * documents during account deletion. Both fail quietly, which is the worst way
 * for a deletion routine to fail.
 */
describe('the copied collection names match shared-types', () => {
  it('has exactly the same keys', () => {
    assert.deepEqual(Object.keys(COLLECTIONS).sort(), Object.keys(SHARED).sort());
  });

  it('has exactly the same values', () => {
    assert.deepEqual(COLLECTIONS, { ...SHARED });
  });
});
