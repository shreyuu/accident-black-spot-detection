import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findCollectionLiterals } from '../collectionLiterals.mjs';

const NAMES = ['users', 'blackSpots', 'incidentReports', 'emergencyContacts', 'alertLogs'];

const find = (source) => findCollectionLiterals(source, NAMES);

describe('findCollectionLiterals', () => {
  describe('finds a collection name in a Firestore path position', () => {
    it('assigned to a *_COLLECTION constant', () => {
      assert.deepEqual(find("export const BLACK_SPOTS_COLLECTION = 'blackSpots';"), [
        { line: 1, name: 'blackSpots' },
      ]);
    });

    it('assigned to a typed *_COLLECTION constant', () => {
      assert.deepEqual(find("const USERS_COLLECTION: string = 'users';"), [
        { line: 1, name: 'users' },
      ]);
    });

    it('passed to collection()', () => {
      assert.deepEqual(find("collection(getFirebaseFirestore(), 'alertLogs')"), [
        { line: 1, name: 'alertLogs' },
      ]);
    });

    it('passed to doc()', () => {
      assert.deepEqual(find('doc(db, "users", userId)'), [{ line: 1, name: 'users' }]);
    });

    it('passed to collectionGroup()', () => {
      assert.deepEqual(find("collectionGroup(db, 'incidentReports')"), [
        { line: 1, name: 'incidentReports' },
      ]);
    });

    it('reports the line, not just the fact', () => {
      assert.deepEqual(find(`const a = 1;\nconst b = 2;\nconst C_COLLECTION = 'users';`), [
        { line: 3, name: 'users' },
      ]);
    });

    /**
     * Regression: block comments were once deleted rather than blanked, so every
     * finding below one was reported tens of lines early. These files open with
     * long rationale blocks, so that was every finding in practice.
     */
    it('keeps line numbers accurate after a multi-line block comment', () => {
      const source = ['/**', ' * A comment', ' * spanning lines.', ' */', "doc(db, 'users')"].join(
        '\n',
      );

      assert.deepEqual(find(source), [{ line: 5, name: 'users' }]);
    });
  });

  describe('passes code that is already correct', () => {
    it('a constant derived from COLLECTIONS', () => {
      assert.deepEqual(find('export const BLACK_SPOTS_COLLECTION = COLLECTIONS.blackSpots;'), []);
    });

    it('an SDK call given a derived constant', () => {
      assert.deepEqual(find('collection(db, COLLECTIONS.alertLogs)'), []);
    });
  });

  /**
   * The three namespaces that legitimately spell a collection name without being
   * a Firestore path. Flagging these would make the gate noise, and a noisy gate
   * gets suppressed rather than obeyed.
   */
  describe('ignores names that are not Firestore paths', () => {
    it('a React Query cache key', () => {
      assert.deepEqual(find("useQuery({ queryKey: ['blackSpots', 'nearby', key] })"), []);
    });

    it('a query key factory', () => {
      assert.deepEqual(find("export const key = (id) => ['emergencyContacts', id] as const;"), []);
    });

    it('the Cloud Storage prefix, which storage.rules governs', () => {
      assert.deepEqual(find("export const REPORT_IMAGES_PREFIX = 'incidentReports';"), []);
    });

    it('user-facing copy', () => {
      assert.deepEqual(find("const label = 'All users in range';"), []);
    });

    it('a nested document path', () => {
      assert.deepEqual(find("const path = 'users/{id}';"), []);
    });

    it('an identifier rather than a string', () => {
      assert.deepEqual(find('const users = await load();'), []);
    });
  });

  describe('ignores comments', () => {
    it('a line comment', () => {
      assert.deepEqual(find("// writes to doc(db, 'alertLogs') on every delivery"), []);
    });

    it('a block comment', () => {
      assert.deepEqual(find("/**\n * Append-only writes to 'alertLogs'.\n */"), []);
    });

    it('but still reads code on a line that also carries a comment', () => {
      assert.deepEqual(find("const A_COLLECTION = 'users'; // the profile collection"), [
        { line: 1, name: 'users' },
      ]);
    });

    it('and does not mistake a URL for a comment', () => {
      assert.deepEqual(find(`fetch('https://example.test'); doc(db, 'users');`), [
        { line: 1, name: 'users' },
      ]);
    });
  });

  it('returns nothing for an empty file', () => {
    assert.deepEqual(find(''), []);
  });
});
