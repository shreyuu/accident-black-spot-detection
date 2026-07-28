# Continuation prompt — start of Phase 5

Copy everything below the line into the new chat.

---

I am continuing a phased build of a React Native / Expo application called **Accident Black Spot
Detection**. Phases 0–4 are complete and approved. **Start at Phase 5.**

Working directory: `/Users/shreyu/VSCODE/Projects/accident-black-spot-detection`
Git: repo `git@github.com:shreyuu/accident-black-spot-detection.git`, branch `main`. Nothing has been
committed since the initial commit — all work is uncommitted in the working tree. Do not commit or
push unless I ask.

## Read these first

- `README.md` — build status, setup, how to run, known limitations
- `docs/phase-0-audit.md` — repository audit, verified toolchain, dependency table, risk register,
  and the ordered 15-phase plan with per-phase acceptance gates
- `docs/adr/0001-platform-and-stack.md` — the technology decisions and their trade-offs
- `firebase/README.md` — emulator setup and which security rules exist per phase

## What the app is

A road-safety app that warns users when they approach accident-prone or crime-prone "black spots".
Users can report incidents; administrators approve them; an analytics service later clusters approved
reports and mines patterns with ECLAT to propose new black spots. The full original brief defines 15
phases; phases 5–15 remain.

**Safety and honesty rules that override convenience.** The app must never imply it guarantees
accident prevention, crime prevention, medical or police response, SMS delivery, perfect location
accuracy, or complete coverage. Risk must never be communicated by colour alone. Unapproved reports
must never appear as official black spots. Users must not be able to approve their own reports, and
that is enforced server-side, not in the UI. Store the minimum personal data necessary; do not keep
continuous location history.

## Stack (verified working, do not "upgrade" casually)

