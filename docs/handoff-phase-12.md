# Continuation prompt — start of Phase 12

Copy everything below the line into the new chat.

---

I am continuing a phased build of a React Native / Expo application called **Accident Black Spot
Detection**. Phases 0–11 are complete and approved. **Start at Phase 12.**

Working directory: `/Users/shreyu/VSCODE/Projects/accident-black-spot-detection`
Git: repo `git@github.com:shreyuu/accident-black-spot-detection.git`. **Current branch is
`changes&fixes`**, not `main`. Phases 1–10 are committed (HEAD is `88a0c3d`); the whole of
**Phase 11 is uncommitted** in the working tree (26 paths). Do not commit or push unless I ask.

## Read these first

- `README.md` — build status, setup, how to run, known limitations
- `docs/phase-0-audit.md` — repository audit, verified toolchain, dependency table, risk register,
  and the ordered 15-phase plan with per-phase acceptance gates
- `docs/adr/0001-platform-and-stack.md` — the technology decisions and their trade-offs
- `firebase/README.md` — emulator setup, which rules exist per phase, and the security properties
  each phase enforces
- `docs/settings-and-offline.md`, `docs/background-monitoring.md`, `docs/nearby-places.md`,
  `docs/eclat-methodology.md` — the Phase 8–11 design documents

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
firebase-admin 14.2 (JS) / 7.5 (Python) · Next.js 16.2.12 · TanStack Query 5 · Zod 4 ·
react-native-maps 1.27.2 · Jest 29 + jest-expo + RNTL 14 · `node:test` for the non-RN workspaces ·
Python 3.14.6 + uv + FastAPI + scikit-learn + pytest/ruff/mypy · npm workspaces.

**Always install native/Expo packages with `npx expo install`, never plain `npm install`.**

## Current state

- **Five workspaces**: `apps/mobile`, `apps/admin`, `packages/shared-types`, `firebase`,
  `services/analytics` (Python, not an npm workspace).
- **895 tests in the default JS gate** — 856 mobile (39 Jest suites) + 39 shared-types (`node:test`).
- **293 Python tests** (`npm run analytics:verify`, no emulator or network needed).
- **63 Firestore rules tests** (`npm run test:rules`, emulators must be running).
- `npm run verify` (format → lint → typecheck → test) is green and needs **no** emulator.
  `npm run verify:all` adds the Python gate and the rules suite. All green.

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
- **Phase 11** — preferences persisted to the account **and** mirrored locally (offline-safe),
  Settings controls (alert distance in named steps, alerts/sound/haptics, theme), an **offline draft
  queue** for reports that survives a restart and retries with backoff, and an accessibility pass
  that **measured** contrast and found two real WCAG failures.

## Hard-won gotchas — these cost real time to find, do not rediscover them

1. **`getReactNativePersistence` is missing from `firebase@12`'s typed surface.** Worked around by
   `apps/mobile/types/firebase-auth-rn.d.ts`. Auth persistence is SecureStore-backed with chunking
   (SecureStore keys must match `/^[\w.-]+$/`; Android caps values near 2 KB).
2. **Firestore `getDocs` does not throw when offline** — it resolves from its own empty local cache
   and returns `[]`, indistinguishable from "nothing here". Every repository checks
   `snapshot.metadata.fromCache` and throws a network `AppError`. Preserve this. It is also why
   Phase 11 keeps a local preferences mirror.
3. **`connectFirestoreEmulator` throws across Fast Refresh.** Emulator settings are supplied to
   `initializeFirestore` at creation. Emulator connection state is tracked **per service**.
4. **A Firestore converter's `toFirestore` runs on the data being written** — an earlier version
   stripped `serverTimestamp()` sentinels and every write failed with an opaque PERMISSION_DENIED.
5. **A marker tap also fires `MapView.onPress`.** Guard on `event.nativeEvent.action !== 'marker-press'`.
6. **RNTL 14 made `render` and `fireEvent` async.** A missing `await` typechecks and fails at runtime.
7. **Android suppresses the Play Services "Location Accuracy" dialog** (`mayShowUserSettingsDialog:
false`) and falls back to low accuracy on `ERR_LOCATION_SETTINGS_UNSATISFIED`.
8. **The React Compiler ESLint rules are strict and have caught real bugs four times now.** No
   `setState` in an effect for derived state, no writing refs during render, and **no `Date.now()`
   during render** — that last one is why `src/utils/useNow.ts` exists.
