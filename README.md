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

This project is being built in phases. **Phase 1 of 15 is complete.**

| Phase | Scope                                    | Status         |
| ----- | ---------------------------------------- | -------------- |
| 0     | Repository audit and technical plan      | ✅ Complete    |
| 1     | Expo foundation and design system        | ✅ Complete    |
| 2     | Firebase and authentication              | ⬜ Not started |
| 3     | Location permissions and map MVP         | ⬜ Not started |
| 4     | Black spot database and proximity alerts | ⬜ Not started |
| 5     | Crowdsourced incident reporting          | ⬜ Not started |
| 6     | Emergency contacts and SOS               | ⬜ Not started |
| 7     | Admin dashboard and moderation           | ⬜ Not started |
| 8     | Background location and notifications    | ⬜ Not started |
| 9     | Nearby facilities                        | ⬜ Not started |
| 10    | Spatial clustering, ECLAT, risk scoring  | ⬜ Not started |
| 11    | Settings, offline support, accessibility | ⬜ Not started |
| 12    | Security, privacy, abuse prevention      | ⬜ Not started |
| 13    | Testing and QA                           | ⬜ Not started |
| 14    | CI/CD, builds, release preparation       | ⬜ Not started |
| 15    | Documentation and demonstration          | ⬜ Not started |

**What works today:** the app launches on Android and iOS, all placeholder routes are reachable
through a bottom tab bar, the design system renders in light and dark themes, environment variables
are validated at startup, and render errors are caught by an error boundary.

**What does not work yet:** there is no authentication, no map, no location access, no reporting, no
SOS, and no data layer. Screens for those features exist as labelled placeholders.

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
│   └── mobile/              # Expo app (Phases 1–6, 8, 9, 11)
│       ├── app/             # Expo Router routes, file-based
│       ├── src/
│       │   ├── components/  # Reusable UI, no data access
│       │   ├── config/      # Validated environment configuration
│       │   ├── constants/   # Safety disclaimers and app constants
│       │   ├── providers/   # App-wide React providers
│       │   ├── theme/       # Design tokens, light/dark themes
│       │   ├── types/       # Shared domain types
│       │   └── utils/       # Logger, error normalisation
│       └── assets/          # Placeholder icons (real branding: Phase 14)
└── docs/                    # Audit, ADRs, and design documentation
```

Directories from the target architecture that do not exist yet — `apps/admin/`,
`services/analytics/`, `firebase/`, `packages/shared-types/` — are created by the phase that needs
them.

---

## Prerequisites

Verified working on macOS 26.5 (Apple Silicon):

| Requirement                     | Version used   | Needed for                 |
| ------------------------------- | -------------- | -------------------------- |
| Node.js                         | 24.15.0        | Everything                 |
| npm                             | 11.12.1        | Everything                 |
| Xcode + iOS Simulator           | 26.6, iOS 26   | Running on iOS             |
| Android Studio SDK, platform 36 | build-tools 36 | Running on Android         |
| JDK                             | 21             | Android builds             |
| Watchman _(optional)_           | latest         | Faster Metro file watching |

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

Create the mobile app's environment file. Every value is optional in Phase 1, so the app runs
straight away with validated defaults:

```bash
cp .env.example apps/mobile/.env
```

`.env` is gitignored. Only `.env.example` is tracked. Note that `EXPO_PUBLIC_*` values are inlined
into the JavaScript bundle at build time — they are configuration, not secrets. Never put a private
key or service-account credential in them.

---

## Running the app

Start Metro and choose a target interactively:

```bash
npm start
```

Launch directly on the iOS Simulator:

```bash
npm run ios
```

Launch directly on a booted Android emulator or connected device:

```bash
npm run android
```

Boot the Android emulator first if it is not already running:

```bash
$ANDROID_HOME/emulator/emulator -avd Pixel_9
```

> Expo Go for SDK 57 is not yet published to the App Store or Play Store. The commands above still
> work: the Expo CLI downloads and installs Expo Go onto simulators and emulators directly. For a
> physical iPhone, use `eas go`. A development build replaces Expo Go from Phase 8, where
> background location requires native modules Expo Go cannot provide.

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

- **Feature work is incomplete by design.** Only Phases 0 and 1 are done; see the table above.
- **Theme preference is not persisted.** Switching theme in Settings works but resets on relaunch.
  Persistence lands in Phase 11.
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
