# Firebase configuration

Security rules and emulator configuration. `firebase.json` and `.firebaserc` live at the repository
root because the Firebase CLI expects them there.

## Emulator-first development

The project id is **`demo-accident-black-spot-detection`**. The `demo-` prefix is meaningful to the
Firebase CLI: a project with that prefix is guaranteed never to reach production Google Cloud. The
emulators refuse to talk to any real backend, no credentials are required, and no billing account is
involved. That is exactly what we want for local development and CI.

Start the emulators from the repository root:

```bash
npm run emulators
```

| Service        | Port | Notes                                |
| -------------- | ---- | ------------------------------------ |
| Emulator UI    | 4000 | Browse users, documents and requests |
| Authentication | 9099 | Accepts any API key                  |
| Firestore      | 8080 | Enforces `firestore.rules`           |
| Cloud Storage  | 9199 | Enforces `storage.rules`             |

Emulator data is in-memory and discarded on exit. To keep it between runs:

```bash
npm run emulators:persist
```

## Reaching the emulators from a device

The host differs by target, which is why it is configurable via
`EXPO_PUBLIC_FIREBASE_EMULATOR_HOST`:

| Target           | Host to use           |
| ---------------- | --------------------- |
| iOS Simulator    | `localhost`           |
| Android emulator | `10.0.2.2`            |
| Physical device  | your machine's LAN IP |

`10.0.2.2` is the Android emulator's alias for the host machine's loopback — `localhost` inside the
emulator refers to the emulated device itself.

## Rules coverage by phase

Rules are added by the phase that introduces the collection, and the default is deny-all so a
missing rule fails closed rather than open.

| Collection / path                      | Added in | Status         |
| -------------------------------------- | -------- | -------------- |
| `users`                                | Phase 2  | ✅ Implemented |
| `blackSpots`                           | Phase 4  | ✅ Implemented |
| `alertLogs`                            | Phase 4  | ✅ Implemented |
| `incidentReports`                      | Phase 5  | ✅ Implemented |
| Storage `incidentReports/{uid}/{file}` | Phase 5  | ✅ Implemented |
| `emergencyContacts`                    | Phase 6  | ✅ Implemented |
| `adminAuditLogs`                       | Phase 7  | ✅ Implemented |
| `blackSpotCandidates`                  | Phase 10 | ✅ Implemented |
| `analysisJobs`                         | Phase 10 | ✅ Implemented |
| `reportRateLimits`                     | Phase 12 | ✅ Implemented |
| `reportFingerprints`                   | Phase 12 | ✅ Implemented |
| `deletedAccounts`                      | Phase 12 | ✅ Implemented |
| Storage (everything else)              | —        | ⬜ Denied      |

`tests/coverage.test.mjs` asserts this table cannot silently go stale: every name in `COLLECTIONS`
(`packages/shared-types/src/vocabulary.ts`) must have a `match` block, and every `match` block must
correspond to a name the codebase uses. A collection with no rule is denied by the catch-all — which
fails closed, but silently, and the resulting PERMISSION_DENIED says nothing about which rule is
missing.

Automated rules tests using `@firebase/rules-unit-testing` landed in Phase 7 — see `firebase/tests/`.
Run them with the emulators up:

```bash
npm run test:rules
```

145 assertions covering roles, ownership, rate limiting, duplicate detection, reporter privacy, the
Cloud Storage upload rules and the deny-all catch-all itself. They are deliberately **not** part of
`npm run verify`, which must stay runnable without an emulator; `npm run verify:all` runs both.

There is a second, heavier suite:

```bash
npm run test:functions
```

It needs the Auth, Firestore, Storage **and Functions** emulators, and it exercises account deletion
and data export end to end against real accounts. That is the only thing that can support the claim
"deletion actually removes the data" — the unit tests in `functions/src/__tests__/` prove what the
_policy_ is, and a deletion routine that silently missed a collection would pass every one of them.
It is how the wrong-Storage-bucket bug was found; see `functions/src/firebaseAdmin.ts`.

Note the suite runs with `--test-concurrency=1`. Every file shares one emulator and one project id,
so a parallel `clearFirestore()` wipes another file's fixtures mid-test — which is exactly what
happened before the flag was added.

Storage tests carry a wrinkle worth knowing: `env.clearStorage()` does **not** empty the bucket the
test contexts write to, so `tests/storage.test.mjs` derives its uids from the clock and every run
uses paths nothing has used before. Without that the suite passes once and fails for ever after,
because the `resource == null` overwrite guard refuses the second run's uploads.

The Phase 5 and 6 rules were originally verified with throwaway scripts driving the real client SDK
(34 and 27 checks). Those proved the rules worked at the time and nothing afterwards; the properties
worth keeping are now pinned in `firebase/tests/`.

## Key security properties already enforced

- A user document is readable only by its owner, and there is no `list` permission — the collection
  cannot be queried, so membership and email addresses are not enumerable.
