# accident-black-spot-detection

A location-based road safety application that detects accident-prone black spots, sends proximity
alerts, supports incident reporting, and provides emergency SOS assistance.

> **Accident Black Spot Detection provides informational warnings based on available data. It does
> not replace safe driving, emergency services or official guidance.**
>
> Black spot data is incomplete and partly crowdsourced — an area with no warning is not
> necessarily safe. The app cannot confirm SMS delivery, guarantee location accuracy, or summon
> emergency services.

---

## Build status

This project is being built in phases. **Phase 14 of 15 is complete.**

| Phase | Scope                                    | Status                    |
| ----- | ---------------------------------------- | ------------------------- |
| 0     | Repository audit and technical plan      | ✅ Complete               |
| 1     | Expo foundation and design system        | ✅ Complete               |
| 2     | Firebase and authentication              | ✅ Complete               |
| 3     | Location permissions and map MVP         | ✅ Complete (see caveat†) |
| 4     | Black spot database and proximity alerts | ✅ Complete               |
| 5     | Crowdsourced incident reporting          | ✅ Complete               |
| 6     | Emergency contacts and SOS               | ✅ Complete               |
| 7     | Admin dashboard and moderation           | ✅ Complete               |
| 8     | Background location and notifications    | ✅ Complete (see caveat‡) |
| 9     | Nearby facilities                        | ✅ Complete               |
| 10    | Spatial clustering, ECLAT, risk scoring  | ✅ Complete               |
| 11    | Settings, offline support, accessibility | ✅ Complete               |
| 12    | Security, privacy, abuse prevention      | ✅ Complete               |
| 13    | Testing and QA                           | ✅ Complete               |
| 14    | CI/CD, builds, release preparation       | ✅ Complete (see caveat§) |
| 15    | Documentation and demonstration          | ⬜ Not started            |

**What works today:** the full account flow (register, sign in, sign out, password reset) against
the Firebase Emulator Suite, with a session that survives a restart; a location permission flow that
explains itself before prompting and handles granted / denied / permanently-denied distinctly;
**verified black spots loaded from Firestore by geohash proximity query**, drawn on the map with
warning-radius circles; and **live proximity warnings** — one alert on entry, none while you stay
inside, hysteresis and a cooldown before another can fire, overlapping zones combined into a single
warning, delivered as an in-app banner plus a local notification and haptics. Warnings work offline
from a saved copy, clearly labelled as such.

**Incident reporting also works end to end**: a signed-in user picks an incident type and severity,
writes a description, adjusts the location pin, optionally says when it happened and attaches up to
three photographs from the camera or library. Photographs upload to Cloud Storage with a progress
bar, the report is stored with status `pending`, and "My reports" shows where each one stands with
the moderator's note where there is one. A report is **never** turned into a black spot
automatically — approval is a human decision, and publishing a black spot from it is a second,
separate one.

**Emergency SOS works too**: the user keeps a short list of emergency contacts, and the SOS screen
composes a message with their name, coordinates, an accuracy disclosure, a map link and a timestamp,
behind a three-second cancellable countdown, then hands it to the phone's own SMS composer.
Copy, share and call fallbacks are always available. The app **never claims a message was
delivered** — it cannot know — and it says plainly that it does not contact the emergency services.

**Moderation now exists as a separate web dashboard** (`apps/admin`, Next.js). Moderators sign in
with a role granted as a Firebase Auth custom claim, work a queue of pending reports oldest-first,
and approve or reject with a note the reporter sees. Administrators additionally publish and
withdraw black spots. Every privileged action is written in the same Firestore transaction as its
audit-log entry, so an action cannot happen without its record. **Nobody can decide their own
report** — enforced in the shared moderation rules, not in the UI.

**Background warnings are now available, opt-in and off by default.** With the toggle switched on in
Settings — behind a disclosure covering the battery cost, the platform limits and what is and is not
stored — the app keeps checking your position against cached black spots while it is closed, and
warns by notification. It runs the **same** proximity engine as the foreground, so hysteresis,
cooldown and overlap folding behave identically, and zone state is now persisted, so force-quitting
inside a zone no longer produces a duplicate warning on return. The app **does not claim continuous
monitoring**: iOS defers and batches updates, Android's Doze and manufacturer battery managers can
suspend the task outright, and both the disclosure and the Settings copy say so. See
[`docs/background-monitoring.md`](docs/background-monitoring.md).

