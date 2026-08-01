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

This project is being built in phases. **Phase 9 of 15 is complete.**

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
| 10    | Spatial clustering, ECLAT, risk scoring  | ⬜ Not started            |
| 11    | Settings, offline support, accessibility | ⬜ Not started            |
| 12    | Security, privacy, abuse prevention      | ⬜ Not started            |
| 13    | Testing and QA                           | ⬜ Not started            |
| 14    | CI/CD, builds, release preparation       | ⬜ Not started            |
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

**What does not work yet:** no analytics service. That screen exists as a labelled placeholder.

> **‡ The Android development build compiles; the iOS one has not been built on this machine.** The
> Android debug APK builds clean and carries `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE` and
> `FOREGROUND_SERVICE_LOCATION`, with `expo.modules.location.services.LocationTaskService` declared
> as `foregroundServiceType="location"` — confirmed by dumping the built APK.
>
> On iOS the Xcode project generates correctly and CocoaPods installs, but `xcodebuild` then reports
> no eligible destination: it says the iOS 26.5 platform is not installed and offers no simulator
> destination at all, while the only simulator runtime present is iOS 26.2. Download the iOS platform
> in Xcode ▸ Settings ▸ Components (or run `xcodebuild -downloadPlatform iOS`), then `npm run ios`.
> Nothing in the app code is implicated: the generated `Info.plist` carries the `location` background
> mode and all three location purpose strings, verified directly.

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
│   ├── admin/                # Next.js moderation dashboard (Phase 7)
│   └── mobile/               # Expo app (Phases 1–6, 8, 9, 11)
│       ├── app/              # Expo Router routes, file-based
│       ├── src/
│       │   ├── components/   # Reusable UI, no data access
│       │   ├── config/       # Validated environment configuration
│       │   ├── constants/    # Safety disclaimers and app constants
│       │   ├── features/     # auth, location, black-spots, alerts, reports, sos,
│       │   │                 #   emergency-contacts, nearby-places
│       │   ├── providers/    # App-wide React providers
│       │   ├── services/     # Firebase init and repositories
│       │   ├── theme/        # Design tokens, light/dark themes
│       │   ├── types/        # Shared domain types
│       │   └── utils/        # Geo maths, logger, error normalisation
│       ├── types/            # Local ambient declarations
│       ├── assets/           # Placeholder icons (real branding: Phase 14)
│       ├── eas.json          # EAS build profiles (Phase 8)
│       └── ios/, android/    # Generated by `expo prebuild` — gitignored
├── packages/
│   └── shared-types/         # Vocabulary + moderation rules shared by both apps
├── firebase/                 # Security rules, emulator config, rules test suite
└── docs/                     # Audit, ADRs, and design documentation
```

Directories from the target architecture that do not exist yet — `services/analytics/` — are
created by the phase that needs them.

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

`.env` is gitignored. Only `.env.example` is tracked. Note that `EXPO_PUBLIC_*` values are inlined
into the JavaScript bundle at build time — they are configuration, not secrets. Never put a private
key or service-account credential in them.

---

## Running the app

**Start the Firebase emulators first**, in their own terminal. Authentication and Firestore will not
work without them:

```bash
npm run emulators
```

The Emulator UI is then at <http://localhost:4000> — useful for inspecting accounts and documents
while testing. Emulator data is in-memory and discarded on exit; use `npm run emulators:persist` to
keep it between runs. See [`firebase/README.md`](firebase/README.md) for details.

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

For EAS builds, `apps/mobile/eas.json` defines `development`, `development-device`, `preview` and
`production` profiles. EAS does not read your local `.env`, so every `EXPO_PUBLIC_*` value the app
needs must be set as an EAS environment variable or secret:

```bash
npx eas-cli build --profile development --platform android
```

---

## Verification

Run the whole gate — formatting, linting, strict typecheck, then tests:

```bash
npm run verify
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

- **Feature work is incomplete by design.** Only Phases 0–8 are done; see the table above.
- **The dashboard signs an operator out after an hour.** The session cookie holds a Firebase ID
  token rather than a proper session cookie, and Firebase expires those after an hour. Signing in
  again restores it. Swapping to `createSessionCookie`, which also makes a role change take effect
  immediately rather than within the hour, is Phase 12 work.
- **Roles are granted by a script, not in the UI.** `npm run grant-role` uses the Admin SDK. The
  first administrator has to come from outside the system — a dashboard that could create its own
  first admin would be one anyone could create an admin in.
- **The real-project Admin SDK path has never been exercised.** Everything has only ever run against
  emulators; `FIREBASE_SERVICE_ACCOUNT_JSON` is written but untested (Phase 14).
- **SMS delivery can never be confirmed.** `expo-sms` opens the phone's composer and returns no
  usable status on Android at all; on iOS "sent" means the user pressed send, not that anything
  arrived. Every outcome message in the app is phrased about the composer, never about delivery.