- `role` cannot be set on create (it is pinned to `"user"`) or changed on update. Without this, any
  client could grant itself admin and approve its own incident reports.
- `id`, `email` and `createdAt` are immutable after creation.
- Profile shape and the 100–2000 m alert radius are validated server-side as well as client-side, so
  a tampered client cannot store values that break alerting.
- Client-side deletes are refused; account deletion goes through the `deleteAccount` Cloud Function
  so the Auth record, the Storage objects and the owned documents are removed together instead of
  being orphaned.
- Every client-written shape is closed with `hasOnly`, so a document cannot carry fields nobody
  validates — without it, a profile is an unbounded write target and the database is free storage.
- Every timestamp a client writes must equal `request.time`, which only `serverTimestamp()`
  satisfies. A device clock can be wrong and can be set deliberately: without this a report could be
  backdated to distort the Phase 10 clustering, or a rate-limit counter forward-dated to escape its
  own window.

### Submission limits (Phase 12)

Report creation is refused unless the caller's rate-limit counter and duplicate fingerprint are
written in the **same commit**, which the rules detect with `getAfter()` plus `== request.time`.
This is how a limit is enforced on a document the limited party writes themselves. The mechanism,
the numbers and every bypass that was closed are documented in
[`docs/security-and-privacy.md`](../docs/security-and-privacy.md).

### Incident reports (Phase 5)

- **A client can only ever create a report as `pending`.** Any other `status` value is rejected
  outright, so a tampered client cannot publish an approved report.
- **`verified`, `moderationNotes`, `reviewedBy` and `reviewedAt` may not appear on a client write at
  all.** They are set by a moderator through the Admin SDK in Phase 7, which bypasses these rules.
- **No client update or delete path exists**, so a report cannot be edited into a different status,
  rewritten under a review, or removed once it is evidence behind a published warning.
- Reports are readable only by their author. Approved or not, they are never a public feed —
  publication means an administrator creating a `blackSpots` document, which is a separate act.
- The document shape is validated server-side with `hasOnly`, so an unexpected field is refused
  rather than stored.

### Emergency contacts (Phase 6)

- **No read path exists for anyone but the owner** — not for moderators, not for admins, not for any
  future feature. A contact list is not moderation evidence, and every document is a real person's
  name and number held by somebody else who never agreed to be there.
- Full CRUD is granted to the owner, unlike incident reports. A wrong number the user cannot correct
  is worse than useless in an emergency, so edit and delete are first-class rather than routed
  through a Cloud Function.
- `userId` and `createdAt` are immutable, so a contact cannot be reassigned to another account.
- The shape is validated with `hasOnly`, so an unexpected field — a notes box, an address — is
  refused rather than quietly stored.
- Note there is **no server-side cap** on the number of contacts. Firestore rules cannot count
  documents without a read per evaluation, so the limit of 5 is a client-side usability guard and is
  documented as such in `contactSchemas.ts` rather than pretended to be a security control.

### Storage (Phase 5)

- Writes are confined to `incidentReports/{uid}/…`, where the uid is a path segment compared against
  `request.auth.uid` — there is no way to write into another user's prefix.
- Content types are **allow-listed** (JPEG, PNG, WebP, HEIC/HEIF) rather than matched as `image/*`.
  A wildcard would admit SVG, which is an executable document format and a hazard for any
  browser-based moderation dashboard.
- A 5 MB per-object cap is enforced server-side, mirroring the client constant.
- Overwrites are refused via `resource == null` on create. `allow update: if false` alone is **not**
  sufficient — verified against the emulator, re-uploading to an existing path is evaluated as
  `create`, not `update`.
- Note that a `getDownloadURL()` link carries a token that grants access without re-evaluating these
  rules. That is Firebase behaviour: treat any such URL stored in a report as a capability.

### Roles and the audit trail (Phase 7)

- The role is read from **`request.auth.token.role`**, a Firebase Auth custom claim, never from
  `users/{id}.role`. A claim costs no document read, cannot recurse into the rules for the document
  being checked, and can only be written by the Admin SDK — so a user who somehow gained write
  access to their own profile still could not escalate.
- **No role grants a write anywhere in the rules.** Privileged writes happen only through the Admin
  SDK in the dashboard's server actions, which bypasses rules by design. The practical effect is
  that there is no client-side approval path at all — not for a user, a moderator, or an admin with
  a stolen mobile token. Authorisation for the Admin SDK path lives in `evaluateModerationDecision`
  in `packages/shared-types`, which is tested separately.
- `adminAuditLogs` is **readable by moderators and admins, writable by nobody**. Entries come only
  from the Admin SDK, committed in the same transaction as the action they record — so an action
  cannot occur without its log entry. An audit trail the audited can append to, amend or delete is
  not an audit trail.
- The trail deliberately stores no copy of the target document: `buildAuditDetails` keeps scalars
  only and truncates strings, so a report's free text and coordinates cannot be duplicated into a
  collection with different access rules and no deletion path.
