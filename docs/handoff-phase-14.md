# Continuation prompt — start of Phase 14

Copy everything below the line into the new chat.

---

I am continuing a phased build of a React Native / Expo application called **Accident Black Spot
Detection**. Phases 0–13 are complete and approved. **Start at Phase 14.**

Working directory: `/Users/shreyu/VSCODE/Projects/accident-black-spot-detection`
Git: repo `git@github.com:shreyuu/accident-black-spot-detection.git`. **Current branch is
`changes&fixes`**, not `main`. Everything through Phase 13 is committed; HEAD is `ee5e4d5` and the
working tree is clean. Do not commit or push unless I ask.

## Read these first

- `README.md` — build status, setup, how to run, known limitations
- `docs/phase-0-audit.md` — repository audit, verified toolchain, risk register, and the ordered
  15-phase plan with per-phase acceptance gates (§7)
- `docs/adr/0001-platform-and-stack.md` — technology decisions and trade-offs
- `docs/security-and-privacy.md` — what Phase 12 enforces, where, and what it explicitly does not
- `docs/manual-test-plan.md` — the 20 manual scenarios, with per-platform results from Phase 13
- `firebase/README.md` — emulator setup, rules per phase, and the properties each phase enforces
- `docs/settings-and-offline.md`, `docs/background-monitoring.md`, `docs/nearby-places.md`,
  `docs/eclat-methodology.md` — Phase 8–11 design documents

## What the app is

A road-safety app that warns users when they approach accident-prone or crime-prone "black spots".
Users report incidents; moderators approve them in a web dashboard; an analytics service clusters
approved reports and mines patterns with ECLAT to propose new black spot candidates.

**Safety and honesty rules that override convenience.** The app must never imply it guarantees
accident prevention, crime prevention, medical or police response, SMS delivery, perfect location
accuracy, or complete coverage. Risk must never be communicated by colour alone. Unapproved reports
must never appear as official black spots. Nobody may approve their own report, enforced server-side
rather than in the UI. An algorithm must never publish a warning on its own. Store the minimum
personal data necessary; do not keep continuous location history.

## Stack (verified working, do not "upgrade" casually)

