# ADR-0001 — Platform, SDK and stack baseline

- **Status:** Proposed (awaiting Phase 0 approval)
- **Date:** 2026-07-26
- **Context:** Phase 0 of the Accident Black Spot Detection build
- **Supersedes:** none
- **Evidence:** all version and capability claims below were measured on this machine;
  see [`../phase-0-audit.md`](../phase-0-audit.md) §3

---

## Decision 1 — Expo SDK 57, not SDK 56

**Chosen:** Expo SDK `~57.0.8` (React Native 0.86.0, React 19.2.3, TypeScript ~6.0.3).

**Why:**

- 57 is the `latest` dist-tag, released 2026-06-30 and patched through 57.0.8
  (2026-07-22) — it is stable, not a preview.
- Expo describes 57 as a no-breaking-change upgrade from 0.85 → 0.86.
- **Every** Expo module this project requires is published for 57 and installed cleanly
  together; `expo-doctor` reported 20/20 checks passing.
- Starting on the newest stable SDK maximises the runway before a forced upgrade,
  which matters for a multi-phase build.

**Cost accepted:** SDK 57's Expo Go build was still awaiting app-store approval at the
time of audit. This is not blocking, because verification will use the local iOS 26.2
simulators and the `Pixel_9` AVD — Expo CLI installs Expo Go on both — and a
development build is required from Phase 8 anyway.

**Rejected:** SDK 56 (`56.0.17`). It pins the same `react-native-maps@1.27.2` and
`react-native-safe-area-context ~5.7.0`, so it buys nothing but an earlier RN and an
earlier forced upgrade.

---

## Decision 2 — npm as package manager

**Chosen:** npm 11.12.1 (already installed).

**Why:** it is the only Node package manager present (no pnpm/yarn/bun); it is what
`create-expo-app` and `expo install` default to; and it avoids pnpm's symlinked
`node_modules`, which is a recurring source of Metro and Expo autolinking resolution
problems in monorepos.

**Revisit if:** monorepo install times or duplicate-dependency issues become painful,
at which point pnpm workspaces can be reconsidered with `expo-doctor` as the gate.

---

## Decision 3 — `npx expo install` for native packages, `npm install` for pure JS

**Why this is a rule and not a preference:** measured on the probe project, plain
`npm install` would have pulled versions Expo SDK 57 does not support:

| Package                                     | `npm latest` | SDK 57 wants |
| ------------------------------------------- | ------------ | ------------ |
| `typescript`                                | 7.0.2        | **~6.0.3**   |
| `react-native-maps`                         | 1.29.0       | **1.27.2**   |
| `@react-native-async-storage/async-storage` | 3.1.1        | **2.2.0**    |
| `eslint`                                    | 10.8.0       | **9.39.x**   |
| `jest`                                      | 30.4.2       | **29.7.x**   |

Three of those are major-version mismatches that would surface as confusing native or
build failures much later. `expo-doctor` runs in CI (Phase 14) to keep this enforced.

---

## Decision 4 — `react-native-maps`, not `expo-maps`

**Chosen:** `react-native-maps@1.27.2`, as the brief specifies.

**Verified fit:** it ships Fabric codegen (`codegenConfig`, `src/specs/*`) so it works
under SDK 57's New Architecture, provides `app.plugin.js` for managed-workflow config,
and is included in Expo Go.

**Noted alternative:** `expo-maps@~57.0.1` is first-party (Google Maps on Android,
Apple Maps on iOS). Not chosen because the brief names `react-native-maps`, and because
`react-native-maps` has the mature `Circle`/`Marker` API this project leans on for
warning-radius rendering. Revisit only if `react-native-maps` proves unstable on New
Architecture in Phase 3.

**Consequence:** iOS defaults to Apple Maps (zero config). `provider={PROVIDER_GOOGLE}`
and any Android release binary require Google Maps Platform keys, supplied via
environment variables and the config plugin — never committed.

---

## Decision 5 — Firebase **client** JS SDK on mobile; Admin SDK only server-side

**Chosen:** `firebase@^12.16.0` in the app. `firebase-admin@^14.2.0` only in
`apps/admin` and `firebase/functions`.

**Why:** the brief's architectural rule #1 — the mobile app must never contain Admin
credentials. All privileged actions (report approval, black spot publication, role
assignment) go through the admin app or callable functions, authorised by Firebase
custom claims and enforced by Firestore rules.