9. **Android map tiles do not render under Expo Go.** Needs `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID`
   wired through `app.config.ts`. A development build needs it too.
10. **The iOS simulator's location resets to San Francisco**, and `simctl` text injection truncates
    typed strings — verify a field from a screenshot before submitting.
11. **`import * as Notifications from 'expo-notifications'` throws at import time on Android under
    Expo Go.** `alertDelivery.ts` loads it lazily behind a `try`/`catch` `require`. **Phase 8 decided
    to keep the lazy require permanently** — the module is now also reached from a headless
    background task, where an import-time throw has nowhere to go.
12. **Firebase Storage uploads do not time out usefully by default.** `getFirebaseStorage()` sets
    `maxUploadRetryTime` (45 s) and `maxOperationRetryTime` (20 s), and the form has a Cancel.
13. **The app-wide TanStack `staleTime` is 5 minutes.** "My reports" and emergency contacts override
    it to `staleTime: 0`; nearby places overrides it _up_ to an hour.
14. **A Zod schema that closes over `Date.now()` freezes the clock at module load.**
    `buildIncidentReportFormSchema` takes a clock **function** read inside each refinement.
15. **Storage rules: overwriting an existing object is evaluated as `create`, not `update`.**
    `allow update: if false` alone does not prevent it — `resource == null` on create does.
16. **The Firestore emulator prints "evaluation error at L…" for ordinary denials.** Generic deny
    diagnostic; it does not mean a rule threw.
17. **`node --test` runs files in parallel.** The rules suite runs with `--test-concurrency=1`; this
    is load-bearing, because every file shares one emulator and `clearFirestore()` wipes everything.
18. **`eslint-config-next` 16 ships native flat configs.** Spread `eslint-config-next/core-web-vitals`
    directly; `FlatCompat` throws "Converting circular structure to JSON".
19. **`packages/shared-types` is consumed as TypeScript source** with explicit `.ts` extensions.
    Both consuming apps set `allowImportingTsExtensions: true`.
20. **Next 16 does not expose server-action ids in the HTML**, so server actions cannot be invoked
    with `curl`. Drive them through the browser, or test the logic they call directly.
21. **`plutil -extract` writes back to the file** unless given `-o -`. It silently destroyed a
    generated `Info.plist`. Grep the raw XML instead.
22. **CocoaPods fails with `Encoding::CompatibilityError`** in a shell with no UTF-8 locale.
    `npm run ios` sets `LANG`/`LC_ALL` for this reason.
23. **`firebase_admin.credentials` has no anonymous option.** Passing `None` falls back to
    Application Default Credentials and fails with an error naming ADC rather than the emulator. See
    `_EmulatorCredentials` in `services/analytics/app/repositories/firestore.py`.
24. **One colour token cannot be both a dark fill and a light text colour.** Darkening the dark-mode
    `primary`/`danger` to fix white-text contrast broke the same tokens used as text on the dark
    background. The fix is light accents with **dark** `textOnPrimary` — the standard dark-theme
    pattern.

## How to run

```bash
npm install
cp .env.example apps/mobile/.env                       # emulator defaults work as-is
cp apps/admin/.env.local.example apps/admin/.env.local # same
cd services/analytics && uv sync && cd ../..
```