- **The SMS composer does not exist on the iOS simulator**, so the SOS send path can only be
  exercised on a real device (Phase 13). The copy, share and call fallbacks are the routes that
  work there — and they are the routes that work on a SIM-less device too.
- **Emergency contacts are other people's personal data.** They are stored only for their owner,
  capped at five, never told they were added, and never contacted automatically.
- **Report photographs can be orphaned.** Images upload before the report document is written, so
  abandoning the form after choosing a photo leaves an unreferenced object in the bucket. That
  ordering is deliberate — a report must never reference photographs that never arrived — and a
  cleanup function is Phase 12 work.
- **A submitted report cannot be edited or withdrawn.** The Firestore rules refuse every client
  update and delete, so there is no way to change a report after sending it.
- **Android map tiles require your own Google Maps Platform key** — see the note in Build status.
  Everything else on Android works; only the tiles and map overlays are affected.
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
  background notification has yet been observed actually firing — the Android APK was compiled, not
  installed and driven, and the iOS build is blocked (see the caveat in Build status). Doing that
  walkthrough is part of Phase 13.
- **`UIBackgroundModes` also declares `fetch`.** `expo-task-manager`'s config plugin adds it
  unconditionally; this app has no background fetch task. Inert, but App Store review does query
  unused background modes, so it is flagged for Phase 14.
- **Dismissing the Android notification stops background warnings.** `killServiceOnDestroy` is on
  deliberately: a user must be able to stop location tracking without opening the app.
- **Background monitoring may not resume by itself after a device reboot.** The reconciliation runs
  when the Settings screen is mounted, not at app launch, so on Android — where there is no
  `BOOT_COMPLETED` receiver — warnings resume the next time Settings is opened. Moving it to launch
  is Phase 11 work, marked `TODO(phase-11)` in `useBackgroundMonitoring.ts`.
- **Nearby facility data is crowd-sourced, uneven, and sometimes simply wrong.** The default
  provider is OpenStreetMap, whose coverage is excellent in much of Europe and patchy elsewhere. A
  facility may be closed, moved, or absent from the map entirely — and records are occasionally
  **miscategorised** by whoever entered them. A live central-London query returned a cosmetic clinic
  tagged `amenity=hospital`; nothing client-side can detect that, and no filtering was added to
  pretend otherwise. The screen says the list is a starting point, not a directory.
- **Opening hours are almost always unknown**, and are shown as unknown rather than guessed. Only a
  literal `24/7` tag is reported as always open, and nothing is ever reported as closed.
- **Nearby lookups go to a free public Overpass endpoint**, which throttles under load. That is why
  the provider chain and the offline cache exist. A self-hosted or paid instance is Phase 14 work,
  marked `TODO(phase-14)`.
- **A Google Places key, if you set one, is not a secret.** It ships inside the bundle like every
  other `EXPO_PUBLIC_*` value and must be restricted by application and API, with a quota cap. A
  server-side proxy is the private option and is Phase 12 work. The default configuration sets no
  key at all.
- **Straight-line distances.** A hospital 2 km away across a river may be a 15 km drive. Stated on
  the screen rather than implied away.
- **No location history is stored.** Alert logs deliberately record the black spot and distance but
  **not** coordinates, and both offline caches round the stored centre to roughly 1 km. Positions
  sent to a place provider are rounded to five decimal places.
- **Demo black spots are seeded, not real.** `npm run seed` writes a small demo dataset to the
  emulator, including one unverified and one inactive record that must never appear in the app.
- **Emulators only so far.** Authentication and Firestore have been exercised against the local
  Emulator Suite, not a real Firebase project. Pointing at production is a config change
  (`.env`), but that path has not been tested.
- **Email addresses are not verified.** An account is usable immediately after registration. Email
  verification is a Phase 12 decision.
- **No rate limiting on registration.** Firebase applies its own throttling, but application-level
  abuse prevention is Phase 12.
- **Theme preference is not persisted.** Switching theme in Settings works but resets on relaunch.
  Persistence lands in Phase 11.
- **Rules tests cover Phase 7's role model, not the whole rule set.** `npm run test:rules` exercises
  ownership and role enforcement against the emulator; a full review of every collection is Phase 12.
- **Icons and splash artwork are placeholders** carried from the Expo template. Real branding is
  produced in Phase 14.
- **`npm audit` reports advisories in dev tooling** (`minimatch` via ESLint, `xcode` via
  `@expo/config-plugins`). These are transitive, build-time only, absent from the shipped bundle,
  and not fixable without breaking the Expo toolchain. Revisited in Phases 12 and 14.
- **Physical-device testing has not been performed.** Verification so far is on the iOS 26.2
  Simulator and a `Pixel_9` (Android 16) emulator. Device testing is documented in Phase 13.

---

## Licence

MIT — see [LICENSE](LICENSE).