**Expo Go is no longer sufficient from this phase on.** `npm run ios` and `npm run android` now
produce a development build, because a custom background task and `expo-notifications` need native
modules Expo Go cannot provide.

**Nearby help now works** — hospitals and police stations around you, reached from the SOS screen,
sorted by distance, each with directions that hand off to your maps app and a call button when a
number is published. It works **with no API key**: lookups go to OpenStreetMap's Overpass API by
default, because a mobile app cannot hold a secret and the honest answer to "secure keys" is to not
need one. A Google Places provider sits behind the same interface and switches on only if you
configure a key, with OpenStreetMap as the automatic fallback. If every provider fails, the last
result saved on the device is shown and clearly labelled as saved. The screen states plainly that
distances are straight-line, that opening hours are usually unknown, and that the app cannot contact
anyone for you. See [`docs/nearby-places.md`](docs/nearby-places.md).

**Settings are now real and they persist.** Alert distance (100–2000 m in named steps), alerts,
sound, haptics, background monitoring and theme are saved to the account **and** mirrored locally, so
a choice survives a restart and applies with no signal. A setting that cannot reach the account is
kept and applied anyway — and the app says so rather than pretending it synced.

**A report written with no signal is no longer lost.** A failed submission can be saved on the phone
and is sent automatically the next time the app is opened with a connection, retrying with backoff
and giving up gracefully rather than for ever. A draft carries the reserved document id, so a retry
after a restart cannot file the same incident twice. Drafts are never presented as submitted
reports, and are cleared on sign-out. See
[`docs/settings-and-offline.md`](docs/settings-and-offline.md).

**Contrast is now measured rather than reviewed, and it found two real failures** — white text on
the dark-mode primary fill (4.04:1) and on the SOS button (3.61:1), both below WCAG AA. The dark
theme now uses light accents with dark text on them, measuring 7.44:1 and 6.80:1. Every token pair,
including pressed states, is asserted in the test suite.

**The analytics service now exists** (`services/analytics`, FastAPI + Python). It reads approved
reports, cleans and de-duplicates them, clusters them with DBSCAN on the haversine metric, mines
co-occurrence patterns with a **hand-written ECLAT**, scores each cluster 0–100 with a documented and
versioned formula, and proposes **black spot candidates**.

There is no maintained ECLAT library for Python — `mlxtend` has none and `pyECLAT` was abandoned in
2020 — so this project implements one and proves it correct by **cross-validating every result
against `mlxtend.fpgrowth`** across 85 seeded cases. Two independent algorithms agreeing is a far
stronger correctness argument than hand-written expectations.

**A candidate is never a warning.** Output goes to `blackSpotCandidates`, which the mobile app
cannot read at all, which no client can write whatever their role, and which carries no `verified`
or `active` field — so it could not satisfy the app's query even if copied across. Publishing stays
an administrator's deliberate, audited act. See
[`docs/eclat-methodology.md`](docs/eclat-methodology.md).

**The project now builds a release binary, and has a CI pipeline.** A GitHub Actions workflow runs
on every push and pull request: format, lint, typecheck, 1,027 unit tests, the secret scan, a
production build of the admin dashboard, the Python gate, and — deliberately, despite being the
expensive one — the 151 Firestore/Storage rules tests and the 8 end-to-end function tests under
`firebase emulators:exec`. The rules are the only enforcement point for "nobody approves their own
report", nothing else in the pipeline executes them, and Phase 13 found a rules bug that had
survived eleven phases. A script asserts CI never runs less than `npm run verify` does.

**The placeholder artwork is gone.** Icon, adaptive-icon layers, splash and a notification
silhouette are generated from committed SVG sources by `npm run icons`, which asserts the two
properties that otherwise fail silently and late: no alpha channel on the App Store icon, and a
genuinely white-on-transparent silhouette for the icons Android tints by alpha alone. See
[`apps/mobile/assets/branding/README.md`](apps/mobile/assets/branding/README.md).

**Two capabilities the app never used are no longer declared.** iOS `UIBackgroundModes: fetch`,
appended unconditionally by `expo-task-manager`, and Android `SYSTEM_ALERT_WINDOW`, written into the
main manifest by Expo's prebuild template. Both are removed by a local config plugin and verified in
the generated native files. Both were App Store and Play review risks, and both were claims about
the app that were not true.