Terminal 1: `npm run emulators` (UI at http://localhost:4000). Terminal 2:

```bash
npm run seed -- 51.5074 -0.1278          # black spots
npm run seed:reports -- 51.5074 -0.1278  # approved reports, for the analytics service
npm run android                          # or npm run ios — these BUILD a dev build now
npm start                                # thereafter, Metro alone
npm run verify                           # no emulator needed
npm run verify:all                       # adds Python + rules (emulators must be running)
```

Dashboard (http://localhost:3000):

```bash
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
npm run grant-role -- you@example.test admin   # the account must already exist
npm run admin
```

Analytics service (http://localhost:8000/docs):

```bash
npm run analytics   # needs FIRESTORE_EMULATOR_HOST and ANALYSIS_API_TOKEN
```

## Known issues carried into Phase 12

- **Nothing has been run on a simulator since Phase 7.** Phases 8–11 are typechecked, linted and
  covered by tests, but no screen has been observed. Specifically unobserved: the background
  notification firing, the Nearby help list rendering, settings persisting across a real relaunch,
  and a draft surviving a force-quit. **Worth one device pass early in Phase 12.**
- **The iOS development build has never compiled here.** The Xcode project generates and CocoaPods
  installs, but `xcodebuild` reports no eligible destination — Xcode 26.6 says the iOS 26.5 platform
  is not installed and offers no simulator destination, while only an iOS 26.2 runtime is present.
  Fix: Xcode ▸ Settings ▸ Components, or `xcodebuild -downloadPlatform iOS`. **Android builds fine**
  (verified: 246 MB debug APK, permissions confirmed by dumping the APK).
- **The dark theme's accents changed visibly in Phase 11** (fills became lighter with dark text on
  them) for a measured accessibility reason. Worth your eye.
- **The registration screen would not submit on the iOS simulator.** Undiagnosed Phase 2 code;
  worked around by creating accounts via the Auth emulator REST API.
- **The admin dashboard has no candidates screen.** Phase 10 writes `blackSpotCandidates` but a
  moderator cannot review them in the UI — only in the emulator UI or over the API.
- **The dashboard session is an ID token**, so it expires after an hour and a role change takes up
  to an hour to apply. `createSessionCookie` is Phase 12 work.
- **Role granting is a script, not a screen.** Deliberate for the first admin; a screen is Phase 12.
- **A Google Places key, if set, ships in the bundle.** `TODO(phase-12)` in `googlePlacesProvider.ts`
  to move it behind a server-side proxy. The default configuration sets no key.
- **Report photographs can be orphaned.** Images upload before the report document is written.
  `TODO(phase-12)` in `reportStorage.ts` for a cleanup function.
- **Drafts hold local `file://` photo URIs**, which iOS does not guarantee to preserve. A retry whose
  file has vanished fails with a clear error rather than silently sending fewer photos.
- **The analytics service has only ever run against the emulator.** The service-account and ADC paths
  are written but never exercised.
- **`UIBackgroundModes` declares `fetch`**, added unconditionally by `expo-task-manager`'s plugin;
  this app has no background fetch task. `TODO(phase-14)`.
- Icons/splash are placeholders (Phase 14). Physical-device testing has not been done (Phase 13).
- ~46 `npm audit` advisories, all transitive dev tooling, not fixable without breaking Expo.

## Phase 12 — Security, privacy and abuse prevention

From the plan: _"Full Firestore + Storage rules, server-side validation, rate limits, file type/size
limits, duplicate detection, account deletion + data export, secret scan."_
**Key gate:** unauthorised writes denied; reporter identity private; **zero secrets in tracked
files**.

1. Review and complete the **whole** Firestore rule set and the Storage rules — every collection,
   not just the ones each phase added. Phase 0 explicitly deferred a full review to this phase.
2. Server-side validation and **rate limits** on report submission, and file type/size limits on
   uploads.
3. **Duplicate detection** for reports, server-side.
4. **Account deletion and data export.** Deletion must actually remove the user's data, and export
   must give them what is held about them.
5. **Reporter identity must be private** — confirm a report's `reporterId` is not readable by other
   users, including through the dashboard's own queries.
6. **Secret scan** across tracked files, and resolve the two `TODO(phase-12)` markers
   (`googlePlacesProvider.ts` proxy, `reportStorage.ts` orphan cleanup).
7. Consider `createSessionCookie` for the dashboard, and a role-granting screen — both were
   deferred here from Phase 7.

Extend the rules test suite (`firebase/tests/`, currently 63 tests) to cover every new guarantee.

## How I want you to work

- Inspect before editing. Do not overwrite working code unnecessarily.
- No `any` without a documented reason. Do not disable TypeScript or lint rules to hide errors.
- Keep UI, services and business logic separate. Business-critical logic goes in pure, tested
  functions — `proximityEngine.ts`, `draftQueue.ts`, `eclat.py` and `evaluateModerationDecision` are
  the pattern.
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
VALIDATION RESULTS:   (TypeScript / ESLint / Tests / Python / Rules / iOS / Android)
ASSUMPTIONS:
KNOWN ISSUES:
HOW TO RUN:
NEXT PHASE:
```

Begin Phase 12.