Expo SDK 57.0.8 · React Native 0.86.0 · React 19.2.3 · TypeScript 6.0.3 (strict, plus
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`) · Expo Router · Firebase JS SDK 12.16 ·
TanStack Query 5 · Zod 4 · react-native-maps 1.27.2 · Jest 29 + jest-expo + RNTL 14 · npm workspaces.

**Always install native/Expo packages with `npx expo install`, never plain `npm install`** — plain
npm resolves majors the SDK does not support (TypeScript 7, AsyncStorage 3, ESLint 10, Jest 30).

## Current state

- 15 test suites, **339 tests passing**. `npm run verify` (format → lint → typecheck → test) is green.
- Structure: `apps/mobile` (Expo app), `firebase/` (rules, indexes, seed script), `docs/`.
  `apps/admin`, `services/analytics` and `packages/shared-types` do not exist yet.
- `apps/mobile/src/` is split into `components/`, `config/`, `constants/`, `features/`, `providers/`,
  `services/`, `theme/`, `types/`, `utils/`. Absolute imports via `@/`.

### Delivered so far

- **Phase 1** — app shell, Expo Router, strict TS, ESLint/Prettier, Zod-validated env
  (`src/config/env.ts`), error boundary, `AppError` normalisation, logger, design system with
  light/dark themes, 12 reusable components.
- **Phase 2** — Firebase Emulator Suite (project id `demo-accident-black-spot-detection`), auth
  service, user profile repository, `AuthProvider`, route guards, RHF+Zod forms, Firebase error
  mapping that deliberately does **not** allow account enumeration.
- **Phase 3** — `expo-location`, permission flow that explains itself _before_ the OS prompt and
  handles `undetermined` / `granted` / `denied` / `blocked` distinctly, `src/utils/geo.ts` (Haversine,
  destination point, distance formatting), map screen, black spot detail route.
- **Phase 4** — `blackSpots` and `alertLogs` Firestore rules and indexes; `blackSpotRepository` using
  geofire-common geohash bounding boxes plus Haversine refinement; offline cache in AsyncStorage;
  **pure, heavily-tested proximity alert engine** (`src/features/alerts/proximityEngine.ts`) with
  enter detection, exit-plus-buffer hysteresis, cooldown, overlap folding and risk prioritisation;
  alert delivery via in-app banner + local notification + haptics; `useProximityAlerts` driving it
  from a `watchPositionAsync` stream.

## Hard-won gotchas — these cost real time to find, do not rediscover them

1. **`getReactNativePersistence` is missing from `firebase@12`'s typed surface.** The umbrella
   `firebase` package's `./auth` subpath has no `react-native` export condition. It exists at runtime.
   Worked around by `apps/mobile/types/firebase-auth-rn.d.ts`. Auth persistence is SecureStore-backed
   with chunking, because SecureStore keys must match `/^[\w.-]+$/` and Android caps values near 2 KB.
2. **Firestore `getDocs` does not throw when offline** — it resolves from its own empty local cache
   and returns `[]`, which is indistinguishable from "nothing here". The repository checks
   `snapshot.metadata.fromCache` and throws a network `AppError` instead. Preserve this.
3. **`connectFirestoreEmulator` throws across Fast Refresh.** Emulator settings are supplied to
   `initializeFirestore` at creation instead. Emulator connection state is tracked **per service**.
4. **A Firestore converter's `toFirestore` runs on the data being written** — an earlier version
   stripped the `serverTimestamp()` sentinels and every write was rejected by the rules with an opaque
   PERMISSION_DENIED.
5. **A marker tap also fires `MapView.onPress`.** Guard on `event.nativeEvent.action !== 'marker-press'`.
6. **RNTL 14 made `render` and `fireEvent` async.** Missing `await` typechecks fine and fails at runtime.
7. **Android suppresses the Play Services "Location Accuracy" dialog** (`mayShowUserSettingsDialog:
false`) and falls back to low accuracy on `ERR_LOCATION_SETTINGS_UNSATISFIED`.
8. **The React Compiler ESLint rules are strict**: no `setState` in an effect for derived state, no
   writing refs during render. Both are enforced and both caught real problems.
9. **Android map tiles do not render** — Expo Go's bundled Google Maps key fails authorisation. Needs
   `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID`, already wired through `app.config.ts`. iOS is fine
   (Apple Maps).
10. **The iOS simulator's location resets to San Francisco** and `simctl` text injection sometimes
    truncates typed strings — verify field contents from a screenshot before submitting a form.

## How to run

```bash
npm install
cp .env.example apps/mobile/.env    # emulator defaults work as-is
```

Terminal 1: `npm run emulators` (UI at http://localhost:4000). Terminal 2 seed, then run:

```bash
npm run seed -- 37.7749 -122.4194   # pass the coords your simulator reports
npm run ios
npm run verify
```

The seed writes 7 records: 5 verified+active, plus 1 unverified and 1 inactive that must **never**
appear in the app — they exist to prove the filtering works.

## Known issues carried into Phase 5

- Android map tiles blank without a Google Maps key (above). Android alert flow not yet validated.
- `expo-notifications` is limited under Expo Go since SDK 53; the in-app banner is unaffected.
  A development build in Phase 8 resolves it.
- No automated Firestore rules tests yet — `@firebase/rules-unit-testing` is scheduled for Phase 7.
- Proximity zone state is in-memory; force-quitting mid-zone re-alerts on return. Persisting it is
  Phase 8 work.
- Theme preference is not persisted (Phase 11). Icons/splash are placeholders (Phase 14).
- Physical-device testing has not been done (Phase 13). Emulators only, never a real Firebase project.
- ~45 `npm audit` advisories, all transitive dev tooling, not fixable without breaking Expo.

## Phase 5 — Crowdsourced Incident Reporting

Build the report submission flow.

1. Report form: incident type, description, severity, current location with optional manual marker
   adjustment, optional occurrence date/time, optional photograph.
2. Validate description length, latitude/longitude validity, supported file type, image file-size
   limit, and maximum number of images.
3. Use `expo-image-picker` for both camera and photo library.
4. Upload images to Firebase Storage. Replace the current deny-all `firebase/storage.rules` with
   per-user paths, an image-only content-type restriction and a size cap.
5. Reports are created with `status: "pending"`.
6. Add submission confirmation, upload progress, retry after a failed upload, and protection against
   accidental double submission.
7. Build a "My Reports" screen showing pending / approved / rejected with moderation notes where
   available.
8. Reports must **never** be converted into public black spots automatically. Firestore rules must
   forbid a user setting `status`, `verified`, `reviewedBy` or `reviewedAt` at all — that is the rule
   which stops the reporting flow from becoming a way to publish unverified warnings.

**Acceptance criteria:** a logged-in user can submit a valid report; the report contains coordinates
and a timestamp; an optional image uploads successfully; the report is stored as pending; it does not
appear as an official black spot before approval; the user can view its status; a failed upload shows
a recoverable error.

The `IncidentReport` model from the brief: `id, reporterId, type ("accident" | "crime" | "pothole" |
"unsafe-road" | "other"), description, latitude, longitude, geohash, severity ("low" | "medium" |
"high"), occurredAt?, imageUrls[], status ("draft" | "pending" | "approved" | "rejected"),
moderationNotes?, reviewedBy?, reviewedAt?, createdAt, updatedAt`.

## How I want you to work

Follow the same standard as the previous phases:

- Inspect before editing. Do not overwrite working code unnecessarily.
- No `any` without a documented reason. Do not disable TypeScript or lint rules to hide errors.
- Keep UI, services and business logic separate. Business-critical logic goes in pure, tested
  functions — the proximity engine is the pattern to follow.
- Comment the _why_, especially for anything non-obvious or safety-relevant. Do not narrate the _what_.
- Validate at both client and server boundaries. Use Firebase server timestamps. Use batched writes or
  transactions where consistency matters.
- Mark unfinished work with explicit `TODO(phase-N)` comments. Never present a stub as complete.
- **Verify, do not assume.** Run the code. Test on the iOS simulator and, where meaningful, the
  Android emulator. If something cannot be verified, say so plainly rather than implying it works.
- Report failures honestly with the actual output.

At the end of the phase, stop and report using exactly this structure, then wait for my approval:

```
PHASE COMPLETED:
IMPLEMENTED:
FILES CREATED:
FILES MODIFIED:
COMMANDS RUN:
VALIDATION RESULTS:   (TypeScript / ESLint / Tests / iOS / Android)
ASSUMPTIONS:
KNOWN ISSUES:
HOW TO RUN:
NEXT PHASE:
```

Begin Phase 5.