See [`docs/builds-and-releases.md`](docs/builds-and-releases.md) for the build, versioning and CI
detail — including a table of exactly which release claims are verified and which are not — and
[`docs/store-preparation.md`](docs/store-preparation.md) for what submission would still require.

> **§ No EAS build has ever been produced, and nothing has been submitted anywhere.** The phase gate
> asked for a preview build, and the preview _configuration_ was verified by building it: a clean
> `expo prebuild` at `EXPO_PUBLIC_APP_ENV=preview` followed by `gradlew assembleRelease`, producing a
> 101 MB APK with the right application id, versionCode, permissions and a packed JS bundle. That is
> a real release-configuration binary, but EAS did not make it — EAS needs an Expo account this
> repository does not have, and `eas init` has never been run, so there is no `extra.eas.projectId`.
>
> Similarly, **the CI workflow has never run on GitHub.** Every command in every job was executed
> locally and passed, and the YAML parses, but a green pipeline has not been observed.
>
> One local-build trap worth knowing: `gradlew assembleRelease` fails in `:app:mergeDexRelease` with
> `DexArchiveMergerException` and an empty message unless the Gradle heap is raised. The real cause,
> forty lines further down, is `OutOfMemoryError` inside R8 — Expo's template sets `-Xmx2048m`, which
> is not enough. Pass `-Dorg.gradle.jvmargs="-Xmx6g -XX:MaxMetaspaceSize=1g"`.

> **‡ Both development builds now compile and run.** The Android debug APK builds clean and carries
> `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION`, with
> `expo.modules.location.services.LocationTaskService` declared as `foregroundServiceType="location"`
> — confirmed by dumping the built APK.
>
> The iOS build compiled for the first time in Phase 13, and the blocker was never the project. Xcode
> offered **no simulator destinations at all** — not with a booted simulator, not with
> `generic/platform=iOS Simulator`, not with `-sdk iphonesimulator` — because Xcode's **iOS Simulator
> platform** ships separately from the SDK and was not installed. `xcodebuild -showsdks` listed
> `iphonesimulator26.5` the whole time, which is why every destination-based diagnostic came back
> empty rather than explaining itself. One command fixes it, needs no password, and downloads
> 8.52 GB:
>
> ```
> xcodebuild -downloadPlatform iOS
> ```
>
> Then `npm run ios`. On a nearly-full disk, free space first — `xcrun simctl runtime list` and
> `xcrun simctl runtime delete <id>` remove an old runtime, which can be re-downloaded later.

> **† Android map tiles need your own Google Maps API key.** The map screen — permission flow,
> location acquisition, and the rest of the app — works on Android, but the map _tiles_ render as a
> blank grid. Verified on a Pixel 9 emulator: Expo Go ships a Google Maps key, but it fails with
> `Google Maps Android API: Authorization failure … StatusCode=INVALID_ARGUMENT`. iOS is unaffected
> because it uses Apple Maps, which needs no key. To fix, set
> `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID` in `apps/mobile/.env` — it is already wired through
> `app.config.ts`.

See [`docs/phase-0-audit.md`](docs/phase-0-audit.md) for the full plan and
[`docs/adr/0001-platform-and-stack.md`](docs/adr/0001-platform-and-stack.md) for the technology
decisions and their trade-offs.

---

## Technology stack

**Mobile** — React Native 0.86 · Expo SDK 57 · TypeScript 6 (strict) · Expo Router · TanStack Query
· Zod

Firebase (Auth, Firestore, Storage), the Next.js admin dashboard, and the Python/FastAPI analytics
service arrive in later phases.

---

## Repository layout

