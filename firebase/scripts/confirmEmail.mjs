#!/usr/bin/env node
/**
 * Mark an account's email address as confirmed.
 *
 * `hasVerifiedEmail()` in `firestore.rules` refuses a report from an account
 * that has not confirmed its address — see the comment there for why. That is
 * correct in production and awkward in a demo: the Auth emulator accepts any
 * address and **sends nothing**, so there is no inbox anywhere to open the link
 * from.
 *
 * There are two honest ways through that, and both are documented in
 * `docs/demo.md`:
 *
 *   1. The real flow. `sendEmailVerification` still generates a link in the
 *      emulator; it is listed at
 *      `http://127.0.0.1:9099/emulator/v1/projects/<project>/oobCodes` and in
 *      the Emulator UI. Opening it verifies the account exactly as production
 *      would. Worth walking once, because it is the path a real user takes.
 *   2. This script, for every run after that.
 *
 * Usage, with the emulators running:
 *   npm run confirm-email -- you@example.test
 *
 * The account must sign out and in again — or the app must refresh its token —
 * before the rules see the change. `email_verified` is a claim *inside* the ID
 * token, and the token the client is holding was minted before this ran. The
 * report screen's "I have confirmed my address" button forces that refresh.
 */

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'demo-accident-black-spot-detection';

const [email] = process.argv.slice(2);

if (email === undefined) {
  console.error('Usage: npm run confirm-email -- <email>');
  process.exit(1);
}

/**
 * Refuse to run against anything but an emulator unless explicitly forced.
 *
 * Same guard as `grantRole.mjs`, and for a sharper reason: marking an address
 * verified without the owner having proved anything is precisely the check this
 * project added, and doing it by accident against a real project would quietly
 * undo it for that account.
 */
if (process.env.FIREBASE_AUTH_EMULATOR_HOST === undefined) {
  if (process.env.ALLOW_REAL_PROJECT !== 'yes') {
    console.error(
      'FIREBASE_AUTH_EMULATOR_HOST is not set, so this would target a real project.\n' +
        'Start the emulators and export:\n' +
        '  export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099\n' +
        'To do this deliberately against a real project, set ALLOW_REAL_PROJECT=yes.',
    );
    process.exit(1);
  }
  console.warn('⚠  Targeting a REAL project because ALLOW_REAL_PROJECT=yes.');
  console.warn('⚠  This marks an address verified that nobody has proved they control.');
}

initializeApp({ projectId: PROJECT_ID });

const auth = getAuth();
const user = await auth.getUserByEmail(email).catch(() => null);

if (user === null) {
  console.error(
    `No account exists for ${email}. Register it in the app first — this script confirms an ` +
      'existing account, it does not create one.',
  );
  process.exit(1);
}

if (user.emailVerified) {
  console.log(`✔ ${email} (${user.uid}) was already confirmed.`);
  process.exit(0);
}

await auth.updateUser(user.uid, { emailVerified: true });

console.log(`✔ ${email} (${user.uid}) is now confirmed and may file reports.`);
console.log(
  '  The change reaches the client on its next token refresh — tap “I have confirmed my address” ' +
    'on the Report tab, or sign out and in again.',
);

process.exit(0);