**Known defect to resolve in Phase 2 (risk H1):** `getReactNativePersistence` is
absent from the typed public surface of `firebase@12.16`. Root cause established: the
umbrella `firebase` package's `./auth` subpath exports map has no `react-native`
condition, so neither Metro nor TypeScript reaches `@firebase/auth`'s
`dist/rn/index.rn.d.ts` where the symbol is declared. Mitigation order: (A) narrow
local declaration, (B) custom SecureStore-backed `Persistence`, (C) migrate to
`@react-native-firebase/auth`. Persistence will not be reported as working until an
actual app restart confirms it.

---

## Decision 6 — Geohash bounding-box queries, not full-collection reads

**Chosen:** `geofire-common@^6.0.0` to compute geohashes on write and query ranges on
read, followed by client-side Haversine refinement to trim bounding-box false
positives.

**Why:** Firestore has no native radius query. Reading the whole `blackSpots`
collection would violate the brief's performance rules (#1, #2, #7) and scale badly.
Every black spot and report stores a `geohash` alongside its coordinates, matching the
data models in the brief.

**Consequence:** composite indexes must be declared in `firestore.indexes.json`
(Phase 4). Haversine and the enter/exit hysteresis are pure functions and get unit
tests — they are the safety-critical core of the app.

---

## Decision 7 — Python FastAPI analytics service with a **hand-written ECLAT**

**Chosen:** the brief's preferred option — Python 3.14 + FastAPI + Pydantic + pandas +
scikit-learn (DBSCAN) + GeoPandas. Verified installable from wheels on Python 3.14.2 /
arm64, including GeoPandas' compiled dependencies. No Python version pin needed.

**ECLAT will be implemented in-repo** as a documented vertical-tidset-intersection
algorithm, because no maintained library exists:

- `mlxtend.frequent_patterns` provides `apriori`, `fpgrowth`, `fpmax`, `hmine` — **no ECLAT**.
- `pyECLAT` is abandoned: last release `1.0.2` on 2020-06-03, metadata pinning
  `pandas>=0.25.3`.

This is explicitly permitted by the brief ("a documented ECLAT implementation").

**Correctness strategy:** `mlxtend.fpgrowth` becomes a **test oracle**. FP-Growth and
ECLAT must produce identical frequent-itemset sets for the same minimum support, so any
divergence on synthetic data fails the build. This gives a real correctness guarantee
rather than self-referential tests, and satisfies the "deterministic frequent itemsets"
acceptance criterion.

**Spatial grouping precedes mining.** ECLAT is never applied to raw latitude/longitude.
Reports are first clustered (DBSCAN with haversine metric, or geohash grouping) at a
configurable 100–250 m radius, and each cluster becomes an `area:cluster-N` item inside
transactions alongside time/day/weather/road/incident/severity items.

**Candidates are never auto-published.** The service emits `blackSpotCandidates` with
algorithm version and parameters recorded; only an administrator promotes one to a
verified public black spot.

---

## Decision 8 — TanStack Query for server state; Zustand only where genuinely global

**Chosen:** `@tanstack/react-query@^5` owns all Firestore/HTTP state (caching, retry,
loading/error states, offline behaviour). `zustand@^5` is used only for global client
state that is not server-derived — e.g. active alert state, transient permission status.

**Why:** the brief asks for Zustand "only where global client state is necessary".
Keeping server state in Query avoids duplicating cache logic and gives the
loading/empty/error states the brief requires (working rule #13) for free.

---

## Consequences summary

**Positive**

- Every version claim is empirically verified, not assumed; `expo-doctor` is clean.
- The two highest-risk unknowns (Firebase RN persistence, missing ECLAT library) were
  found in Phase 0 rather than mid-implementation, and both have concrete plans.
- Nothing to migrate, so no risk of damaging existing work.
- Local iOS and Android targets both exist, so each phase can genuinely be verified on
  both platforms.

**Negative / accepted**

- SDK 57 Expo Go is not yet in the public app stores; simulator/emulator and `eas go`
  cover this.
- `ANDROID_HOME` must be exported before the first Android run (Phase 1).
- A hand-written ECLAT is code we own and must test — mitigated by the FP-Growth oracle.
- 45 upstream dev-tooling audit advisories cannot be resolved without breaking Expo;
  they will be documented rather than force-fixed.
- `eas-cli` and `watchman` need installing before Phases 8/14.
