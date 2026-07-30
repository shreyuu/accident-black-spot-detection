# Continuation prompt — start of Phase 8

Copy everything below the line into the new chat.

---

I am continuing a phased build of a React Native / Expo application called **Accident Black Spot
Detection**. Phases 0–7 are complete and approved. **Start at Phase 8.**

Working directory: `/Users/shreyu/VSCODE/Projects/accident-black-spot-detection`
Git: repo `git@github.com:shreyuu/accident-black-spot-detection.git`. **Current branch is
`changes&fixes`**, not `main`, and it tracks `origin/changes&fixes`. Phases 1–6 are committed; the
whole of Phase 7 is **uncommitted** in the working tree (13 paths). Do not commit or push unless I
ask.

## Read these first

- `README.md` — build status, setup, how to run, known limitations
- `docs/phase-0-audit.md` — repository audit, verified toolchain, dependency table, risk register,
  and the ordered 15-phase plan with per-phase acceptance gates
- `docs/adr/0001-platform-and-stack.md` — the technology decisions and their trade-offs
- `firebase/README.md` — emulator setup, which rules exist per phase, and the security properties
  each phase enforces

## What the app is

A road-safety app that warns users when they approach accident-prone or crime-prone "black spots".
Users report incidents; moderators approve them in a web dashboard; an analytics service later
clusters approved reports and mines patterns with ECLAT to propose new black spots.

**Safety and honesty rules that override convenience.** The app must never imply it guarantees
accident prevention, crime prevention, medical or police response, SMS delivery, perfect location
accuracy, or complete coverage. Risk must never be communicated by colour alone. Unapproved reports
must never appear as official black spots. Nobody may approve their own report, enforced server-side
rather than in the UI. Store the minimum personal data necessary; do not keep continuous location
history.

## Stack (verified working, do not "upgrade" casually)

