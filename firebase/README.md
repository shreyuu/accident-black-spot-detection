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

| Collection / path   | Added in | Status         |
| ------------------- | -------- | -------------- |
| `users`             | Phase 2  | ✅ Implemented |
| `blackSpots`        | Phase 4  | ⬜ Denied      |
| `incidentReports`   | Phase 5  | ⬜ Denied      |
| `emergencyContacts` | Phase 6  | ⬜ Denied      |
| `alertLogs`         | Phase 4  | ⬜ Denied      |
| `adminAuditLogs`    | Phase 7  | ⬜ Denied      |
| Storage (all)       | Phase 5  | ⬜ Denied      |

Automated rules tests using `@firebase/rules-unit-testing` arrive in Phase 7, alongside the admin
role model they are most needed to verify. Phase 12 reviews the complete rule set.

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
