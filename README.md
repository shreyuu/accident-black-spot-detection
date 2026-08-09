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

## What this is

A React Native app that warns you as you approach an accident-prone or crime-prone place, lets you
report incidents, and gives you an SOS screen that reaches contacts you choose. Alongside it: a
moderation dashboard where a human decides what becomes a published warning, and a Python service
that clusters approved reports and mines patterns to _propose_ new hazards for that human to review.

**An algorithm never publishes a warning on its own**, nobody may approve their own report, and the
app never claims to prevent accidents, summon help or confirm that a message arrived. Those
constraints are enforced in security rules and tested, not merely stated — see
[`docs/architecture.md`](docs/architecture.md).

It runs entirely against the local Firebase Emulator Suite. **No Firebase account, no credentials,
no billing, no API keys.**

Before drawing any conclusion about coverage, accuracy or readiness, read
[`docs/known-limitations.md`](docs/known-limitations.md). It is the honest list of what this does
not do and what has never been verified.

---

## Quick start

Six commands, from a fresh clone to a running app with data in it. Prerequisites are in the next
section; if something fails, [`docs/troubleshooting.md`](docs/troubleshooting.md) is organised by
symptom.

```bash
npm install
```

```bash
cp .env.example apps/mobile/.env && cp apps/admin/.env.local.example apps/admin/.env.local && cp services/analytics/.env.example services/analytics/.env
```

Terminal 1 — the emulators, left running:

```bash
npm run emulators
```

Terminal 2 — the demo data, around coordinates near wherever you will pretend to be:

```bash
npm run seed:all -- 51.5074 -0.1278
```

Terminal 3 — the app. This compiles a development build the first time, which takes a while:

```bash
npm run ios
```

Register any email and password; the Auth emulator accepts anything. Set the simulator's location to
the coordinates you seeded around, and you should see ten black spots on the map with warning radii,
and get a warning as you approach one.

