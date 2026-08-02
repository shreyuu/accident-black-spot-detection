#!/usr/bin/env node
/**
 * Grant a role to an account.
 *
 * Roles are Firebase Auth **custom claims**, which only the Admin SDK can write.
 * That is the whole security model: there is no code path anywhere in the mobile
 * app or the dashboard that can promote an account, so a compromised client
 * cannot escalate itself no matter what it is allowed to write to Firestore.
 *
 * Which is also why this is a script run by hand rather than a screen in the
 * dashboard. The first administrator has to come from outside the system — a
 * dashboard that could create its own first admin would be a dashboard anyone
 * could create an admin in.
 *
 * Phase 12 added that screen for every *subsequent* role change: `/roles` in the
 * dashboard, admin-only, audited, and revoking the target's sessions so a
 * demotion takes effect at once. This script remains the bootstrap, and is the
 * only way to create the first administrator.
 *
 * Usage, with the emulators running:
 *   npm run grant-role -- moderator@example.test moderator
 *   npm run grant-role -- admin@example.test admin
 */

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const VALID_ROLES = ['user', 'moderator', 'admin'];
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'demo-accident-black-spot-detection';

const [email, role] = process.argv.slice(2);

if (email === undefined || role === undefined) {
  console.error('Usage: npm run grant-role -- <email> <user|moderator|admin>');
  process.exit(1);
}

if (!VALID_ROLES.includes(role)) {
  console.error(`Unknown role "${role}". Expected one of: ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}

/**
 * Refuse to run against anything but an emulator unless explicitly forced.
 *
 * This script grants administrative power. Running it by accident against a real
 * project — a stray shell with production credentials exported — is exactly the
 * mistake worth making hard.
 */
if (process.env.FIREBASE_AUTH_EMULATOR_HOST === undefined) {
  if (process.env.ALLOW_REAL_PROJECT !== 'yes') {
    console.error(
      'FIREBASE_AUTH_EMULATOR_HOST is not set, so this would target a real project.\n' +
        'Start the emulators and export:\n' +
        '  export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099\n' +
        '  export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080\n' +
        'To do this deliberately against a real project, set ALLOW_REAL_PROJECT=yes.',
    );
    process.exit(1);
  }
  console.warn('⚠  Targeting a REAL project because ALLOW_REAL_PROJECT=yes.');
}

initializeApp({ projectId: PROJECT_ID });

const auth = getAuth();
const firestore = getFirestore();

const user = await auth.getUserByEmail(email).catch(() => null);

if (user === null) {
  console.error(
    `No account exists for ${email}. Register it in the app first — this script grants a role to ` +
      'an existing account, it does not create one.',
  );
  process.exit(1);
}

// The claim is what authorises. Everything else is bookkeeping.
await auth.setCustomUserClaims(user.uid, { role });

/**
 * Mirror the role onto the profile document.
 *
 * For display only — the mobile Settings screen and the dashboard header read it.
 * Authorisation never does, because a document can be written by more paths than
 * a custom claim can. If the two ever disagree, the claim wins and this copy is
 * simply stale.
 */
await firestore
  .collection('users')
  .doc(user.uid)
  .set({ role, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

console.log(`✔ ${email} (${user.uid}) is now "${role}".`);
console.log(
  '  The claim reaches the client on its next token refresh — sign out and in again to pick it up.',
);

process.exit(0);