```
accident-black-spot-detection/
├── apps/
│   ├── admin/                # Next.js moderation dashboard (Phases 7, 12)
│   └── mobile/               # Expo app (Phases 1–6, 8, 9, 11, 12)
│       ├── app/              # Expo Router routes, file-based
│       ├── src/
│       │   ├── components/   # Reusable UI, no data access
│       │   ├── config/       # Validated environment configuration
│       │   ├── constants/    # Safety disclaimers and app constants
│       │   ├── features/     # auth, location, black-spots, alerts, reports, sos,
│       │   │                 #   emergency-contacts, nearby-places, settings, account
│       │   ├── providers/    # App-wide React providers
│       │   ├── services/     # Firebase init and repositories
│       │   ├── theme/        # Design tokens, light/dark themes
│       │   ├── types/        # Shared domain types
│       │   └── utils/        # Geo maths, logger, error normalisation
│       ├── types/            # Local ambient declarations
│       ├── plugins/          # Local Expo config plugins (Phase 14)
│       ├── assets/
│       │   ├── branding/     # SVG sources for every icon (Phase 14)
│       │   └── images/       # Generated PNGs — `npm run icons`
│       ├── eas.json          # EAS build profiles (Phases 8, 14)
│       └── ios/, android/    # Generated by `expo prebuild` — gitignored
├── packages/
│   └── shared-types/         # Vocabulary + moderation rules shared by both apps
├── functions/                # Cloud Functions (Phase 12)
│   └── src/                  # deleteAccount, exportMyData, nearbyPlacesProxy,
│                             #   sweepOrphanedImages — the four operations that
│                             #   genuinely need a rule-bypassing credential
├── services/
│   └── analytics/            # FastAPI + DBSCAN + ECLAT (Phase 10)
│       ├── app/              # api, models, algorithms, services, repositories
│       └── tests/            # beside app/, not inside it
├── firebase/                 # Security rules, emulator config, rules + integration tests
├── scripts/                  # Repository tooling: secret scanner (Phase 12),
│                             #   icon generator and CI parity check (Phase 14)
├── .github/workflows/        # CI pipeline (Phase 14)
└── docs/                     # Audit, ADRs, and design documentation
```

Every directory from the target architecture now exists.

---

## Prerequisites

Verified working on macOS 26.5 (Apple Silicon):

| Requirement                     | Version used   | Needed for                  |
| ------------------------------- | -------------- | --------------------------- |
| Node.js                         | 24.15.0        | Everything                  |
| npm                             | 11.12.1        | Everything                  |
| Xcode + iOS platform support    | 26.6, iOS 26   | Building and running on iOS |
| CocoaPods                       | 1.16.2         | iOS development builds      |
| Android Studio SDK, platform 36 | build-tools 36 | Running on Android          |
| JDK                             | 21             | Android builds              |
| Watchman _(optional)_           | latest         | Faster Metro file watching  |

From Phase 8 the app needs a **development build**, so the iOS and Android native toolchains are no
longer optional for their respective platforms. Xcode must have the iOS platform itself downloaded
(Xcode ▸ Settings ▸ Components), not just the Xcode application — see the ‡ caveat in Build status.

### One-time Android setup

`ANDROID_HOME` is not set by the Android SDK installer, and Gradle and the Expo CLI both need it:

```bash
echo 'export ANDROID_HOME=$HOME/Library/Android/sdk' >> ~/.zshrc && echo 'export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator' >> ~/.zshrc && source ~/.zshrc
```

Optional, but recommended — Metro falls back to a slower file watcher without it:

```bash
brew install watchman
```

---

## Setup

Install dependencies from the repository root (npm workspaces links `apps/mobile` automatically):

```bash
npm install
```

Create the mobile app's environment file. The defaults in `.env.example` point at the local Firebase
Emulator Suite and work as-is — no Firebase account, credentials or billing needed:

```bash
cp .env.example apps/mobile/.env
```

Optionally, the Cloud Functions configuration. The defaults work as-is and nothing here is needed
to run the project locally:

```bash
cp functions/.env.example functions/.env
```

`.env` is gitignored; only the `*.example` templates are tracked. Note that `EXPO_PUBLIC_*` values
are inlined into the JavaScript bundle at build time — they are configuration, not secrets. Never
put a private key or service-account credential in them. `npm run scan:secrets` fails the build if
anything credential-shaped reaches a file git is carrying, including one not yet committed.

---

## Running the app

**Start the Firebase emulators first**, in their own terminal. Authentication and Firestore will not
work without them:

```bash
npm run emulators
```

This builds the Cloud Functions first and then starts Auth, Firestore, Storage and Functions. The
Emulator UI is at <http://localhost:4000> — useful for inspecting accounts and documents while
testing. Emulator data is in-memory and discarded on exit; use `npm run emulators:persist` to keep
it between runs. See [`firebase/README.md`](firebase/README.md) for details.

The functions emulator is needed only for account deletion, data export and the Places proxy;
everyday work on the app does not touch it. `npm run emulators:norun-functions` skips the build and
starts the other three if you want a faster loop.

