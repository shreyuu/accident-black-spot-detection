import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ServiceAccountError, parseServiceAccount } from '../serviceAccount.ts';

/**
 * The real-project credential path.
 *
 * This carried a `TODO(phase-14)` saying it "has never been exercised". Phase 14
 * exercises everything that can be: the network call to Google cannot be, and is
 * still unverified. What these tests establish is narrower and worth stating
 * exactly — that every way of getting this configuration wrong is refused before
 * the dashboard starts, with an error naming the actual cause.
 *
 * That matters because of what this credential is. The Admin SDK bypasses
 * Firestore security rules entirely, so nothing downstream will catch a mistake
 * made here.
 */

const PROJECT = 'accident-black-spot-prod';

const validAccount = {
  type: 'service_account',
  project_id: PROJECT,
  private_key_id: 'abc123',
  /**
   * Multi-line, but deliberately **not** a PEM block.
   *
   * `npm run scan:secrets` matches `-----BEGIN … PRIVATE KEY-----` anywhere in a
   * tracked file, and it is right to — that pattern is what a leaked service
   * account looks like. A realistic-looking fixture here would fail the gate and
   * the obvious fix would be to add an exception to the scanner, which is how a
   * credential check stops being one.
   *
   * The property under test is that newlines survive verbatim rather than being
   * trimmed away, and this exercises it just as well.
   */
  private_key: 'first-line\nsecond-line\ntrailing-newline-matters\n',
  client_email: 'admin-dashboard@accident-black-spot-prod.iam.gserviceaccount.com',
  client_id: '000000000000000000000',
};

describe('parseServiceAccount', () => {
  // The happy path first. A validator that only ever asserts refusals passes
  // every test while rejecting everything, which is exactly how Phase 13's rules
  // bug survived eleven phases.
  it('accepts a well-formed account for the configured project', () => {
    const parsed = parseServiceAccount(JSON.stringify(validAccount), PROJECT);

    assert.deepEqual(parsed, {
      projectId: PROJECT,
      clientEmail: validAccount.client_email,
      privateKey: validAccount.private_key,
    });
  });

  it('ignores the fields cert() does not read', () => {
    // Google's JSON carries a dozen keys and gains more over time. Requiring the
    // full shape would reject a valid credential over a field nothing uses.
    const minimal = {
      project_id: PROJECT,
      private_key: validAccount.private_key,
      client_email: validAccount.client_email,
    };

    assert.equal(parseServiceAccount(JSON.stringify(minimal), PROJECT).projectId, PROJECT);
  });

  it('preserves the newlines inside the private key exactly', () => {
    // The single most common way this value is corrupted in transit. If the
    // newlines are collapsed the key is silently unusable, and the failure
    // surfaces as an authentication error rather than as a parsing one.
    const parsed = parseServiceAccount(JSON.stringify(validAccount), PROJECT);
    assert.equal(parsed.privateKey, validAccount.private_key);
    assert.ok(parsed.privateKey.includes('\n'));
  });

  describe('refusals', () => {
    it('refuses an unset variable', () => {
      assert.throws(() => parseServiceAccount(undefined, PROJECT), ServiceAccountError);
    });

    it('refuses a blank variable rather than treating it as unset-and-fine', () => {
      assert.throws(() => parseServiceAccount('   ', PROJECT), ServiceAccountError);
    });

    it('refuses malformed JSON without quoting the value back', () => {
      // The value is a private key and the likeliest reader of this message is a
      // deployment log, so the message must not echo any part of it.
      assert.throws(
        () => parseServiceAccount('{not json', PROJECT),
        (error: unknown) => {
          assert.ok(error instanceof ServiceAccountError);
          assert.match(error.message, /not valid JSON/);
          assert.equal(error.message.includes('{not json'), false);
          return true;
        },
      );
    });

    for (const field of ['project_id', 'client_email', 'private_key'] as const) {
      it(`refuses an account with no ${field}, and names it`, () => {
        // `delete` on a copy rather than a rest-destructure: the discarded
        // binding an omitting destructure creates is an unused variable, and
        // this workspace's ESLint config has no underscore escape hatch.
        const incomplete: Record<string, unknown> = { ...validAccount };
        delete incomplete[field];

        assert.throws(
          () => parseServiceAccount(JSON.stringify(incomplete), PROJECT),
          (error: unknown) => {
            assert.ok(error instanceof ServiceAccountError);
            assert.match(error.message, new RegExp(field));
            return true;
          },
        );
      });
    }

    it('refuses an empty-string field, which JSON.parse accepts happily', () => {
      const blank = { ...validAccount, client_email: '' };
      assert.throws(() => parseServiceAccount(JSON.stringify(blank), PROJECT), ServiceAccountError);
    });

    // The one refusal here that is about safety rather than typos.
    it('refuses a credential belonging to a different project', () => {
      const other = { ...validAccount, project_id: 'someone-elses-project' };

      assert.throws(
        () => parseServiceAccount(JSON.stringify(other), PROJECT),
        (error: unknown) => {
          assert.ok(error instanceof ServiceAccountError);
          // Both project ids must appear: an operator reading this needs to see
          // which one is wrong, not just that they disagree.
          assert.match(error.message, /someone-elses-project/);
          assert.match(error.message, new RegExp(PROJECT));
          return true;
        },
      );
    });
  });
});
