# Phase 0 — Repository Audit and Technical Plan

**Date:** 2026-07-26
**Repository:** `accident-black-spot-detection` (`git@github.com:shreyuu/accident-black-spot-detection.git`)
**Branch:** `main` @ `202e644` ("Initial commit")
**Status of this document:** audit only. No application code was created or deleted in Phase 0.

---

## 1. Repository summary

The repository is **effectively empty**. It is a fresh GitHub scaffold, not an existing
project to migrate.

### Tracked files (2 total)

| File        | Contents                                          |
| ----------- | ------------------------------------------------- |
| `README.md` | 2 lines: title + one-sentence project description |
| `LICENSE`   | MIT, © 2026 Shreyash Meshram                      |

### What does **not** exist

Every item Phase 0 was asked to inspect is absent:

- No `package.json` — **there is no installable or runnable project**
- No `app.json` / `app.config.ts` — no Expo project at all
- No `tsconfig.json` — TypeScript not configured
- No `app/` directory — Expo Router not configured
- No `src/`, no components, no routes
- No Firebase config, no `firebase.json`, no `firestore.rules`
- No `.env`, no `.env.example`, no `.gitignore`
- No `ios/` or `android/` directories — so the "managed vs. prebuilt" question is
  moot; the project will start **managed (CNG)** and gain native directories only if
  and when `expo prebuild` is run
- No CI, no test config, no lockfile

### Consequence for the acceptance criteria

> _"The exact command for starting the existing project is confirmed."_

**There is no existing project to start.** Reporting a start command here would be
fabrication. Instead I verified the toolchain empirically by scaffolding a throwaway
Expo SDK 57 project in a scratch directory outside the repo (see §3), and the command
that **will** work after Phase 1 is confirmed to be:

```bash
npm --prefix apps/mobile run start
```

The remaining Phase 0 acceptance criteria are met: the repository is understood, no
destructive changes were made, and the migration plan is documented below.

### Migration risk: none

Because there is no prior code, there is **nothing to preserve and nothing to
restructure destructively**. `README.md` and `LICENSE` will be kept; `README.md` will
be expanded (not replaced) in later phases. This removes an entire category of risk
that the brief anticipated.

---

## 2. Host toolchain audit

Verified on this machine (macOS 26.5.2, Apple Silicon `arm64`).

### Ready to use

| Tool             | Version                                     | Notes                                                            |
| ---------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| Node.js          | 24.15.0                                     | Works with Expo SDK 57 (verified: install + `expo-doctor` clean) |
| npm              | 11.12.1                                     | Chosen package manager — see ADR-0001                            |
| Git              | 2.52.0                                      | Remote configured, working tree clean                            |
| Xcode            | 26.6 (17F113)                               | `xcode-select` → `/Applications/Xcode.app/Contents/Developer`    |
| iOS runtime      | iOS 26.2                                    | Simulators: iPhone 17 Pro / 17 Pro Max / Air / 17 / 16e, iPads   |
| CocoaPods        | 1.16.2                                      | Needed for `expo prebuild` / local iOS dev builds                |
| JDK              | OpenJDK 21.0.11 (Homebrew)                  | Compatible with AGP used by RN 0.86                              |
| Android SDK      | platform `android-36`, build-tools `36.0.0` | At `~/Library/Android/sdk`                                       |
| Android emulator | AVD `Pixel_9`, system image `android-36`    | Boots via `emulator -avd Pixel_9`                                |
| adb              | 1.0.41 (37.0.0)                             |                                                                  |
| Firebase CLI     | 15.2.1                                      | Covers emulators, rules deploy, Functions                        |
| Python           | 3.14.2                                      | Full analytics stack installs from **wheels** — verified, see §3 |
| uv               | 0.9.17                                      | Chosen Python package manager                                    |
| pyenv            | 2.6.16                                      | Available if a Python pin becomes necessary                      |
| GitHub CLI       | 2.96.0                                      | Useful for Phase 14 CI                                           |

### Missing — must be addressed

