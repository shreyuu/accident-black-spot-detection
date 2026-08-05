# Builds, CI and releases

Phase 14. How this project is built, what CI checks, how versions are decided, and
which parts of the release path have actually been executed as opposed to written
down.

The last point is the one to read first. **Nothing in this repository has ever been
built by EAS, submitted to a store, or run against a real Firebase project.** What is
below is verified where it says verified and unverified where it says unverified, and
the two are never blurred.

---

## 1. What is verified, and how

| Claim                                                   | Status               | Evidence                                                                                                                                                              |
| ------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eas.json` is a valid EAS configuration                 | **Verified**         | Parsed and resolved with `@expo/eas-json`, the same package `eas-cli` uses. All five profiles.                                                                        |
| The preview configuration produces an installable app   | **Verified locally** | `expo prebuild` + `gradlew assembleRelease` on the preview variant. 101 MB APK, JS bundle packed, correct package name and versionCode.                               |
| The `fetch` background mode is gone                     | **Verified**         | Clean `expo prebuild`; `ios/*/Info.plist` contains `UIBackgroundModes = [location]`.                                                                                  |
| `SYSTEM_ALERT_WINDOW` is gone from release builds       | **Verified**         | Clean `expo prebuild`; absent from `android/app/src/main/AndroidManifest.xml`, still present in the debug manifest.                                                   |
| The notification and foreground-service icons are wired | **Verified**         | `drawable-*/notification_icon.png` and `location_foreground_service_icon.png` in the prebuild output, referenced from the merged manifest.                            |
| CI runs everything `npm run verify` runs                | **Verified**         | `scripts/checkWorkflowParity.mjs`, which `verify` itself runs.                                                                                                        |
| The emulator suites pass under `emulators:exec`         | **Verified**         | `npm run test:rules:ci` (151/151), `npm run test:functions:ci` (8/8), locally.                                                                                        |
| A build produced **by EAS** succeeds                    | **Not verified**     | Needs an Expo account. See §4.                                                                                                                                        |
| The CI workflow passes **on GitHub**                    | **Not verified**     | Has never been pushed; every job's commands were run locally. See §6.                                                                                                 |
| An iOS build compiles against this configuration        | **Not re-verified**  | Phase 13 built and ran iOS. The plugin change since then alters only `Info.plist`, and the generated plist was checked — but no iOS compile has been run in Phase 14. |
| A store submission succeeds                             | **Not verified**     | No developer accounts exist. See `store-preparation.md`.                                                                                                              |

---

## 2. Versioning

Two numbers, both in `apps/mobile/app.config.ts`, both bumped by hand.

**`APP_VERSION`** — the user-facing semantic version (`0.1.0`). Appears in App Store
Connect, Play Console and Settings. Bumped in a release commit of its own.

It is deliberately _not_ derived from `package.json`. The npm version of a private
workspace is metadata nobody reads; changing what a store displays is a release
decision, not a side effect of a dependency bump. They happen to be equal today. They
are not linked, and there is no check that they stay equal — linking them would make
`npm version` a release action, which is exactly the coupling being avoided.

**The build number** — `resolveBuildNumber()`. One integer serving both
`ios.buildNumber` and `android.versionCode`. Two counters drifting apart makes "which
build is this crash from?" unanswerable without a lookup table; neither store requires
them to be independent, only that each increases.

Override it per build without a commit:

```bash
APP_BUILD_NUMBER=42 npx expo prebuild
```

Invalid values throw at config-resolution time rather than being rejected by a store
at upload, hours later.

### Why not `autoIncrement`

`eas.json` used to set `autoIncrement: true` on the production profile alongside
`appVersionSource: "local"`. **That combination cannot work in this project.** Local
auto-increment means EAS CLI writes the new number back into the app config — and this
app's config is `app.config.ts`, code rather than data, with nothing to write into.
The flag was inert. It was removed in Phase 14 rather than left looking like a working
feature.

The alternative was `appVersionSource: "remote"`, which works fine with a dynamic
config by keeping the counter on EAS's servers. It was not chosen because it makes the
build number a property of an EAS account rather than of the commit. As it stands,
`git show <tag>:apps/mobile/app.config.ts` answers what any shipped build number was,
offline, with no account. If this project later adopts EAS in earnest, switching is a
one-line change and a reasonable one.

---

## 3. Local builds

### Android

```bash
npm run android                                   # development variant, debug
```

For a release-configuration build — what the `preview` EAS profile produces, minus
EAS's signing:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export EXPO_PUBLIC_APP_ENV=preview
cd apps/mobile
npx expo prebuild --platform android --clean --no-install
cd android
./gradlew assembleRelease -Dorg.gradle.jvmargs="-Xmx6g -XX:MaxMetaspaceSize=1g"
```

Output: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.

Two things about that command are not optional.