**Seed some black spots**, or the map will be empty. Pass the coordinates you are testing from — the
demo spots are placed relative to that point, so they land wherever your simulator or device is:

```bash
npm run seed -- 37.7749 -122.4194
```

That writes seven records: five verified and active (which should appear), plus one unverified and
one inactive (which must **not** appear — they are there to prove the filtering works). Re-running it
with different coordinates repositions them.

**Build and install the development build.** From Phase 8 this replaces Expo Go, which cannot
register a background task and does not provide `expo-notifications` on Android at all. Build for
the iOS Simulator:

```bash
npm run ios
```

Build for a booted Android emulator or a connected device:

```bash
npm run android
```

Boot the Android emulator first if it is not already running:

```bash
$ANDROID_HOME/emulator/emulator -avd Pixel_9
```

The first build takes a long time — CocoaPods on iOS, Gradle on Android. Later ones are incremental.
`ios/` and `android/` are generated by `expo prebuild` and are **gitignored**: regenerate them, never
commit them. Rebuild after any change to `app.config.ts`, a new native package, or a changed
permission string; a JavaScript-only change needs only Metro.

Once the development build is installed, day-to-day work only needs Metro:

```bash
npm start
```

> `npm run ios` sets `LANG`/`LC_ALL` to a UTF-8 locale. CocoaPods fails with
> `Encoding::CompatibilityError: Unicode Normalization not appropriate for ASCII-8BIT` in a shell
> that has no locale set, which is easy to hit in a non-interactive shell or CI.

For EAS builds, `apps/mobile/eas.json` defines a shared `base` profile plus `development`,
`development-device`, `preview` and `production`. EAS builds from a git archive, so it never sees
your local `.env` — every `EXPO_PUBLIC_*` value the app needs must be set as an EAS environment
variable. A build made from these profiles as they stand starts with Firebase unconfigured, and says
so rather than failing obscurely.

```bash
npx eas-cli build --profile development --platform android
```

**No EAS build has been produced for this project**; `eas init` has never been run. To build a
release-configuration Android binary locally instead:

```bash
cd apps/mobile && EXPO_PUBLIC_APP_ENV=preview npx expo prebuild --platform android --clean --no-install
```

```bash
cd apps/mobile/android && ./gradlew assembleRelease -Dorg.gradle.jvmargs="-Xmx6g -XX:MaxMetaspaceSize=1g"
```

The heap flag is required — see the caveat in Build status. Afterwards, re-run `expo prebuild`
without `EXPO_PUBLIC_APP_ENV` to restore the development variant.

Regenerate the app artwork after editing anything in `apps/mobile/assets/branding/`:

```bash
npm run icons
```

Needs `librsvg` and `imagemagick`, neither of which is a project dependency — the generated PNGs are
committed, and no build or CI job runs this.

Full detail, including versioning and the CI pipeline, is in
[`docs/builds-and-releases.md`](docs/builds-and-releases.md).

---

## Verification

Run the whole gate — formatting, linting, strict typecheck, tests, and the secret scan:

```bash
npm run verify
```

That needs **no emulator**. Two further gates do:

```bash
npm run test:rules
```

The Firestore and Cloud Storage security rules, evaluated by the real rules engine against the
emulator — 151 tests covering ownership, roles, rate limiting, duplicate detection, reporter
privacy and the upload rules.

Both emulator gates have a `:ci` variant that starts and stops the emulators themselves, which is
what the CI workflow runs and what to use if you would rather not keep a second terminal open:

```bash
npm run test:rules:ci
```

```bash
npm run test:functions:ci
```

```bash
npm run test:functions
```

End-to-end verification of account deletion and data export against the Auth, Firestore, Storage
and Functions emulators. This is the test that proves deletion _actually_ removes the data rather
than proving the policy that describes it.

Everything at once, emulators running:

```bash
npm run verify:all
```

The same gates run in CI on every push and pull request — see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml). `npm run verify` also checks that the
workflow has not drifted below it: `scripts/checkWorkflowParity.mjs` fails if a step exists locally
but not in CI, so a gate added here cannot silently be weaker there. **The workflow has never been
run on GitHub** — each job's commands were executed locally.

Coverage:

```bash
npm run test --workspace @accident-black-spot-detection/mobile -- --coverage
```