**To file a report you also need to confirm the address.** The rules refuse a report from an
unconfirmed account — see [`docs/security-and-privacy.md`](docs/security-and-privacy.md) for why.
The emulator sends no email, so confirm it directly:

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run confirm-email -- you@example.test
```

Then tap **I have confirmed my address** on the Report tab. (To walk the path a real user takes
instead, the emulator does generate the verification link — [`docs/demo.md`](docs/demo.md) has it.)

To check the code rather than run it — this needs no emulator and takes about a minute:

```bash
npm run verify
```

**Then read [`docs/demo.md`](docs/demo.md).** It walks the whole system — app, dashboard and
analytics service — and states what you should see at every step, including the things that are
supposed to stay invisible.

---

## Prerequisites

Verified working on macOS 26.5 (Apple Silicon). Nothing below needs an account with anyone.

**Needed for everything**

| Requirement  | Version used | Notes                                                                     |
| ------------ | ------------ | ------------------------------------------------------------------------- |
| Node.js      | 24.15.0      | `package.json` declares `>= 20.19.4`, but only 24.15.0 has been exercised |
| npm          | 11.12.1      | Workspaces; `npm ci` in CI                                                |
| Firebase CLI | 15.2.1       | `npm install --global firebase-tools` — runs the emulators                |
| JDK          | 21           | The Firestore and Storage emulators are Java                              |

**Needed to run the mobile app** — one platform is enough

| Requirement                     | Version used   | Notes                                          |
| ------------------------------- | -------------- | ---------------------------------------------- |
| Xcode + iOS platform support    | 26.6, iOS 26   | The platform is a separate download; see below |
| CocoaPods                       | 1.16.2         | iOS development builds                         |
| Android Studio SDK, platform 36 | build-tools 36 | Plus `ANDROID_HOME`; see below                 |

**Needed for the analytics service**

| Requirement | Version used | Notes                                             |
| ----------- | ------------ | ------------------------------------------------- |
| Python      | 3.14.6       | `pyproject.toml` declares `>= 3.12`               |
| uv          | 0.9.17       | `brew install uv` — manages the venv and the lock |

**Optional**

| Requirement           | Notes                                                        |
| --------------------- | ------------------------------------------------------------ |
| Watchman              | `brew install watchman`; Metro uses a slower watcher without |
| librsvg + ImageMagick | Only to regenerate app artwork (`npm run icons`)             |

From Phase 8 the app needs a **development build**, so the native toolchain for whichever platform
you use is no longer optional. Expo Go cannot register a background task and does not provide
`expo-notifications` on Android at all.

Xcode must have the **iOS platform itself** downloaded, not just the Xcode application. When it is
missing, `xcodebuild` offers no simulator destinations at all while still listing the SDK — every
diagnostic comes back empty rather than explaining itself. `xcodebuild -downloadPlatform iOS` fixes
it (8.52 GB, no password); see [`docs/troubleshooting.md`](docs/troubleshooting.md).

### One-time Android setup

`ANDROID_HOME` is not set by the Android SDK installer, and Gradle and the Expo CLI both need it:

```bash
echo 'export ANDROID_HOME=$HOME/Library/Android/sdk' >> ~/.zshrc && echo 'export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator' >> ~/.zshrc && source ~/.zshrc
```

---

## Documentation

Everything beyond the quick start lives in `docs/`. Each document exists because something in it was
not obvious from the code.

**Running and checking it**

| Document                                        | What it answers                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| [`running.md`](docs/running.md)                 | Setup and running everything — dashboard, analytics service, devices      |
| [`demo.md`](docs/demo.md)                       | The whole system walked end to end, with what you should see at each step |
| [`verification.md`](docs/verification.md)       | What each gate covers, and the suites that need emulators                 |
| [`troubleshooting.md`](docs/troubleshooting.md) | Organised by symptom, because you do not yet know the cause               |

**How it is built**

| Document                                            | What it answers                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [`architecture.md`](docs/architecture.md)           | How the pieces fit, and which of them run with security rules bypassed                                  |
| [`data-model.md`](docs/data-model.md)               | Every collection, who can touch it, and the indexes each query needs                                    |
| [`ios-device-builds.md`](docs/ios-device-builds.md) | Getting a build onto a real iPhone with a free Apple Account, and the six Apple requirements in the way |

**How specific features work, and what they do not promise**

| Document                                                    | What it answers                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`security-and-privacy.md`](docs/security-and-privacy.md)   | What the rules enforce, where, and what they explicitly do not                 |
| [`eclat-methodology.md`](docs/eclat-methodology.md)         | The clustering and pattern mining, and how correctness was established         |
| [`background-monitoring.md`](docs/background-monitoring.md) | Background location, its platform limits, and why they cannot be worked around |
| [`settings-and-offline.md`](docs/settings-and-offline.md)   | Preference sync, the offline cache and the draft queue                         |
| [`nearby-places.md`](docs/nearby-places.md)                 | The keyless provider chain, and the coverage it honestly has                   |

**Status, process and release**

| Document                                                                | What it answers                                                              |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`known-limitations.md`](docs/known-limitations.md)                     | **What this does not do, and what has not been verified**                    |
| [`what-has-been-built.md`](docs/what-has-been-built.md)                 | The per-phase record of delivered work                                       |
| [`manual-test-plan.md`](docs/manual-test-plan.md)                       | The twenty scenarios automation cannot reach, with recorded results          |
| [`builds-and-releases.md`](docs/builds-and-releases.md)                 | Builds, versioning and CI — with a table of what is verified and what is not |
| [`store-preparation.md`](docs/store-preparation.md)                     | What App Store and Play submission would still require                       |
| [`phase-0-audit.md`](docs/phase-0-audit.md)                             | The original audit, risk register and fifteen-phase plan                     |
| [`adr/0001-platform-and-stack.md`](docs/adr/0001-platform-and-stack.md) | Why this stack, and what was rejected                                        |

Component-level notes live beside the code they describe:
[`firebase/README.md`](firebase/README.md),
[`services/analytics/README.md`](services/analytics/README.md),
[`apps/mobile/assets/branding/README.md`](apps/mobile/assets/branding/README.md).

`docs/handoff-phase-*.md` are not part of this set. They are the briefs each phase was handed, kept
because they record what was known and believed at the time — including the things that later turned
out to be wrong.

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

## Technology stack

Versions are pinned deliberately and verified working together. See
[`docs/adr/0001-platform-and-stack.md`](docs/adr/0001-platform-and-stack.md) for why each was chosen
and what was rejected.

| Area      | Stack                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mobile    | Expo SDK 57.0.8 · React Native 0.86 · React 19.2 · TypeScript 6 (strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`) · Expo Router · TanStack Query 5 · Zod 4 · react-native-maps 1.27 |
| Backend   | Firebase — Auth, Firestore, Cloud Storage, Cloud Functions (firebase-functions 7.3, Node 22 runtime) · Firebase JS SDK 12.16 · firebase-admin 14.2                                                           |
| Dashboard | Next.js 16.2 · React 19 · Firebase Admin SDK                                                                                                                                                                 |
| Analytics | Python 3.14 · uv · FastAPI · scikit-learn (DBSCAN) · a hand-written ECLAT · pytest, ruff, mypy                                                                                                               |
| Tests     | Jest 29 + jest-expo + RNTL 14 (mobile) · `node:test` (everything else) · `@firebase/rules-unit-testing` (rules)                                                                                              |
| Tooling   | npm workspaces · ESLint 9 (flat config, React Compiler rules) · Prettier · GitHub Actions                                                                                                                    |

**Install native and Expo packages with `npx expo install`, never plain `npm install`** — the latter
resolves the newest version rather than the one matching the SDK, and the result compiles and then
misbehaves on device. `npm run doctor` checks for drift.

Five npm workspaces: `apps/mobile`, `apps/admin`, `packages/shared-types`, `firebase` and `functions`.
`services/analytics` is Python and deliberately outside the npm workspace graph.

---

## Licence

MIT — see [LICENSE](LICENSE).
