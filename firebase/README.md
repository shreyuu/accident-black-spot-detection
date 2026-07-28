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
| `emergencyContacts`                    | Phase 6  | ⬜ Denied      |
| `adminAuditLogs`                       | Phase 7  | ⬜ Denied      |
| Storage (everything else)              | —        | ⬜ Denied      |

Automated rules tests using `@firebase/rules-unit-testing` arrive in Phase 7, alongside the admin
role model they are most needed to verify. Phase 12 reviews the complete rule set.

The Phase 5 rules were verified manually against a running emulator with the real client SDK — 34
checks covering every allow and deny path listed below, including two separate signed-in accounts to
confirm cross-user reads and writes are refused. That was a throwaway script, not a committed test;
the automated equivalent is Phase 7 work.

## Key security properties already enforced

- A user document is readable only by its owner, and there is no `list` permission — the collection
  cannot be queried, so membership and email addresses are not enumerable.
- `role` cannot be set on create (it is pinned to `"user"`) or changed on update. Without this, any
  client could grant itself admin and approve its own incident reports.
- `id`, `email` and `createdAt` are immutable after creation.
- Profile shape and the 100–2000 m alert radius are validated server-side as well as client-side, so
  a tampered client cannot store values that break alerting.
- Client-side deletes are refused; account deletion goes through a Cloud Function in Phase 12 so the
  Auth record and owned data are removed together instead of being orphaned.

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