Mobile line coverage is **48%**, and the shape matters more than the number: the pure,
safety-critical cores — the proximity engine, the draft queue, the report limits, the moderation
rules — are covered thoroughly, while presentational components and hooks are thin. Phase 13 added
screen-level tests for the warning banner specifically because a regression there is harmful rather
than merely ugly.

Behaviour that automated tests cannot reach — real permissions, real OS dialogs, real process
death — is covered by [`docs/manual-test-plan.md`](docs/manual-test-plan.md): twenty scenarios,
twelve executed and recorded on an Android device build, eight documented with steps for a physical
device.

Scan for credentials in anything git is carrying, including files not yet committed:

```bash
npm run scan:secrets
```

Individually:

```bash
npm run format:check
```

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

Check that installed package versions match the Expo SDK:

```bash
npm run doctor
```

Reformat every file in place:

```bash
npm run format
```

---

## Known limitations

- **Feature work is incomplete by design.** Only Phases 0–14 are done; see the table above.
- **No EAS build exists, and the CI workflow has never run on GitHub.** The preview _configuration_
  was verified by building it locally into a real release APK, and every CI job's commands were run
  locally and passed — but EAS needs an Expo account this repository does not have, and the workflow
  has not been pushed. See the table in [`docs/builds-and-releases.md`](docs/builds-and-releases.md),
  which states claim by claim what is verified and what is not.
- **No crash reporter is registered.** Phase 14 added the seam — `setCrashReporter` in
  `src/utils/logger.ts`, with tests — but ships no vendor. Choosing one adds a data-processing
  relationship that the privacy policy and both stores' data-safety forms have to describe, which is
  a decision for whoever ships this rather than for a build phase. Until then the first users are the
  error-reporting system.
- **`engines.node >= 20.19.4` has never been exercised.** CI and `eas.json` both pin 24.15.0, the
  version everything here has actually been run on. The declared floor is either worth testing in a
  matrix or worth raising to match reality.
- **The first administrator is still granted by a script.** `npm run grant-role` uses the Admin SDK.
  Phase 12 added a `/roles` screen for every _subsequent_ role change, audited and with immediate
  revocation, but the bootstrap has to come from outside the system — a dashboard that could create
  its own first admin would be one anyone could create an admin in.
- **The real-project Admin SDK path has never authenticated to Google.** Everything has only ever run
  against emulators. Phase 14 extracted the credential handling into a tested pure function
  (`apps/admin/src/lib/serviceAccount.ts`) covering a missing variable, malformed JSON, each missing
  field, and — the one that matters — a service account belonging to a _different_ project than the
  dashboard was configured for, which the Admin SDK would otherwise follow silently with rules
  bypassed. What remains untested is `cert()` and the credential exchange itself, which needs a real
  project.
- **SMS delivery can never be confirmed.** `expo-sms` opens the phone's composer and returns no
  usable status on Android at all; on iOS "sent" means the user pressed send, not that anything
  arrived. Every outcome message in the app is phrased about the composer, never about delivery.
- **The SMS composer does not exist on the iOS simulator**, so the SOS send path can only be
  exercised on a real device (Phase 13). The copy, share and call fallbacks are the routes that
  work there — and they are the routes that work on a SIM-less device too.
- **Emergency contacts are other people's personal data.** They are stored only for their owner,
  capped at five, never told they were added, and never contacted automatically.
- **Orphaned report photographs are collected daily, not immediately.** Images upload before the
  report document is written, so abandoning the form after choosing a photo leaves an unreferenced
  object. That ordering is deliberate — a report must never reference photographs that never
  arrived — and the `sweepOrphanedImages` scheduled function removes anything unreferenced for more
  than 24 hours. The grace period is generous on purpose: deleting an object from a submission still
  being typed would strip evidence from a live report.
- **The scheduled sweep does not run in the local emulator.** It needs the Pub/Sub emulator, which
  `npm run emulators` does not start; the emulator logs `function ignored`. Its decision logic is
  pure and unit-tested (`functions/src/orphanSweep.ts`), but the scheduled trigger itself has only
  ever been verified by inspection.
- **Content type on an upload is client-declared.** The Storage rules allow-list image types and cap
  the size, but nothing inspects the bytes, so a file with a lying content type is accepted. See
  `docs/security-and-privacy.md` for the full list of known gaps.