**The heap flag.** Without it the build fails in `:app:mergeDexRelease` with
`DexArchiveMergerException: Error while merging dex archives:` — and an empty message
after the colon. The actual cause is forty lines further down the log:
`java.lang.OutOfMemoryError: Java heap space` inside R8. Expo's template sets
`org.gradle.jvmargs=-Xmx2048m` in `android/gradle.properties`, which is not enough to
merge this app's five dex files. Editing that file is pointless — it is regenerated by
every prebuild, and `android/` is gitignored. EAS's builders do not hit this; it is a
local-machine problem with a spectacularly unhelpful error.

**`EXPO_PUBLIC_APP_ENV=preview` on the prebuild**, not just the Gradle run. The variant
determines the application id (`…​.preview`) and the display name, and both are baked
into native files at prebuild time.

Afterwards, restore the development variant so `npm run android` behaves:

```bash
cd apps/mobile && npx expo prebuild --platform android --clean --no-install
```

The release APK is signed with the **debug keystore**, which is what the React Native
template configures. It installs and runs; it is not distributable and must never be
uploaded anywhere.

### iOS

```bash
npm run ios                                       # sets LANG/LC_ALL for CocoaPods
```

A release-configuration _simulator_ build needs no signing:

```bash
cd apps/mobile && npx expo run:ios --configuration Release
```

A device build needs an Apple Developer account and is out of reach here.

---

## 4. EAS builds

`apps/mobile/eas.json` defines five profiles. `base` is not buildable on its own; the
other four extend it.

| Profile              | Distribution | Android | iOS       | Purpose                                       |
| -------------------- | ------------ | ------- | --------- | --------------------------------------------- |
| `development`        | internal     | APK     | simulator | Dev client, points at the Firebase emulators. |
| `development-device` | internal     | APK     | device    | Same, on a physical handset. Needs signing.   |
| `preview`            | internal     | APK     | device    | Release configuration for testers.            |
| `production`         | store        | AAB     | device    | Store distribution.                           |

To produce one:

```bash
npm install --global eas-cli
eas login
eas init                                          # creates the EAS project, writes extra.eas.projectId
eas build --platform android --profile preview
```

`eas init` is required and has not been run: there is no `extra.eas.projectId` in
`app.config.ts`, so the project is not linked to any EAS account.

### What these profiles deliberately do not contain

**Firebase configuration.** A build made from these profiles as they stand starts with
Firebase unconfigured. The app runs, and every screen needing an account reports that
it is not configured rather than failing obscurely — `isFirebaseConfigured` in
`src/config/env.ts` exists for exactly this.

That is deliberate. EAS builds from a git archive, so the untracked `apps/mobile/.env`
never reaches the builder, and this repository has no real Firebase project. The six
`EXPO_PUBLIC_FIREBASE_*` values are public configuration rather than secrets — they are
inlined into the shipped bundle and extractable from any binary — but they identify a
specific project, so they belong to whoever is building:

```bash
eas env:create --name EXPO_PUBLIC_FIREBASE_API_KEY --value "…" --environment preview
# …and the other five, plus EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID
```

**Update channels.** The `channel` keys were removed in Phase 14. They did nothing: a
channel selects which EAS Update branch a build subscribes to, and `expo-updates` is
not installed. Install the package first, then re-add them.

### `requireCommit`

`cli.requireCommit: true` makes EAS refuse to build from a dirty working tree. An
internal-distribution binary that cannot be traced to a commit is worthless the moment
a tester reports a bug against it.

---

## 5. Native configuration to be careful with

### Mods run in reverse registration order

The single most surprising thing found in this phase, and the one most likely to be
"tidied" back into a bug.

`apps/mobile/plugins/withoutUnusedCapabilities.ts` **must be listed first** in the
`plugins` array, even though it is the plugin that has to run last. Expo's `withMod`
wraps the previously-registered mod, and each action runs _then_ chains down to the
earlier one — so the last plugin listed runs first, and the first plugin listed runs
last, immediately before the base mod writes the file. Autolinked plugins are
registered after everything in the array, so they run before all of it.

Listed last, the plugin ran before `expo-location` had contributed `location`, found
only the `fetch` that autolinked `expo-task-manager` had added, and threw. That failure
is why the plugin asserts what it expects to find instead of quietly filtering.

### What that plugin removes

- **iOS `UIBackgroundModes: fetch`** — appended unconditionally by
  `expo-task-manager`'s plugin, which has no opt-out. This app registers one background
  task and it is a location task. An unused background mode is a question App Review
  asks and a claim about the app that is not true.
- **Android `SYSTEM_ALERT_WINDOW`** — written into the main manifest by Expo's prebuild
  template for React Native's dev overlay. The template _also_ declares it in
  `android/app/src/debug/AndroidManifest.xml`, so removing the main-manifest copy
  changes nothing for debug builds and removes a sensitive permission from release
  ones.

Both are asserted, not assumed: the plugin throws if a required background mode or
permission is missing. A background task that never fires reports no error to
JavaScript, and a missing permission surfaces as a runtime "denied" — both are
invisible failures in a shipped binary, which is the worst kind.

### Artwork

Generated from committed SVG sources; see `apps/mobile/assets/branding/README.md`.

```bash
npm run icons                                     # needs librsvg + ImageMagick
```