| Tool                                          | Impact                                                                                       | When                                      | Fix                                                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` **unset** | `expo run:android` and Gradle builds will fail to locate the SDK even though it is installed | **Phase 1** (blocks first Android launch) | Export `ANDROID_HOME=$HOME/Library/Android/sdk` plus `platform-tools`/`emulator` on `PATH` in `~/.zshrc` |
| `eas-cli`                                     | No EAS builds or `eas go`                                                                    | Phase 8 / Phase 14                        | `npm i -g eas-cli` (or `npx eas-cli@latest`)                                                             |
| `watchman`                                    | Metro falls back to a slower, less reliable file watcher on large trees                      | Phase 1 (quality-of-life)                 | `brew install watchman`                                                                                  |

### Not required

- **Docker** is absent. Not needed: Firebase emulators run natively via the Firebase
  CLI, and the FastAPI analytics service runs in a local `uv` virtualenv. Docker only
  becomes relevant if Phase 14 chooses containerised deployment for the analytics
  service.
- **pnpm / yarn / bun** are absent — see ADR-0001 for why npm is the right choice here.

---

## 3. Empirical verification performed

To avoid guessing at versions, I scaffolded a disposable Expo project **in the
scratch directory, not the repository**, and installed the complete proposed
dependency set. Findings below are measured, not assumed.

### Expo SDK selection — measured data

`npm view expo dist-tags`:

| Tag                 | Version    | Published                         |
| ------------------- | ---------- | --------------------------------- |
| `sdk-56`            | 56.0.17    | 2026-07-23 (56.0.0 on 2026-05-20) |
| `sdk-57` / `latest` | **57.0.8** | 2026-07-22 (57.0.0 on 2026-06-30) |

SDK 57 pins React Native **0.86.0**, React **19.2.3**, TypeScript **~6.0.3**.

**Every Expo module the brief requires is published for SDK 57**, verified by a real
`npx expo install`:

```
expo-location 57.0.6      expo-task-manager 57.0.6   expo-notifications 57.0.7
expo-haptics 57.0.1       expo-image-picker 57.0.6   expo-sms 57.0.1
expo-secure-store 57.0.1  expo-device 57.0.1         expo-constants 57.0.7
react-native-maps 1.27.2  @react-native-async-storage/async-storage 2.2.0
```

`npx expo-doctor@latest` on the probe: **20/20 checks passed, no issues detected.**

### Version pins that differ from `npm latest` — this is why `expo install` is mandatory

The brief says to use versions compatible with the installed SDK. Four packages would
be **wrong** if installed with plain `npm install`:

| Package                                     | `npm latest` | Expo SDK 57 requires                       | Delta                                                                                            |
| ------------------------------------------- | ------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `typescript`                                | 7.0.2        | **~6.0.3**                                 | Major version — TS 7 is the Go rewrite; not what Expo's template or `expo/tsconfig.base` targets |
| `react-native-maps`                         | 1.29.0       | **1.27.2**                                 | Expo pins a tested build                                                                         |
| `@react-native-async-storage/async-storage` | 3.1.1        | **2.2.0**                                  | Major version                                                                                    |
| `eslint`                                    | 10.8.0       | **9.39.x** (resolved by peers)             | Major version                                                                                    |
| `jest`                                      | 30.4.2       | **29.7.x** (resolved by `jest-expo` peers) | Major version                                                                                    |

**Rule adopted:** native/Expo-adjacent packages are installed with `npx expo install`;
pure-JS libraries with `npm install`. Never the reverse.

### `react-native-maps@1.27.2` is New-Architecture ready

Expo SDK 57 is New Architecture (Fabric/bridgeless). I verified the pinned map library
supports it rather than assuming:

- `codegenConfig` present (`RNMapsSpecs`, `type: "all"`, `includesGeneratedCode: true`)
- Fabric component specs exist (`src/specs/NativeComponentMapView.ts`, `NativeComponentMarker.ts`, …)
- `app.plugin.js` present → usable as an Expo config plugin in a managed project
- `react-native.podspec` present for iOS

It is also listed as **included in Expo Go**, with the documented caveat that Google
Maps (`provider={PROVIDER_GOOGLE}`) needs API keys and an app binary — Apple Maps is
the zero-config default on iOS.

### Python analytics stack — verified installable on Python 3.14 / arm64

Python 3.14.2 is very new, so wheel availability was a genuine risk. I created a real
venv and installed with `--only-binary=:all:`. It succeeded:

```
pandas 3.0.5      numpy 2.5.1     scikit-learn 1.9.0   mlxtend 0.25.0
geopandas 1.1.4   fastapi 0.140.0 pydantic 2.13.4      (+ shapely 2.1.2, pyproj 3.7.2, pyogrio 0.13.0)
```

**No Python version pin is needed.** 3.14 works, including GeoPandas' compiled
dependencies.

### Critical finding: there is no maintained ECLAT library

This directly affects Phase 10's design.

- `mlxtend.frequent_patterns` exposes only `apriori`, `fpgrowth`, `fpmax`, `hmine`,
  `association_rules` — **no ECLAT**.
- `pyECLAT` on PyPI is **abandoned**: last release `1.0.2` on **2020-06-03**, and its
  metadata pins `pandas>=0.25.3` against a pandas-3.x world.

**Decision:** implement ECLAT ourselves as a documented vertical-tidset-intersection
algorithm (this is what the brief permits: _"a documented ECLAT implementation"_), and
**cross-validate its output against `mlxtend.fpgrowth`** in tests. Both algorithms
must yield the identical frequent-itemset set for the same minimum support — that is a
strong, cheap correctness oracle and satisfies the "deterministic frequent itemsets"
acceptance criterion.

### Critical finding: Firebase JS SDK v12 React Native auth persistence is broken _at the type level_

This affects Phase 2's "user remains logged in after restarting the app" criterion.
I traced this to root cause rather than stopping at the error.

Attempting the documented pattern fails typechecking:

```ts
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
// error TS2305: Module '"firebase/auth"' has no exported member 'getReactNativePersistence'.
```

Root cause, established from the installed package metadata:

1. `@firebase/auth@1.13.3` **does** ship the symbol — `dist/rn/index.rn.d.ts` declares
   `getReactNativePersistence`, and its `exports` map has a
   `"react-native": { "default": "./dist/rn/index.js", "types": "./dist/rn/index.rn.d.ts" }`
   condition.
2. The **umbrella `firebase` package's `./auth` subpath has no `react-native`
   condition at all** — only `browser`, `node`, `default`, `types`. Nothing under
   `node_modules/firebase/auth/` even mentions `getReactNativePersistence`.
3. `expo/tsconfig.base` already sets `moduleResolution: "bundler"` and
   `customConditions: ["react-native"]`, yet `--traceResolution` shows TypeScript
   resolving even a direct `@firebase/auth` import to `dist/auth-public.d.ts` (the
   top-level `types` key), which lacks the symbol.

So the symbol is unreachable through the typed public surface in either import form.
Three candidate mitigations, to be chosen and **runtime-verified** in Phase 2:

| Option                                                                                                                                        | Assessment                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A.** Narrow local declaration file declaring only `getReactNativePersistence(storage): Persistence`, with a comment linking to this finding | Lowest risk, ~5 typed lines, no `any`. **Recommended starting point.**                                                                              |
| **B.** Implement our own `Persistence` object over SecureStore/AsyncStorage                                                                   | Fully typed, no workaround, and aligns with the brief's "SecureStore for sensitive values" requirement. More code to own and test. Strong fallback. |
| **C.** Switch to `@react-native-firebase/auth` (native SDK)                                                                                   | First-class RN persistence, but forces a development build from Phase 2 and diverges from the requested stack. Not preferred.                       |

I will not present persistence as working until it is verified on a real app restart.

### Dev-dependency audit noise

`npm audit` on the probe reports 45 advisories (34 high, 11 moderate). Spot-checking
shows they are **transitive dev-tooling** issues — `minimatch` via `@eslint/*`, and
`xcode` via `@expo/config-plugins` — reached through `@expo/cli`, `@expo/metro-config`
and ESLint internals. None are in the shipped app bundle, and none are fixable without
breaking the Expo toolchain. To be re-checked and documented in Phases 12/14 rather
than "fixed" by forcing incompatible versions.

---

## 4. Proposed folder structure

Adopts the brief's layout, with the deviations noted. Because the repo is empty this
is greenfield creation, not migration.

```
accident-black-spot-detection/
├── apps/
│   ├── mobile/                  # Expo SDK 57 app (Phases 1–6, 8, 9, 11)
│   │   ├── app/                 # Expo Router routes (file-based)
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx
│   │   │   ├── (auth)/          # login, register, forgot-password
│   │   │   ├── (tabs)/          # map, report, sos, settings
│   │   │   ├── black-spots/[id].tsx
│   │   │   ├── reports/history.tsx
│   │   │   └── emergency-contacts/index.tsx
│   │   ├── src/
│   │   │   ├── components/      # presentational, no data access
│   │   │   ├── features/        # auth, black-spots, location, reports, sos, settings
│   │   │   ├── hooks/  services/  stores/  tasks/
│   │   │   ├── types/  utils/  constants/  config/
│   │   ├── assets/
│   │   ├── app.config.ts        # TS config, reads validated env
│   │   ├── eas.json             # Phase 14
│   │   └── package.json  tsconfig.json
│   └── admin/                   # Next.js dashboard (Phase 7)
├── services/
│   └── analytics/               # FastAPI + ECLAT (Phase 10)
│       ├── app/{api,models,services,algorithms,repositories}/
│       ├── tests/               # NOTE: deviation — see below
│       └── pyproject.toml
├── firebase/
│   ├── firestore.rules  firestore.indexes.json  storage.rules
│   └── functions/
├── packages/
│   └── shared-types/            # models shared by mobile + admin (+ mirrored in Python)
├── docs/
│   ├── phase-0-audit.md         # this file
│   ├── adr/0001-platform-and-stack.md
│   ├── architecture.md  database-schema.md  location-and-alert-flow.md
│   ├── eclat-methodology.md  security-and-privacy.md
│   ├── testing.md  deployment.md  privacy-design.md
├── .env.example  .gitignore  README.md  package.json
```

### Deviations from the brief's structure, with reasons

1. **Root directory name.** The project root is `accident-black-spot-detection/`
   throughout — matching the existing repository and its configured remote. Confirmed by
   the project owner on 2026-07-26: `accident-black-spot-detection` is used everywhere,
   as the directory name, the package name, and the product/display name ("Accident
   Black Spot Detection"). No alternative product name is used anywhere in the codebase.
2. **`services/analytics/tests/` sits beside `app/`, not inside it.** The brief nests
   `tests/` under `app/`. Standard Python packaging keeps tests out of the shipped
   package so they are not installed as importable modules. Trivial to move if you
   prefer literal adherence.
3. **`docs/adr/`** added. The brief asks Phase 0 to produce an architecture decision
   record; ADRs are append-only numbered files, so they get a directory.

---

## 5. Verified dependency list

Exactly the set installed and typechecked on the probe project.

### `apps/mobile` — runtime

| Package                                                     | Version        | Purpose                                        |
| ----------------------------------------------------------- | -------------- | ---------------------------------------------- |
| `expo`                                                      | ~57.0.8        | SDK                                            |
| `react` / `react-dom`                                       | 19.2.3         |                                                |
| `react-native`                                              | 0.86.0         |                                                |
| `expo-router`                                               | ~57.0.8        | File-based routing                             |
| `react-native-safe-area-context`                            | ~5.7.0         | Safe area (Phase 1)                            |
| `react-native-screens`                                      | ~4.26.0        | Native screens                                 |
| `react-native-gesture-handler`                              | ~2.32.0        | Bottom sheet, gestures                         |
| `react-native-reanimated` + `react-native-worklets`         | 4.5.0 / 0.10.0 | Animation; worklets required by Reanimated 4   |
| `expo-constants`                                            | ~57.0.7        | Env/manifest access                            |
| `expo-linking`                                              | ~57.0.4        | Deep links, directions intents                 |
| `expo-splash-screen` / `expo-status-bar` / `expo-system-ui` | ~57.x          | Shell chrome, theming                          |
| `expo-location`                                             | ~57.0.6        | Foreground + background location               |
| `expo-task-manager`                                         | ~57.0.6        | Background task registration (Phase 8)         |
| `expo-notifications`                                        | ~57.0.7        | Local notifications                            |
| `expo-haptics`                                              | ~57.0.1        | Vibration feedback                             |
| `expo-image-picker`                                         | ~57.0.6        | Camera + library (Phase 5)                     |
| `expo-image`                                                | ~57.0.1        | Efficient image rendering                      |
| `expo-sms`                                                  | ~57.0.1        | SOS composer (Phase 6)                         |
| `expo-secure-store`                                         | ~57.0.1        | Sensitive local values                         |
| `expo-device`                                               | ~57.0.1        | Device/emulator detection                      |
| `react-native-maps`                                         | 1.27.2         | Map, markers, radius circles                   |
| `@react-native-async-storage/async-storage`                 | 2.2.0          | Non-sensitive cache only                       |
| `firebase`                                                  | ^12.16.0       | Auth, Firestore, Storage (client SDK)          |
| `@tanstack/react-query`                                     | ^5.101.4       | Server-state, caching, retry                   |
| `zustand`                                                   | ^5.0.14        | Global client state only where necessary       |
| `react-hook-form`                                           | ^7.83.0        | Forms                                          |
| `zod`                                                       | ^4.4.3         | Runtime validation + env validation            |
| `geofire-common`                                            | ^6.0.0         | Geohash generation + bounding-box query ranges |

### `apps/mobile` — dev

| Package                         | Version |
| ------------------------------- | ------- |
| `typescript`                    | ~6.0.3  |
| `@types/react`                  | ~19.2.2 |
| `eslint`                        | ^9.39.5 |
| `eslint-config-expo`            | ^57.0.0 |
| `prettier`                      | ^3.9.6  |
| `jest`                          | ^29.7.0 |
| `jest-expo`                     | ^57.0.2 |
| `@testing-library/react-native` | ^14.0.1 |

> `@testing-library/react-native@14` declares a `test-renderer@^1.0.0` peer. To be
> resolved and confirmed when Jest is wired up in Phase 1/2.

### `apps/admin` (Phase 7)

`next` 16.2.x · `react` 19.2.x · `firebase-admin` ^14.2.0 · `firebase` ^12.16.0 ·
`typescript` 6.x · `zod` 4.x

### `firebase/functions` (Phase 7+)

`firebase-functions` · `firebase-admin` ^14.2.0 · `@firebase/rules-unit-testing`
^5.0.1 (emulator security tests)

### `services/analytics` (Phase 10)

`fastapi` 0.140.x · `uvicorn[standard]` · `pydantic` 2.13.x · `pandas` 3.0.x ·
`numpy` 2.5.x · `scikit-learn` 1.9.x (DBSCAN) · `geopandas` 1.1.x ·
`mlxtend` 0.25.x _(as an FP-Growth test oracle for our ECLAT, not the implementation)_ ·
`pytest` · `ruff` · `mypy`

---

## 6. Risk list

Ordered by severity × likelihood. Empirically-confirmed risks are marked ✅.

### High

| #                           | Risk                                                                 | Impact                                                                                    | Mitigation                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~H1~~ **CLOSED (Phase 2)** | **Firebase v12 RN auth persistence not in typed surface** (§3)       | Session does not survive app restart → Phase 2 acceptance failure                         | Both mitigations applied: a narrow declaration in `apps/mobile/types/firebase-auth-rn.d.ts`, plus a SecureStore-backed `Persistence` adapter that keeps the refresh token in the Keychain/Keystore rather than plaintext AsyncStorage. **Verified by force-killing and relaunching the app on the iOS simulator and the Android emulator** — the session survived both |
| H2 ✅                       | **No maintained ECLAT library** (§3)                                 | Phase 10 has no off-the-shelf path                                                        | Own implementation, cross-validated against `mlxtend.fpgrowth`                                                                                                                                                                                                                                                                                                         |
| H3                          | **Background location is fundamentally unreliable and OS-throttled** | Users could believe they are protected when they are not — a safety issue, not just a bug | Opt-in only; document limits verbatim (force-stop kills tracking; Android won't auto-restart for location/geofence events; iOS restarts only on geofence events; vendor task-killers vary). Never imply continuous coverage. Phase 8                                                                                                                                   |
| H4                          | **Firestore has no native radius query**                             | Naive implementation downloads all black spots — violates the brief's performance rules   | `geofire-common` geohash bounding-box ranges + client-side Haversine refinement; composite indexes declared in `firestore.indexes.json`. Phase 4                                                                                                                                                                                                                       |
| H5                          | **Safety over-promising**                                            | Users relying on incomplete data; reputational/ethical exposure                           | Disclaimer in onboarding **and** settings; never claim SMS delivery, police/medical response, or complete coverage. Cross-cutting, enforced from Phase 1                                                                                                                                                                                                               |
| H6                          | **Privilege escalation — self-approving reports**                    | Unverified reports become official black spots                                            | Server-enforced only: Firestore rules forbid users writing `status`/`verified`; approval solely via Admin SDK / callable function; custom claims for roles. Phases 7 & 12                                                                                                                                                                                              |

### Medium

| #     | Risk                                                                                            | Mitigation                                                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1 ✅ | `ANDROID_HOME` unset → Android build fails immediately                                          | Export in `~/.zshrc` at the start of Phase 1                                                                                                                                                           |
| M2 ✅ | SDK 57 Expo Go **not yet approved in the App Store / Play Store** (per Expo's SDK 57 changelog) | Not blocking: local iOS 26.2 simulators and the `Pixel_9` AVD are available and Expo CLI installs Expo Go on both. `eas go` covers physical iOS. A development build is needed from Phase 8 regardless |
| M3    | Google Maps API keys required for `PROVIDER_GOOGLE` on iOS + any Android binary                 | Default to Apple Maps on iOS for Phase 3; keys via env + config plugin, never committed. Phases 3/9                                                                                                    |
| M4    | Alert spam / battery drain from naive proximity checking                                        | Enter/exit hysteresis (radius + buffer), time cooldown, balanced accuracy in background, high accuracy only for active map/SOS. Phase 4/8                                                              |
| M5 ✅ | Plain `npm install` silently installs SDK-incompatible majors (TS 7, AsyncStorage 3, ESLint 10) | `npx expo install` for native/Expo packages; `expo-doctor` in CI                                                                                                                                       |
| M6    | Reporter identity leaking via public black spot documents                                       | Never denormalise `reporterId` into readable black spots; rules-tested in Phase 12                                                                                                                     |
| M7    | `expo-sms` only _opens the composer_ — delivery is never confirmed                              | UI must say the composer opened, never "message sent". Phase 6                                                                                                                                         |
| M8    | Firestore emulator security tests are easy to defer and then skip                               | Wire `@firebase/rules-unit-testing` in Phase 7 when rules first appear, not at the end                                                                                                                 |

### Low

| #     | Risk                                                                       | Mitigation                                                                                                     |
| ----- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| L1 ✅ | 45 dev-tooling `npm audit` advisories, upstream-owned, no compatible fix   | Document in Phase 12/14; do not force-resolve and break Expo                                                   |
| L2 ✅ | `watchman` missing → slower Metro watching                                 | `brew install watchman`                                                                                        |
| L3 ✅ | `eas-cli` missing                                                          | Install before Phase 8/14                                                                                      |
| L4    | Reanimated 4 + `react-native-worklets` needs correct Babel plugin ordering | Use the SDK 57 template's `babel.config.js` unchanged                                                          |
| L5    | TypeScript 6.x is recent; some libraries may lag on typings                | `skipLibCheck` is already on in `expo/tsconfig.base`; strict mode applies to our code                          |
| L6    | Monorepo + Metro can mis-resolve hoisted packages                          | `expo/metro-config` handles workspaces; validate with `expo-doctor` when `packages/shared-types` is introduced |

---

## 7. Ordered implementation plan

Phases follow the brief. Each ends with format + lint + typecheck + tests, a file
list, honest results, and a stop for approval.

| Phase  | Deliverable                                                                                                                                                                                                       | Key gate                                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **0**  | _This audit + ADR-0001_                                                                                                                                                                                           | ← **awaiting your approval**                                                                                                       |
| **1**  | Expo SDK 57 app in `apps/mobile`; Router, strict TS, ESLint/Prettier, absolute imports, Zod-validated env, error boundary, safe area; 7 placeholder routes; tab layout; 9 UI components; light/dark design system | Launches on the `Pixel_9` AVD **and** an iOS 26.2 simulator; all routes reachable; lint + `tsc` clean. Also: export `ANDROID_HOME` |
| **2**  | Firebase init, auth service, user repo, auth context; register/login/logout/reset; protected routes; RHF + Zod forms; Firestore user doc                                                                          | **Session survives a real app restart** (validates H1); auth unit tests pass                                                       |
| **3**  | Permission rationale flow, location service (status/loading/error/retry/accuracy), map screen, 3 sample spots + radius circles, detail sheet                                                                      | Granted / denied / permanently-denied all handled; no crash with GPS unavailable                                                   |
| **4**  | BlackSpot repository (`active && verified` only), geohash bounding-box queries, indexes, Haversine + enter/exit/cooldown logic, banner + notification + haptics, offline cache                                    | Distance & hysteresis **unit-tested**; exactly one alert per entry; alerts disableable                                             |
| **5**  | Report form + validation, image picker, Storage upload with progress/retry, `status: "pending"`, My Reports screen                                                                                                | Report never surfaces as an official black spot pre-approval; failed upload is recoverable                                         |
| **6**  | Emergency contact CRUD, SOS screen with 3s cancellable countdown, message with coords + map link, `expo-sms`, fallbacks (copy/share/call)                                                                         | No false delivery claim (M7); location-denied fallback clear                                                                       |
| **7**  | Next.js admin, custom-claim roles, moderation + black spot management, `AdminAuditLog` on every privileged action, Firestore rules                                                                                | Normal users blocked from admin pages **and** from approving; emulator security tests pass                                         |
| **8**  | Development build; `expo-task-manager` background task, Android foreground service, iOS background mode, opt-in toggle, battery disclosure                                                                        | Notification fires from a background update; disabling stops updates; OS limits documented (H3)                                    |
| **9**  | `NearbyPlace` abstraction, police/hospital layers, distance sort, directions, caching, secure keys                                                                                                                | Provider failure is recoverable; no secrets committed                                                                              |
| **10** | FastAPI service: ingest → clean → dedupe → DBSCAN/geohash cluster → transactions → **own ECLAT** → risk score 0–100 → candidates (unpublished); job metadata + algorithm version                                  | ECLAT output **matches `mlxtend.fpgrowth`** on synthetic data (H2); scores reproducible; candidates need admin approval            |
| **11** | Settings (radius 100–2000 m, default 1000), offline cache, local draft queue + retry, accessibility (labels, targets, contrast, dynamic type, risk never colour-only, reduced motion)                             | Prefs persist; draft survives restart; stale data visibly flagged                                                                  |
| **12** | Full Firestore + Storage rules, server-side validation, rate limits, file type/size limits, duplicate detection, account deletion + data export, secret scan                                                      | Unauthorised writes denied; reporter identity private; zero secrets in tracked files                                               |
| **13** | Unit + integration suites from the brief's lists; the 20 manual scenarios executed and recorded                                                                                                                   | Lint, types, unit, integration all green; physical-device testing documented                                                       |
| **14** | EAS profiles, identifiers/icons/splash/version, CI (install → lint → typecheck → unit → backend), build docs, store prep                                                                                          | Dev + preview builds succeed; CI green; no production secrets committed                                                            |
| **15** | README + 8 docs, demo dataset (≥10 black spots, ≥30 synthetic reports, ≥1 ECLAT-detectable pattern), reproducible demo flow                                                                                       | A new developer can run everything from the README                                                                                 |

### Cross-cutting rules held throughout

- Mobile app never contains Admin SDK credentials.
- Users cannot approve their own reports; enforcement is server-side, not UI-side.
- Unapproved reports never render as official black spots.
- ECLAT / heavy processing never runs on the phone.
- Background tracking is opt-in and explicitly enabled.
- Location collected only for a documented feature; no continuous history stored.
- UI / services / business logic stay separated; business-critical utilities get tests.
- Firebase server timestamps; batched writes or transactions where consistency matters.
- No `any` without documentation; no suppressed lint or TS errors to hide problems.
- Unfinished work carries explicit `TODO` comments — never presented as complete.

---

## 8. Assumptions

1. Greenfield build is intended — the empty repo is a starting point, not something to
   migrate.
2. Expo SDK 57 (latest stable) over SDK 56 — justified in ADR-0001.
3. `accident-black-spot-detection` is the name used everywhere — repository directory,
   package names, and the product/display name "Accident Black Spot Detection"
   (confirmed 2026-07-26).
4. A Firebase project does not exist yet; Phase 2 will use emulators plus a
   `.env.example`, and real credentials stay untracked and supplied by you.
5. No Google Maps Platform key yet; Phase 3 defaults to Apple Maps on iOS to stay
   unblocked.
6. Android/iOS **simulator** validation is in scope per phase; **physical-device**
   testing is yours to perform, and I will document exactly how (Phase 13).
7. npm is the package manager (ADR-0001).
8. `git commit` / `git push` happen only when you ask.