- **The rate limit is per account, not per person.** Someone willing to register repeatedly can file
  more than the daily allowance. Bounding that needs registration controls, which Phase 12 does not
  add. There is also no App Check, so nothing proves a request comes from a genuine build of this
  app rather than a script driving the SDK with valid credentials.
- **A submitted report cannot be edited or withdrawn.** The Firestore rules refuse every client
  update and delete, so there is no way to change a report after sending it. Deleting your account
  removes pending and rejected reports, and anonymises approved ones — see
  `docs/security-and-privacy.md`.
- **Android map tiles require your own Google Maps Platform key** — see the note in Build status.
  Confirmed in Phase 13 on a _development build_, not only under Expo Go: without
  `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID` the whole map surface stays blank, so the markers and
  warning-radius circles are invisible along with the tiles. The data layer is unaffected — the
  header still reported "5 black spots nearby" and proximity warnings still fired — so this is a
  display-only limitation, but it makes the map screen impossible to assess visually without a key.
- **Background warnings are best-effort, and cannot be otherwise.** Neither platform guarantees a
  background location update will arrive, or arrive promptly. iOS defers and coalesces them and
  pauses them when it decides you have stopped moving; Android's Doze and manufacturer battery
  managers can suspend the task entirely, unpredictably and without notice. The app says this
  plainly rather than implying coverage it cannot provide. See
  [`docs/background-monitoring.md`](docs/background-monitoring.md).
- **Background warnings only cover black spots already cached on the device.** The background task
  makes no network request — one on that path would either block indefinitely or wake the radio for
  every update. Travel beyond the cached area and you are not warned there. Opening the app refreshes
  the cache.
- **Background notifications are high and critical risk only.** A notification on a phone in a pocket
  is a heavier interruption than a banner on a screen you are already looking at. Lower-risk zones
  still appear on the map and still advance zone state; they simply do not buzz. Stated in the
  disclosure and in Settings.
- **The background flow has not been exercised on a running device or emulator.** Its logic is
  covered by tests and the native configuration is verified from the built Android APK, but no
  background notification has yet been observed actually firing. It is one of the eight manual
  scenarios still unexecuted — see [`docs/manual-test-plan.md`](docs/manual-test-plan.md) — and it
  needs a physical device rather than an emulator to mean anything.
- **Two unused capabilities were removed in Phase 14** — iOS `UIBackgroundModes: fetch`, appended
  unconditionally by `expo-task-manager`, and Android `SYSTEM_ALERT_WINDOW`, written into the main
  manifest by Expo's prebuild template. Both are stripped by
  `apps/mobile/plugins/withoutUnusedCapabilities.ts` and verified in the generated native files. The
  plugin **must be listed first** in `plugins`, because Expo runs mods in reverse registration
  order — the comment in `app.config.ts` explains why, and it looks like a mistake if you do not
  read it.
- **Dismissing the Android notification stops background warnings.** `killServiceOnDestroy` is on
  deliberately: a user must be able to stop location tracking without opening the app.
- **Background monitoring resumes on launch, not on reboot.** Phase 11 moved the reconciliation to
  the tab layout, so opening the app re-registers a task the OS dropped. Android still has no
  `BOOT_COMPLETED` receiver, so between a reboot and the next launch there is no monitoring.
- **Nearby facility data is crowd-sourced, uneven, and sometimes simply wrong.** The default
  provider is OpenStreetMap, whose coverage is excellent in much of Europe and patchy elsewhere. A
  facility may be closed, moved, or absent from the map entirely — and records are occasionally
  **miscategorised** by whoever entered them. A live central-London query returned a cosmetic clinic
  tagged `amenity=hospital`; nothing client-side can detect that, and no filtering was added to
  pretend otherwise. The screen says the list is a starting point, not a directory.
- **Opening hours are almost always unknown**, and are shown as unknown rather than guessed. Only a
  literal `24/7` tag is reported as always open, and nothing is ever reported as closed.
- **Nearby lookups default to a free public Overpass endpoint**, which throttles under load. That is
  why the provider chain and the offline cache exist. Phase 14 made it configurable —
  `EXPO_PUBLIC_OVERPASS_ENDPOINT`, validated as an absolute `https:` URL — but the default is still
  the public instance, and a deployment beyond demonstration should not stay on it.