Expo SDK 57.0.8 · React Native 0.86.0 · React 19.2.3 · TypeScript 6.0.3 (strict, plus
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`) · Expo Router · Firebase JS SDK 12.16 ·
firebase-admin 14.2 (JS) / 7.5 (Python) · **firebase-functions 7.3.2** · Next.js 16.2.12 ·
TanStack Query 5 · Zod 4 · react-native-maps 1.27.2 · Jest 29 + jest-expo + RNTL 14 · `node:test`
for the non-RN workspaces · Python 3.14.6 + uv + FastAPI + scikit-learn + pytest/ruff/mypy ·
npm workspaces.

**Always install native/Expo packages with `npx expo install`, never plain `npm install`.**

## Current state

- **Six workspaces**: `apps/mobile`, `apps/admin`, `packages/shared-types`, `firebase`,
  **`functions`** (Cloud Functions, added Phase 12), and `services/analytics` (Python, not an npm
  workspace).
- **1,016 tests in the default JS gate** — 887 mobile (41 Jest suites) + 60 shared-types + 42
  functions + 16 scripts + 11 admin.
- **151 Firestore/Storage rules tests** (`npm run test:rules`, emulators required).
- **8 end-to-end function tests** (`npm run test:functions`, Auth+Firestore+Storage+Functions
  emulators required).
- **293 Python tests** (`npm run analytics:verify`, no emulator or network needed).
- `npm run verify` (format → lint → typecheck → test → script tests → **secret scan**) is green and
  needs **no** emulator. `npm run verify:all` adds Python, rules and the function integration tests.
  All green.
- Mobile line coverage is **48%**. Deliberate shape: pure safety-critical cores are covered
  thoroughly, presentational components and hooks are thin.

### Delivered so far

- **Phase 1** — app shell, Expo Router, strict TS, ESLint/Prettier, Zod-validated env, error
  boundary, `AppError` normalisation, logger, design system, reusable components.
- **Phase 2** — Firebase Emulator Suite (project `demo-accident-black-spot-detection`), auth
  service, user profile repository, `AuthProvider`, route guards, RHF+Zod forms, Firebase error
  mapping that deliberately does not allow account enumeration.
- **Phase 3** — `expo-location`, a permission flow that explains itself before the OS prompt,
  `src/utils/geo.ts`, map screen, black spot detail route.
- **Phase 4** — `blackSpots`/`alertLogs` rules and indexes, geohash bounding-box repository with
  Haversine refinement, AsyncStorage offline cache, and a **pure, heavily tested proximity engine**
  (`proximityEngine.ts`) with hysteresis, cooldown, overlap folding and risk prioritisation.
- **Phase 5** — incident reporting: form, image picker, Storage upload with progress/cancel/retry,
  `status: "pending"`, "My reports". Pure cores in `reportDocument.ts` / `reportImages.ts` /
  `submitIncidentReport.ts`.
- **Phase 6** — emergency contacts CRUD and SOS: 3-second cancellable countdown, message with
  coordinates + accuracy disclosure + map link, `expo-sms`, copy/share/call fallbacks.
- **Phase 7** — `packages/shared-types`, a Next.js moderation dashboard at `apps/admin`,
  custom-claim roles, `adminAuditLogs` written in the same transaction as every privileged action,
  and the first automated Firestore rules tests.
- **Phase 8** — development build (`expo-dev-client`), `expo-task-manager` background location task
  running the **existing** proximity engine headlessly, Android foreground service, iOS background
  mode, opt-in toggle behind a battery/privacy disclosure, persisted zone state.
- **Phase 9** — `NearbyPlace` abstraction, **keyless** OpenStreetMap/Overpass provider as the
  default with an optional Google Places provider behind the same interface, ordered fallback chain,
  offline cache, "Nearby help" screen reached from SOS.
- **Phase 10** — `services/analytics`: FastAPI, cleaning/dedupe, DBSCAN on the haversine metric,
  **hand-written ECLAT cross-validated against `mlxtend.fpgrowth`** across 85 seeded cases, a
  versioned 0–100 risk score, and `blackSpotCandidates` + `analysisJobs` that no client may write
  and the mobile app cannot read at all.
- **Phase 11** — preferences persisted to the account **and** mirrored locally, Settings controls,
  an **offline draft queue** for reports that survives a restart and retries with backoff, and an
  accessibility pass that **measured** contrast and found two real WCAG failures.
- **Phase 12** — full Firestore + Storage rules review, rate limiting and duplicate detection
  enforced **in the rules** via batch coupling, account deletion + data export as Cloud Functions,
  reporter pseudonymisation in the dashboard, `createSessionCookie` with revocation, a `/roles`
  screen, and a repeatable secret scanner wired into `verify`.
- **Phase 13** — first device pass since Phase 7 on **both Android and iOS**, safety-critical screen
  tests, the 20-scenario manual test plan with recorded results, and **one real bug found and
  fixed** (below).

## What Phase 13 found — read this, it is the interesting part

**A Firestore rules bug that had survived since Phase 2.** `hasNoPrivilegedFields` was called with
the Set from `diff().affectedKeys()` but implemented as though it received a Map, so it called
`.keys()` on a Set. The rules engine raised "Function not found: keys", and an erroring rule is a
denial — so **every** profile update was refused and **saving a preference to your account had never
once worked**.

Nothing caught it because the rules suite had 143 tests covering `users` creation, deletion and
every refusal, and none for the one operation the settings screen performs. Phase 11's local mirror
then downgraded the failure to a reassuring "Saved on this device, but not to your account yet".

Fixed, covered by six regression tests whose **first assertion is the happy path** — a rule that
denies everything passes every test that only checks refusals — and re-verified on both platforms.

**Two beliefs corrected:**

- The README's long-standing "registration does not submit on the iOS simulator" is **not
  reproducible**. It submits and signs in on iOS 26.5. Nothing was knowingly done to fix it and the
  cause was never diagnosed, so it is recorded as no-longer-reproducible rather than fixed.
- An earlier revision of `docs/manual-test-plan.md` concluded from Android evidence alone that the
  registration defect was "iOS-only". That was wrong and is corrected in place, with the reasoning
  shown rather than quietly edited.

## Hard-won gotchas — these cost real time to find, do not rediscover them

1. **`getReactNativePersistence` is missing from `firebase@12`'s typed surface.** Worked around by
   `apps/mobile/types/firebase-auth-rn.d.ts`. Auth persistence is SecureStore-backed with chunking
   (SecureStore keys must match `/^[\w.-]+$/`; Android caps values near 2 KB).
2. **Firestore `getDocs` does not throw when offline** — it resolves from its own empty local cache
   and returns `[]`, indistinguishable from "nothing here". Every repository checks
   `snapshot.metadata.fromCache` and throws a network `AppError`. Preserve this.
3. **`connectFirestoreEmulator` throws across Fast Refresh.** Emulator settings are supplied to
   `initializeFirestore` at creation. Emulator connection state is tracked **per service**.
4. **A Firestore converter's `toFirestore` runs on the data being written** — an earlier version
   stripped `serverTimestamp()` sentinels and every write failed with an opaque PERMISSION_DENIED.
5. **A marker tap also fires `MapView.onPress`.** Guard on `event.nativeEvent.action !== 'marker-press'`.
6. **RNTL 14 made `render` and `fireEvent` async.** A missing `await` typechecks and fails at runtime.
7. **Android suppresses the Play Services "Location Accuracy" dialog** (`mayShowUserSettingsDialog:
false`) and falls back to low accuracy on `ERR_LOCATION_SETTINGS_UNSATISFIED`.
8. **The React Compiler ESLint rules are strict and have caught real bugs.** No `setState` in an
   effect for derived state, no writing refs during render, and **no `Date.now()` during render** —
   that last one is why `src/utils/useNow.ts` exists.
9. **Android map tiles need `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID`.** Confirmed in Phase 13 on a
   _development build_, not only Expo Go: without it the whole map surface stays blank, hiding
   markers and radius circles as well as tiles. **iOS is unaffected — it uses Apple Maps and needs
   no key**, which is the only way the marker design has ever been seen.
10. **The iOS simulator's location resets to San Francisco**, and ignores a `simctl location set`
    issued before the app has resolved a first fix. Seed where the simulator actually is, then force
    a refetch from the app's own locate control.
11. **`import * as Notifications from 'expo-notifications'` throws at import time on Android under
    Expo Go.** `alertDelivery.ts` loads it lazily behind a `try`/`catch` `require`, kept permanently
    because the module is also reached from a headless background task.
12. **Firebase Storage uploads do not time out usefully by default.** `getFirebaseStorage()` sets
    `maxUploadRetryTime` (45 s) and `maxOperationRetryTime` (20 s), and the form has a Cancel.
13. **The app-wide TanStack `staleTime` is 5 minutes.** "My reports" and emergency contacts override
    it to `staleTime: 0`; nearby places overrides it _up_ to an hour.
14. **A Zod schema that closes over `Date.now()` freezes the clock at module load.**
    `buildIncidentReportFormSchema` takes a clock **function** read inside each refinement.
15. **Storage rules: overwriting an existing object is evaluated as `create`, not `update`.**
    `allow update: if false` alone does not prevent it — `resource == null` on create does.
16. **The Firestore emulator prints "evaluation error at L…" for ordinary denials** — but it _also_
    prints it for a genuine rule error. Phase 13's bug hid there for eleven phases. If a rule denies
    something it obviously should allow, read the message for "Function not found".
17. **`node --test` runs files in parallel.** The rules suite runs with `--test-concurrency=1`; this
    is load-bearing, because every file shares one emulator and `clearFirestore()` wipes everything.
18. **`eslint-config-next` 16 ships native flat configs.** Spread `eslint-config-next/core-web-vitals`
    directly; `FlatCompat` throws "Converting circular structure to JSON".
19. **`packages/shared-types` is consumed as TypeScript source** with explicit `.ts` extensions.
    Both apps set `allowImportingTsExtensions: true`. **The `functions` workspace cannot** — Cloud
    Functions run compiled JS on a runtime that does not strip types, so it holds a checked copy of
    the collection names guarded by `functions/src/__tests__/collections.test.ts`.
20. **Next 16 does not expose server-action ids in the HTML**, so server actions cannot be invoked
    with `curl`. Drive them through the browser, or test the logic they call directly.
21. **`plutil -extract` writes back to the file** unless given `-o -`. Grep the raw XML instead.
22. **CocoaPods fails with `Encoding::CompatibilityError`** in a shell with no UTF-8 locale.
    `npm run ios` sets `LANG`/`LC_ALL` for this reason.
23. **`firebase_admin.credentials` has no anonymous option.** See `_EmulatorCredentials` in
    `services/analytics/app/repositories/firestore.py`.
24. **One colour token cannot be both a dark fill and a light text colour.** The fix is light accents
    with **dark** `textOnPrimary` — the standard dark-theme pattern. Verified on device in Phase 13.
25. **The Admin SDK's default Storage bucket is `<project>.appspot.com`**, but this project's bucket
    is `<project>.firebasestorage.app`. Both are valid names, so the SDK returns an _empty bucket_
    rather than erroring — account deletion reported success having deleted no photographs. See
    `bucketName()` in `functions/src/firebaseAdmin.ts`. Only the end-to-end test caught this.
26. **`env.clearStorage()` does not empty the bucket the rules-test contexts write to.**
    `firebase/tests/storage.test.mjs` derives its uids from the clock so every run uses fresh paths.
27. **A development build silently falls back to a stale cached bundle when Metro is unreachable.**
    It keeps running and shows screens from whenever that bundle was built — during Phase 13 it
    served _Phase 10_ screens while appearing current. Discard anything observed after a "Cannot
    connect to Expo CLI" toast; `adb reverse tcp:8081 tcp:8081` reconnects it.
28. **`adb shell input text` splits on spaces** (use `%s`), and validation errors move the layout, so
    coordinates captured from an earlier screenshot land on the wrong control. The iOS simulator
    does not have either problem.
29. **Xcode's iOS Simulator platform ships separately from the SDK.** When it is missing,
    `xcodebuild` offers **no simulator destinations at all** while `-showsdks` still lists
    `iphonesimulator26.5` — so every destination-based diagnostic comes back empty rather than
    explaining itself. Fix: `xcodebuild -downloadPlatform iOS` (8.52 GB, no password).

## How to run

```bash
npm install
cp .env.example apps/mobile/.env                       # emulator defaults work as-is
cp apps/admin/.env.local.example apps/admin/.env.local # same
cp functions/.env.example functions/.env               # optional
cd services/analytics && uv sync && cd ../..
```

Terminal 1: `npm run emulators` (builds functions first; UI at http://localhost:4000). Terminal 2:

```bash
npm run seed -- 51.5074 -0.1278          # black spots
npm run seed:reports -- 51.5074 -0.1278  # approved reports, for the analytics service
npm run android                          # or npm run ios — both BUILD a dev build
npm start                                # thereafter, Metro alone
npm run verify                           # no emulator needed
npm run verify:all                       # adds Python, rules, and function integration tests
npm run scan:secrets
```

Dashboard (http://localhost:3000):

```bash
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
npm run grant-role -- you@example.test admin   # bootstrap only; /roles handles the rest
npm run admin
```

Analytics service (http://localhost:8000/docs): `npm run analytics`

## Known issues carried into Phase 14

- **Eight of the twenty manual scenarios are not executed** — background notification delivery, the
  draft queue surviving a force-quit, nearby help, contact CRUD, photo upload retry, the rate-limit
  and duplicate refusal copy, and account deletion. They need a physical device, a SIM, a camera, or
  a destructive deletion. Steps are in `docs/manual-test-plan.md`. Deletion and the submission
  limits are covered end to end by `test:functions` and `test:rules`, so what is unverified is the
  wording a user sees, not the enforcement.
- **Physical-device testing has still not been done.** Both simulator/emulator passes are complete;
  a real handset is Phase 14's territory alongside EAS builds.
- **`sweepOrphanedImages` does not run locally** — it needs the Pub/Sub emulator, which
  `npm run emulators` does not start. Its logic is pure and unit-tested; the scheduled trigger is
  verified only by inspection.
- **The iOS back button on a pushed screen reads `(tabs)`** — Expo Router using the route-group
  directory name as the back title. Cosmetic, iOS-only, found in Phase 13.
- **Android map tiles need a Google Maps key** (gotcha 9). iOS is unaffected.
- **`UIBackgroundModes` declares `fetch`**, added unconditionally by `expo-task-manager`'s plugin;
  this app has no background fetch task. Explicit `TODO(phase-14)` territory — an unjustified
  background mode is an App Store review risk.
- **Three `TODO(phase-14)` markers**: `overpassProvider.ts` (self-hosted Overpass instance),
  `logger.ts` (forward to a crash reporter), `apps/admin/src/lib/firebaseAdmin.ts` (the
  service-account path is written but never exercised).
- **The real-project path has never been exercised anywhere.** Everything has only ever run against
  emulators — `FIREBASE_SERVICE_ACCOUNT_JSON`, the analytics service's ADC path, and deployment.
- **Deploying Cloud Functions requires the Blaze plan.**
- **Coverage is 48% overall**, with screens and hooks thin. Only the proximity banner has
  screen-level tests.
- **Email addresses are not verified**; report rate limits are per account, not per person; there is
  **no App Check**.
- Icons and splash are placeholders. ~46 `npm audit` advisories, all transitive dev tooling, not
  fixable without breaking Expo.

## Phase 14 — CI/CD, builds, release preparation

From the plan: _"EAS profiles, identifiers/icons/splash/version, CI (install → lint → typecheck →
unit → backend), build docs, store prep."_
**Key gate:** dev + preview builds succeed; CI green; **no production secrets committed**.

1. **EAS build profiles.** `apps/mobile/eas.json` already has `development`, `development-device`,
   `preview` and `production`. Review them, and get a **preview** build actually produced.
2. **Identifiers, icons, splash, versioning.** Replace the placeholder artwork carried from the Expo
   template; settle bundle identifiers, version and build-number strategy.
3. **CI.** There is **no `.github/` directory yet** — this is greenfield. The pipeline must run
   install → lint → typecheck → unit → the Python gate. Decide what to do about the emulator-backed
   suites (`test:rules`, `test:functions`): they need the Firebase emulators in CI, which is
   possible but is a real decision, not an afterthought. `npm run scan:secrets` belongs in CI too.
4. **Build documentation** and store preparation.
5. **Resolve the three `TODO(phase-14)` markers** and the `UIBackgroundModes: fetch` issue.
6. Consider a physical-device pass now that both builds compile.

## Phase 15 — Documentation and demonstration (the last phase)

From the plan: _"README + 8 docs, demo dataset (≥10 black spots, ≥30 synthetic reports, ≥1
ECLAT-detectable pattern), reproducible demo flow."_
**Key gate:** a new developer can run everything from the README.

Note the current demo seed writes **7** black spots, so the ≥10 requirement is not yet met.

## How I want you to work

- Inspect before editing. Do not overwrite working code unnecessarily.
- No `any` without a documented reason. Do not disable TypeScript or lint rules to hide errors.
- Keep UI, services and business logic separate. Business-critical logic goes in pure, tested
  functions — `proximityEngine.ts`, `draftQueue.ts`, `eclat.py`, `evaluateModerationDecision` and
  `reportLimits.ts` are the pattern.
- Comment the _why_, especially for anything non-obvious or safety-relevant. Do not narrate the _what_.
- Validate at both client and server boundaries. Use Firebase server timestamps. Use batched writes
  or transactions where consistency matters.
- Mark unfinished work with explicit `TODO(phase-N)` comments. Never present a stub as complete.
- **Verify, do not assume.** Run the code. If something cannot be verified, say so plainly rather
  than implying it works. Phase 13's bug survived eleven phases because a test suite asserted only
  refusals and never once asserted the happy path.
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
VALIDATION RESULTS:   (TypeScript / ESLint / Tests / Python / Rules / iOS / Android)
ASSUMPTIONS:
KNOWN ISSUES:
HOW TO RUN:
NEXT PHASE:
```

Begin Phase 14.