Expo SDK 57.0.8 · React Native 0.86.0 · React 19.2.3 · TypeScript 6.0.3 (strict, plus
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`) · Expo Router · Firebase JS SDK 12.16 ·
firebase-admin 14.2.0 · Next.js 16.2.12 · TanStack Query 5 · Zod 4 · react-native-maps 1.27.2 ·
Jest 29 + jest-expo + RNTL 14 · `node:test` for the non-RN workspaces · npm workspaces.

**Always install native/Expo packages with `npx expo install`, never plain `npm install`** — plain
npm resolves majors the SDK does not support.

## Current state

- **Four workspaces**: `apps/mobile`, `apps/admin`, `packages/shared-types`, `firebase`.
  `services/analytics` does not exist yet (Phase 10).
- **549 tests in the default gate** — 510 mobile (25 Jest suites) + 39 shared-types (`node:test`).
- **43 Firestore rules tests** run separately against the emulator.
- `npm run verify` (format → lint → typecheck → test) is green and needs **no** emulator.
  `npm run verify:all` adds the rules suite. `npm run test:rules` runs it alone.

### Delivered so far

- **Phase 1** — app shell, Expo Router, strict TS, ESLint/Prettier, Zod-validated env, error
  boundary, `AppError` normalisation, logger, design system, 14 reusable components.
- **Phase 2** — Firebase Emulator Suite (project `demo-accident-black-spot-detection`), auth
  service, user profile repository, `AuthProvider`, route guards, RHF+Zod forms, Firebase error
  mapping that deliberately does not allow account enumeration.
- **Phase 3** — `expo-location`, a permission flow that explains itself before the OS prompt and
  handles `undetermined` / `granted` / `denied` / `blocked` distinctly, `src/utils/geo.ts`, map
  screen, black spot detail route.
- **Phase 4** — `blackSpots` and `alertLogs` rules and indexes, geohash bounding-box repository with
  Haversine refinement, AsyncStorage offline cache, and a **pure, heavily tested proximity engine**
  (`src/features/alerts/proximityEngine.ts`) with enter detection, exit-plus-buffer hysteresis,
  cooldown, overlap folding and risk prioritisation. Alert delivery via in-app banner + local
  notification + haptics, driven by `useProximityAlerts` off a `watchPositionAsync` stream.
- **Phase 5** — incident reporting: form, image picker, Storage upload with progress/cancel/retry,
  `status: "pending"`, "My reports". Pure cores in `reportDocument.ts` / `reportImages.ts` /
  `submitIncidentReport.ts`.
- **Phase 6** — emergency contacts CRUD and SOS: a 3-second cancellable countdown, a message with
  coordinates, accuracy disclosure, map link and timestamp, `expo-sms`, plus copy/share/call
  fallbacks. Pure cores in `sosMessage.ts` / `sosCountdown.ts` / `phoneNumber.ts`.
- **Phase 7** — `packages/shared-types` (vocabulary + `evaluateModerationDecision`), a Next.js
  moderation dashboard at `apps/admin`, custom-claim roles, `adminAuditLogs` written in the same
  transaction as every privileged action, and the first automated Firestore rules tests.

## Hard-won gotchas — these cost real time to find, do not rediscover them

1. **`getReactNativePersistence` is missing from `firebase@12`'s typed surface.** It exists at
   runtime; worked around by `apps/mobile/types/firebase-auth-rn.d.ts`. Auth persistence is
   SecureStore-backed with chunking, because SecureStore keys must match `/^[\w.-]+$/` and Android
   caps values near 2 KB.
2. **Firestore `getDocs` does not throw when offline** — it resolves from its own empty local cache
   and returns `[]`, indistinguishable from "nothing here". Every repository checks
   `snapshot.metadata.fromCache` and throws a network `AppError` instead. Preserve this.
3. **`connectFirestoreEmulator` throws across Fast Refresh.** Emulator settings are supplied to
   `initializeFirestore` at creation instead. Emulator connection state is tracked **per service**.
4. **A Firestore converter's `toFirestore` runs on the data being written** — an earlier version
   stripped the `serverTimestamp()` sentinels and every write failed with an opaque PERMISSION_DENIED.
5. **A marker tap also fires `MapView.onPress`.** Guard on `event.nativeEvent.action !== 'marker-press'`.
6. **RNTL 14 made `render` and `fireEvent` async.** A missing `await` typechecks fine and fails at runtime.
7. **Android suppresses the Play Services "Location Accuracy" dialog** (`mayShowUserSettingsDialog:
   false`) and falls back to low accuracy on `ERR_LOCATION_SETTINGS_UNSATISFIED`.
8. **The React Compiler ESLint rules are strict.** No `setState` in an effect for derived state, no
   writing refs during render, and **no calling `Date.now()` during render** — that last one is why
   `src/utils/useNow.ts` exists. All three caught real problems.
9. **Android map tiles do not render under Expo Go** — its bundled Google Maps key fails
   authorisation. Needs `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID`, wired through `app.config.ts`.
   iOS is fine (Apple Maps). **A development build will need this key too.**
10. **The iOS simulator's location resets to San Francisco**, and `simctl` text injection truncates
    typed strings unpredictably — always verify a field from a screenshot before submitting.
11. **`import * as Notifications from 'expo-notifications'` throws at import time on Android under
    Expo Go** (SDK 53+ removed it). It cascaded into "Cannot read property 'ErrorBoundary' of
    undefined" and made the entire tab group unreachable. `alertDelivery.ts` now loads it lazily
    behind a `try`/`catch` `require`. **There is a `TODO(phase-8)` there**: once the development
    build exists, this can revert to a static import — but only if the app never runs under Expo Go
    again.
12. **Firebase Storage uploads do not time out usefully by default.** With the emulator stopped, an
    upload sat at 0% for over eight minutes and never surfaced an error. `getFirebaseStorage()` now
    sets `maxUploadRetryTime` (45 s) and `maxOperationRetryTime` (20 s), and the form has a Cancel.
13. **The app-wide TanStack `staleTime` is 5 minutes** (right for black spots, wrong for anything
    whose staleness misleads). "My reports" and emergency contacts override it to `staleTime: 0`
    with `refetchOnMount: 'always'`.
14. **A Zod schema that closes over `Date.now()` freezes the clock at module load.** The report form
    rejected "now" as being in the future on a session left open. `buildIncidentReportFormSchema`
    takes a clock **function** read inside each refinement.
15. **Storage rules: overwriting an existing object is evaluated as `create`, not `update`.**
    `allow update: if false` alone does not prevent it — `resource == null` on create does.
16. **The Firestore emulator prints "evaluation error at L…" for ordinary denials.** It is a generic
    deny diagnostic, identical regardless of cause; it does not mean a rule threw.
17. **`node --test` runs files in parallel.** With one shared emulator and one project id, each
    file's `clearFirestore()` wipes another's fixtures. The rules suite runs with
    `--test-concurrency=1`; this is load-bearing, not tidiness.
18. **`eslint-config-next` 16 ships native flat configs.** Wrapping it in `FlatCompat` throws
    "Converting circular structure to JSON". Spread `eslint-config-next/core-web-vitals` directly.
19. **`packages/shared-types` is consumed as TypeScript source** with explicit `.ts` extensions in
    its internal imports (Node's native type stripping needs them). Both consuming apps therefore
    set `allowImportingTsExtensions: true`. Neither emits, so it changes no output.
20. **Next 16 does not expose server-action ids in the HTML**, so server actions cannot be invoked
    with `curl`. Drive them through the browser, or test the logic they call directly.

## How to run

```bash
npm install
cp .env.example apps/mobile/.env                       # emulator defaults work as-is
cp apps/admin/.env.local.example apps/admin/.env.local # same
```

Terminal 1: `npm run emulators` (UI at http://localhost:4000). Terminal 2:

```bash
npm run seed -- 37.7749 -122.4194   # pass the coords your simulator reports
npm run ios                         # or npm run android
npm run verify                      # no emulator needed
npm run test:rules                  # emulators must be running
```

For the dashboard (http://localhost:3000):

```bash
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
npm run grant-role -- you@example.test admin   # the account must already exist
npm run admin
```

The seed writes 7 black spots: 5 verified+active, plus 1 unverified and 1 inactive that must **never**
appear in the app — they exist to prove the filtering works.

## Known issues carried into Phase 8

- **Verify this first:** Phase 7 moved the domain enums into `packages/shared-types` and
  `apps/mobile/src/types/domain.ts` now re-exports them. Typecheck and all 510 mobile tests pass,
  but **the mobile app was not relaunched afterwards**, so Metro resolving the workspace TS package
  at runtime is expected rather than verified. One `npm run ios` settles it.
- **The registration screen would not submit on the iOS simulator.** Pressing "Create account"
  produced no state change and no log, while the same `AppButton` worked everywhere else. Worked
  around throughout Phases 5–7 by creating accounts via the Auth emulator REST API and signing in.
  Undiagnosed, Phase 2 code, and worth a look.
- `expo-notifications` is limited under Expo Go — gotcha 11. **Phase 8's development build is the fix.**
- Proximity zone state is in-memory; force-quitting mid-zone re-alerts on return. **Persisting it is
  Phase 8 work.**
- Android map tiles blank without a Google Maps key. Android alert flow still not validated end to end.
- Report photo thumbnails do not load on the Android emulator when uploaded from iOS — the download
  URLs embed `localhost:9199`. Emulator artefact only.
- The dashboard session is an ID token, so it expires after an hour and a role change takes up to an
  hour to apply. `createSessionCookie` is Phase 12.
- Role granting is a script, not a screen. Deliberate for the first admin; a screen is Phase 12.
- The real-project Admin SDK path (`FIREBASE_SERVICE_ACCOUNT_JSON`) is written but never exercised.
- Theme preference is not persisted (Phase 11). Icons/splash are placeholders (Phase 14).
- Physical-device testing has not been done (Phase 13). Emulators only, never a real Firebase project.
- ~46 `npm audit` advisories, all transitive dev tooling, not fixable without breaking Expo.

## Phase 8 — Background monitoring and a development build

From the plan: _"Development build; `expo-task-manager` background task, Android foreground service,
iOS background mode, opt-in toggle, battery disclosure."_
**Key gate:** a notification fires from a background location update; disabling the toggle stops
updates; the OS's background-execution limits are documented honestly.

1. Create an Expo **development build** for iOS and Android (this replaces Expo Go and is what makes
   `expo-notifications` and a custom background task work at all). Document the build commands and
   what changes for day-to-day development.
2. Add `expo-task-manager` and a background location task that runs the **existing** proximity
   engine — do not fork or duplicate that logic.
3. Android: foreground service with its notification. iOS: the background location mode. Both are
   configured in `app.config.ts`; the location plugin's background flags are currently `false` and
   there are comments explaining why they were deliberately left off until this phase.
4. Background monitoring must be **opt-in and off by default**. `UserProfile.backgroundMonitoringEnabled`
   already exists and already defaults to `false`. Add the Settings toggle, and an honest battery and
   privacy disclosure shown *before* the user enables it.
5. Persist proximity zone state so force-quitting mid-zone does not re-alert on return.
6. Document the OS limits truthfully: iOS may defer or coalesce background updates, Android's
   Doze and manufacturer battery managers can suspend the task entirely, and neither platform
   guarantees delivery. The app must not imply continuous monitoring it cannot provide.

## How I want you to work

- Inspect before editing. Do not overwrite working code unnecessarily.
- No `any` without a documented reason. Do not disable TypeScript or lint rules to hide errors.
- Keep UI, services and business logic separate. Business-critical logic goes in pure, tested
  functions — `proximityEngine.ts`, `sosCountdown.ts` and `evaluateModerationDecision` are the pattern.
- Comment the _why_, especially for anything non-obvious or safety-relevant. Do not narrate the _what_.
- Validate at both client and server boundaries. Use Firebase server timestamps. Use batched writes
  or transactions where consistency matters.
- Mark unfinished work with explicit `TODO(phase-N)` comments. Never present a stub as complete.
- **Verify, do not assume.** Run the code. If something cannot be verified, say so plainly rather
  than implying it works.
- Report failures honestly with the actual output.
- **Keep verification token-efficient.** Prefer automated tests and text-based checks over
  screenshot-heavy simulator walkthroughs; ask before doing a long interactive pass.

At the end of the phase, stop and report using exactly this structure, then wait for my approval:

```
PHASE COMPLETED:
IMPLEMENTED:
FILES CREATED:
FILES MODIFIED:
COMMANDS RUN:
VALIDATION RESULTS:   (TypeScript / ESLint / Tests / Rules / iOS / Android)
ASSUMPTIONS:
KNOWN ISSUES:
HOW TO RUN:
NEXT PHASE:
```

Begin Phase 8.