- **The Google Places key is no longer in the app.** Phase 12 moved the call behind the
  `nearbyPlacesProxy` Cloud Function, which holds the key in Secret Manager;
  `EXPO_PUBLIC_GOOGLE_PLACES_PROXY_ENABLED` is now a flag, not a credential. The default
  configuration enables nothing and uses OpenStreetMap, which needs no key anywhere.
- **Straight-line distances.** A hospital 2 km away across a river may be a 15 km drive. Stated on
  the screen rather than implied away.
- **No location history is stored.** Alert logs deliberately record the black spot and distance but
  **not** coordinates, and both offline caches round the stored centre to roughly 1 km. Positions
  sent to a place provider are rounded to five decimal places.
- **Demo black spots are seeded, not real.** `npm run seed` writes a small demo dataset to the
  emulator, including one unverified and one inactive record that must never appear in the app.
  `npm run seed:reports` writes approved incident reports for the analytics service, including
  scattered reports that must be discarded as noise and unmoderated ones that must be ignored.
- **The risk score is a ranking heuristic, not a measurement of danger.** It orders a moderation
  queue using crowd-sourced, unevenly distributed data. Somewhere with no reports scores nothing,
  and that is a statement about reporting, not about safety. No score is shown to app users.
- **ECLAT patterns describe, they do not predict.** "In 89% of reports here" is a statement about
  the reports on record, not a claim about what will happen. Asserted in the tests.
- **The analytics service has only ever run against the Firestore emulator.** The Admin SDK's
  service-account and Application Default Credentials paths are written but never exercised.
- **Analysis has no schedule.** Runs are triggered by an authenticated HTTP call; running it
  periodically is deployment work (Phase 14).
- **Time-of-day patterns ignore timezones.** The service does not know a reporter's local offset,
  and guessing one would place incidents in the wrong band with an air of precision.
- **Emulators only so far.** Authentication and Firestore have been exercised against the local
  Emulator Suite, not a real Firebase project. Pointing at production is a config change
  (`.env`), but that path has not been tested.
- **The old "registration does not submit on iOS" note is no longer reproducible.** Phase 13 ran the
  flow on iOS 26.5 and it submitted and signed in, exactly as on Android. The note predates several
  phases of work on the form, nothing was knowingly done to fix it, and the cause was never
  diagnosed — so it is recorded as no-longer-reproducible rather than fixed.
- **Eight of the twenty manual scenarios have not been executed.** They need a physical device, a
  SIM, or a destructive action against a real account — background notification delivery, the draft
  queue surviving a force-quit, nearby help, contact CRUD, photo upload retry, the rate-limit and
  duplicate refusal copy, and account deletion. Steps for each are in
  [`docs/manual-test-plan.md`](docs/manual-test-plan.md). Account deletion and the submission limits
  are covered end to end by `npm run test:functions` and `npm run test:rules` respectively, so what
  is unverified there is the wording a user sees, not the enforcement.
- **A development build silently falls back to a stale cached bundle when Metro is unreachable.**
  It keeps running and shows screens from whenever that bundle was built, so anything observed after
  a "Cannot connect to Expo CLI" toast must be discarded. `adb reverse tcp:8081 tcp:8081` reconnects
  it. This cost real time during Phase 13.
- **Email addresses are not verified.** An account is usable immediately after registration.
  Requiring verification is a product decision that was left open rather than taken in Phase 12: it
  would bar a bystander at a crash from reporting until they had found their inbox.
- **No rate limiting on registration.** Report _submission_ is rate limited and deduplicated
  server-side (Phase 12), but account creation relies on Firebase's own throttling — so the daily
  report allowance is per account, not per person.
- **No screenshots, feature graphic or privacy-policy URL exist**, and no developer accounts have
  been registered. Play's background-location declaration in particular needs a video of the in-app
  disclosure, which needs a device build. See
  [`docs/store-preparation.md`](docs/store-preparation.md).
- **`npm audit` reports advisories in dev tooling** (`minimatch` via ESLint, `xcode` via
  `@expo/config-plugins`). These are transitive, build-time only, absent from the shipped bundle,
  and not fixable without breaking the Expo toolchain. Revisited in Phases 12 and 14.
- **Physical-device testing has still not been performed.** Verification so far is on the iOS
  Simulator and a `Pixel_9` (Android 16) emulator. Phase 14 produced an installable release APK but
  did not install it on real hardware, and this remains the largest single gap between this
  repository and a submittable app.

---

## Licence

MIT — see [LICENSE](LICENSE).