Not a build step. The PNGs are committed, so a clone builds without either tool.

---

## 6. CI

`.github/workflows/ci.yml`, on every push and pull request. Four jobs, run in parallel.

| Job               | What it does                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `verify`          | `npm ci`, then format, lint, typecheck, 1,027 unit tests, script tests, secret scan.                |
| `admin-build`     | `next build` of the moderation dashboard.                                                           |
| `analytics`       | `uv sync --locked`, ruff, ruff format, mypy, 293 pytest tests.                                      |
| `emulator-suites` | 151 Firestore/Storage rules tests and 8 end-to-end function tests, under `firebase emulators:exec`. |

### Why the steps are separate rather than one `npm run verify`

So a failure names itself in the job summary instead of hiding inside a six-command
chain. The cost is that the workflow can drift from `verify`, so
`scripts/checkWorkflowParity.mjs` asserts every script `verify` runs also appears in a
`run:` line of the workflow. It is wired into `test:scripts`, which `verify` itself
runs — a developer who adds a gate locally is told about the workflow before pushing.

The check is one-directional. CI is allowed to run more than `verify` does; it is not
allowed to run less.

### Why the emulator suites are in CI

They are the most expensive job here — a `firebase-tools` install, a JVM, four
emulators — and they were the obvious thing to leave out.

They are in because of what Phase 13 found. `hasNoPrivilegedFields` called `.keys()` on
a `Set`, every profile update had been denied since Phase 2, and nothing noticed for
eleven phases. The rules are the only enforcement point for "nobody approves their own
report" and "an algorithm cannot publish a warning on its own", and nothing else in
this pipeline executes them. A gate that skips the rules is a gate that would have
shipped that bug again.

`firebase-tools` is pinned to `15.2.1`, the version the suites were last run against.
The emulator's rules engine is part of what is under test, so "latest" would mean the
meaning of a passing run changes without a commit.

### The admin build job

`tsc --noEmit` and ESLint both pass on code Next cannot build. Phase 12 moved
privileged work into server components and server actions, where the characteristic
failure is a module dragging `firebase-admin` into a client bundle — a build error and
nothing else's error. The job copies `apps/admin/.env.local.example`, the committed
emulator defaults, because the build evaluates server modules during page-data
collection and `src/lib/env.ts` refuses to start unconfigured.

### Node versions

CI and `eas.json` both pin **24.15.0** — the version every gate in this repository has
actually been run on.

`package.json` declares `engines.node >= 20.19.4`. **That is a wider claim than
anything has been exercised against.** Nothing has ever run on Node 20 here. The floor
is either worth testing in a matrix or worth raising to match reality; it is recorded
as a known gap rather than quietly satisfied by a green pipeline that only ever runs
one version.

### What CI does not do

No build of the mobile app. An Android release build takes ten minutes and 6 GB of
heap on a developer machine; putting it on every push would dominate the pipeline to
re-prove something `expo prebuild` and the type checker mostly cover. EAS is the right
place for that, and it needs an account this repository does not have.

No deployment of anything. No secrets are configured, and none should be until there is
something to deploy to.

---

## 7. Secrets

`npm run scan:secrets` runs in `verify` and in CI. It scans tracked files **and**
untracked-but-not-ignored ones, so a credential about to be committed fails the gate
rather than one commit later.

Nothing in this repository is a secret today, and the reasons are structural rather
than lucky:

- The mobile app **cannot** hold one. Every `EXPO_PUBLIC_*` value is inlined into the
  bundle by Metro and readable from the binary in minutes. Phase 12 moved the Google
  Places key out of the app for this reason; the default nearby-places provider needs
  no credential at all.
- The Firebase project is `demo-accident-black-spot-detection`. The `demo-` prefix is
  meaningful to the SDK: it guarantees no request can reach Google Cloud.
- The dashboard's Admin SDK credential arrives as `FIREBASE_SERVICE_ACCOUNT_JSON` in
  the environment, never from a file in the tree. `.gitignore` refuses
  `**/*-firebase-adminsdk-*.json` and `serviceAccountKey.json` besides.
- Cloud Functions secrets live in Secret Manager, with `**/.secret.local` ignored for
  the emulator.

When real credentials appear, they go in EAS environment variables, GitHub Actions
secrets, and Secret Manager — in that order of preference, and never in a file.

---

## 8. Release checklist

Nothing below has been performed. It is the sequence, not a record.

1. Bump `APP_VERSION` in `app.config.ts`; bump the build number. Separate commit.
2. `npm run verify:all` — every gate including Python, rules and function integration.
3. `npm run icons` if artwork changed; commit the regenerated PNGs.
4. `eas build --profile preview --platform all`; install and exercise it on a real
   handset. **Physical-device testing has still never been done** — see the known
   limitations in the README.
5. Work through `docs/manual-test-plan.md`. Eight of the twenty scenarios remain
   unexecuted and most of them need a device, a SIM or a camera.
6. `docs/store-preparation.md` — the store-side prerequisites, none of which exist yet.
7. Tag the commit.
8. `eas build --profile production --platform all`, then `eas submit`.
