# What has been built

The per-phase record of delivered work. Moved out of the README, which now points here.

---

## What has been built

This project is being built in phases. **All fifteen phases are complete.**

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
| 15    | Documentation and demonstration          | ✅ Complete               |

**Phase 15 closed the set.** The documentation is now fourteen documents plus an ADR, indexed above
and each one written because something in it was not obvious from the code — including
[`architecture.md`](architecture.md) and [`data-model.md`](data-model.md), which did not
exist before, and [`troubleshooting.md`](troubleshooting.md), which collects every failure in
this project whose symptom pointed somewhere other than its cause.

The demo dataset grew to **twelve black spots and forty-two incident reports**, and roughly half of
it exists to be invisible. It now carries **three planted ECLAT patterns of deliberately different
shapes** — a pair, a triple, and one containing no incident-type item at all, because that site's
types are mixed on purpose. A miner that only ever emitted pairs would pass the first and fail the
other two. [`demo.md`](demo.md) walks the whole system and states what you should see at
every step, including what should stay hidden.

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
[`background-monitoring.md`](background-monitoring.md).

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
anyone for you. See [`nearby-places.md`](nearby-places.md).

**Settings are now real and they persist.** Alert distance (100–2000 m in named steps), alerts,
sound, haptics, background monitoring and theme are saved to the account **and** mirrored locally, so
a choice survives a restart and applies with no signal. A setting that cannot reach the account is
kept and applied anyway — and the app says so rather than pretending it synced.

**A report written with no signal is no longer lost.** A failed submission can be saved on the phone
and is sent automatically the next time the app is opened with a connection, retrying with backoff
and giving up gracefully rather than for ever. A draft carries the reserved document id, so a retry
after a restart cannot file the same incident twice. Drafts are never presented as submitted
reports, and are cleared on sign-out. See
[`settings-and-offline.md`](settings-and-offline.md).

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
[`eclat-methodology.md`](eclat-methodology.md).

**The project now builds a release binary, and has a CI pipeline.** A GitHub Actions workflow runs
on every push and pull request: format, lint, typecheck, 1,051 unit tests, the secret scan, a
production build of the admin dashboard, the Python gate, and — deliberately, despite being the
expensive one — the 151 Firestore/Storage rules tests and the 8 end-to-end function tests under
`firebase emulators:exec`. The rules are the only enforcement point for "nobody approves their own
report", nothing else in the pipeline executes them, and Phase 13 found a rules bug that had
survived eleven phases. A script asserts CI never runs less than `npm run verify` does.

**The placeholder artwork is gone.** Icon, adaptive-icon layers, splash and a notification
silhouette are generated from committed SVG sources by `npm run icons`, which asserts the two
properties that otherwise fail silently and late: no alpha channel on the App Store icon, and a
genuinely white-on-transparent silhouette for the icons Android tints by alpha alone. See
[`apps/mobile/assets/branding/README.md`](../apps/mobile/assets/branding/README.md).

**Two capabilities the app never used are no longer declared.** iOS `UIBackgroundModes: fetch`,
appended unconditionally by `expo-task-manager`, and Android `SYSTEM_ALERT_WINDOW`, written into the
main manifest by Expo's prebuild template. Both are removed by a local config plugin and verified in
the generated native files. Both were App Store and Play review risks, and both were claims about
the app that were not true.

See [`builds-and-releases.md`](builds-and-releases.md) for the build, versioning and CI
detail — including a table of exactly which release claims are verified and which are not — and
[`store-preparation.md`](store-preparation.md) for what submission would still require.

> **§ No EAS build has ever been produced, and nothing has been submitted anywhere.** The phase gate
> asked for a preview build, and the preview _configuration_ was verified by building it: a clean
> `expo prebuild` at `EXPO_PUBLIC_APP_ENV=preview` followed by `gradlew assembleRelease`, producing a
> 101 MB APK with the right application id, versionCode, permissions and a packed JS bundle. That is
> a real release-configuration binary, but EAS did not make it — EAS needs an Expo account this
> repository does not have, and `eas init` has never been run, so there is no `extra.eas.projectId`.
>
> **The CI workflow has now run on GitHub, and the first run found a real mistake.** Three of the
> four jobs passed — verify, admin build, Python. The emulator job failed in 3 seconds:
> `firebase-tools no longer supports Java version before 21`. The workflow pinned Java 17 while
> every local run had used the JDK 21 the Prerequisites table above lists, so the one dependency CI
> did not inherit from a developer machine was the one that was wrong. Pinned to 21 and commented;
> **the fix has not itself been observed green**, because that needs another push.
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

See [`phase-0-audit.md`](phase-0-audit.md) for the full plan and
[`adr/0001-platform-and-stack.md`](adr/0001-platform-and-stack.md) for the technology
decisions and their trade-offs.

---
