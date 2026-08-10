# Project Execution Flow

How this system actually runs: what calls what, in what order, and how data
moves. [`decisions.md`](decisions.md) is the companion document and explains
**why** the design is this way; this one explains **how** it executes.

Every chain below was traced against the source. Where a path is unverified or
has never been exercised, it says so.

---

## Architecture Overview

Four deployables and one shared package. They share a Firestore database and
nothing else.

```
┌─ apps/mobile ────────┐   ┌─ apps/admin ─────────┐   ┌─ services/analytics ─┐
│ Expo / React Native  │   │ Next.js dashboard    │   │ FastAPI (Python)     │
│ Firebase CLIENT SDK  │   │ Firebase ADMIN SDK   │   │ Firebase ADMIN SDK   │
│ → rules apply        │   │ → rules BYPASSED     │   │ → rules BYPASSED     │
└──────────┬───────────┘   └──────────┬───────────┘   └──────────┬───────────┘
           │                          │                          │
           │        ┌─ functions ─────┴──┐                       │
           │        │ Cloud Functions    │                       │
           │        │ ADMIN SDK          │                       │
           │        └─────────┬──────────┘                       │
           ↓                  ↓                                  ↓
    ┌──────────────────────────────────────────────────────────────────┐
    │  Firestore + Storage + Auth   (Firebase Emulator Suite locally)  │
    │  guarded by firebase/firestore.rules and firebase/storage.rules  │
    └──────────────────────────────────────────────────────────────────┘

    packages/shared-types — TypeScript source, imported by mobile + admin
```

**The load-bearing asymmetry:** only the mobile app is constrained by the
security rules. Everything else uses the Admin SDK and bypasses them entirely,
so each guarantee is enforced twice — once in rules, once in code. See
`docs/security-and-privacy.md` §1 for the matched pairs.

### Layers within the mobile app

```
apps/mobile/app/          Expo Router screens — file-based routing
apps/mobile/src/features/ One folder per feature: UI + hooks + pure cores
apps/mobile/src/services/ Firebase SDK access
apps/mobile/src/components/ Reusable presentation
apps/mobile/src/utils/    geo, errors, logger, useNow
```

The recurring pattern inside `features/`: a **pure core** holding the decision
logic (`proximityEngine.ts`, `draftQueue.ts`, `zoneStatePersistence.ts`,
`backgroundRunHealth.ts`), a **thin wrapper** doing I/O (`zoneStateStore.ts`,
`backgroundRunHealthStore.ts`), and a **hook** connecting it to React. Tests
concentrate on the cores.

---

## Startup / bootstrap

```
apps/mobile/package.json  "main": "expo-router/entry"
        ↓
apps/mobile/app/_layout.tsx
        ├── import '@/features/alerts/backgroundLocationTask'   ← SIDE EFFECT, module scope
        │       └── TaskManager.defineTask(BACKGROUND_LOCATION_TASK, …)
        │           must be registered before the OS asks for it by name
        ↓
    <AppProviders>                     src/providers/AppProviders.tsx
        └── GestureHandlerRootView
             └── SafeAreaProvider
                  └── ThemeProvider
                       └── ErrorBoundary
                            └── QueryProvider        (TanStack, staleTime 5 min)
                                 └── AuthProvider
        ↓
    RootLayout → <Stack>  (index, (auth), (tabs), account, black-spots,
                           emergency-contacts, nearby, reports, +not-found)
```

`AuthProvider` subscribes on mount:

```
AuthProvider useEffect
        ↓
subscribeToAuthState()            src/features/auth/authService.ts
        ↓
onAuthStateChanged (Firebase)
        ↓
   ┌─ user !== null ─────────────────────┐   ┌─ user === null ──────────────┐
   │ setStatus('authenticated')          │   │ setStatus('unauthenticated') │
   │ loadProfile(user)                   │   │ stopBackgroundMonitoring()   │
   │   → userProfileRepository           │   │ Promise.all([                │
   │   → saveBackgroundAlertSnapshot()   │   │   clearBackgroundAlertSnapshot│
   └─────────────────────────────────────┘   │   clearZoneStates()          │
                                             │   clearBackgroundRunHealth() │
                                             │   clearPreferences()         │
                                             │   clearDrafts()              │
                                             │ ])                           │
                                             └──────────────────────────────┘
```

Sign-out cleanup is exhaustive on purpose: an unsent draft is somebody's private
account of an incident, and the background snapshot would otherwise attribute
the next user's alerts to the previous account.

---

## Routing and the auth guard

```
app/index.tsx
   status === 'authenticated'   → <Redirect href="/(tabs)/map" />
   status === 'unauthenticated' → <Redirect href="/(auth)/login" />
   status === 'loading'         → splash

app/(tabs)/_layout.tsx
   status === 'unauthenticated' → <Redirect href="/(auth)/login" />
   otherwise → <Tabs>  map · report · sos · settings
```

---

## Authentication

### Registration

```
app/(auth)/register.tsx
        ↓  react-hook-form + zodResolver(registerSchema)
handleSubmit → register(values)          src/features/auth/authService.ts
        ↓
createUserWithEmailAndPassword()          Firebase Auth
        ↓
updateProfile({ displayName })            best effort — logged, never fatal
        ↓
createUserProfile()                       src/services/firebase/userProfileRepository.ts
        ↓                                 → Firestore users/{uid}
        ↓                                 (failure ⇒ profileWriteFailed: true,
        ↓                                  repaired next launch)
        ↓
requestEmailVerification(user)            best effort
        ↓
sendEmailVerification()                   Firebase Auth
                                          emulator: no mail sent, link is at
                                          /emulator/v1/projects/…/oobCodes
```

Errors pass through `mapFirebaseAuthError()` → `AppError`. Screens render
`AppError.userMessage` and never see a Firebase code. Account enumeration is
deliberately not possible through these messages.

### Email verification gate (report creation only)

```
User clicks the verification link (or `npm run confirm-email`)
        ↓
account.emailVerified = true            ← server side only; the app's token is stale
        ↓
Report tab → "I have confirmed my address"
        ↓
refreshEmailVerification()              src/features/auth/authService.ts
        ├── user.reload()               updates user.emailVerified locally
        └── user.getIdToken(true)       mints a token carrying email_verified
        ↓
returns boolean → EmailVerificationGate → onVerified() → form renders
```

The forced token refresh is the non-obvious step: `email_verified` is a claim
**inside** the ID token, and the rules read the token, not the account.

---

## Map and black spots

```
app/(tabs)/map.tsx
        ↓
useLocation('high')                     src/features/location/useLocation.ts
        ↓                               → expo-location
useNearbyBlackSpots(centre)             src/features/black-spots/useNearbyBlackSpots.ts
        ↓  TanStack useQuery
fetchNearbyBlackSpots(centre, radius)   src/features/black-spots/blackSpotRepository.ts
        ↓
geohashQueryBounds() (geofire-common)   → N bounded range queries
        ↓
Firestore  blackSpots  where verified == true && active == true
        ↓
snapshot.metadata.fromCache check       ← every bound from cache ⇒ throw network AppError
        ↓                                  (getDocs does NOT throw offline; it
        ↓                                   resolves empty, which is
        ↓                                   indistinguishable from "nothing here")
Haversine refinement                    src/utils/geo.ts — geohash boxes overshoot
        ↓
saveNearbyBlackSpots(spots, centre)     src/features/black-spots/blackSpotCache.ts
        ↓                               → AsyncStorage
BlackSpotMarker / BlackSpotSheet
```

On query failure the hook falls back to `loadNearbyBlackSpots(centre)` from the
same AsyncStorage cache. That cache is also the **only** source the background
task has.

---

## Proximity alerts

One engine, two callers. The engine is never reimplemented — a second copy of
the hysteresis and cooldown rules is how you get a warning in one mode and
silence in the other.

### Foreground

```
useProximityAlerts()                    src/features/alerts/useProximityAlerts.ts
        ↓
watchPosition()                         src/features/location/locationService.ts
        ↓  on each fix
loadZoneStates(now) ─→ zoneStateStore ─→ AsyncStorage ─→ decodeZoneStates()
        ↓
evaluateProximity({ location, spots, states, now, config, alertsEnabled })
        ↓                               src/features/alerts/proximityEngine.ts
        ↓                               hysteresis · cooldown · overlap folding
        ↓                               · risk prioritisation
        ├── saveZoneStates(next, now)   BEFORE delivery — see below
        ├── deliverAlert(alert, prefs)  src/features/alerts/alertDelivery.ts
        │        └── expo-notifications (lazy require) + haptics + sound
        └── recordAlert({…})            src/features/alerts/alertLogRepository.ts
                 └── Firestore alertLogs
```

State is saved **before** delivery deliberately: a kill between the two costs
the user one missed warning they may get again next fix, whereas the other order
risks repeating the same warning — which is what teaches people to ignore them.

### Background (headless)

```
OS delivers a location batch
        ↓
TaskManager task BACKGROUND_LOCATION_TASK   src/features/alerts/backgroundLocationTask.ts
        ↓
handleBackgroundLocations(locations, now)
        ↓
loadBackgroundAlertSnapshot()           preferences from disk, NOT Firestore
   null → stopUpdatesFromTask() · noteBackgroundRun('stopped')          ⟂ return
   disabled → stopUpdatesFromTask() · noteBackgroundRun('stopped')      ⟂ return
        ↓
latestValidPosition(locations)
   null → noteBackgroundRun('no-valid-fix')                             ⟂ return
        ↓
loadNearbyBlackSpots(location)          AsyncStorage cache only — no network
   empty → noteBackgroundRun('no-cached-spots')                         ⟂ return
        ↓
loadZoneStates(now)
        ↓
evaluateProximity(…)                    the SAME engine as the foreground
        ↓
saveZoneStates(next, now)
        ↓
partitionBackgroundAlerts(alerts)       src/features/alerts/backgroundMonitoringPolicy.ts
        ↓                               high + critical only
for each deliverable alert:
        ├── deliverAlert(…)
        └── recordAlert(…)              only if getFirebaseAuth().currentUser !== null
        ↓
noteBackgroundRun('alert-delivered' | 'evaluated-no-alert', now)
```

Everything the task needs is already on disk, because a headless launch has no
React tree, no `AuthProvider`, no TanStack cache, and no guarantee Firebase has
restored the session or that a network exists.

The `defineTask` wrapper catches any escaping exception, logs it, and calls
`noteBackgroundRun('failed')` — the one outcome the function above cannot record
for itself.

### Run telemetry read path

```
app/(tabs)/settings.tsx → BackgroundRunHealthNote   (only when decision.status === 'active')
        ↓
useBackgroundRunHealth()                src/features/alerts/useBackgroundRunHealth.ts
        ├── useNow(60_000)              Date.now() during render is banned
        └── loadBackgroundRunHealth()   → AsyncStorage 'alerts.backgroundRunHealth.v1'
        ↓
summariseBackgroundRuns(health, now)    pure — src/features/alerts/backgroundRunHealth.ts
        ↓
describeBackgroundRuns(summary, now)    pure — src/features/alerts/backgroundRunCopy.ts
        ↓
two <AppText> captions
```

Stored per run: `{ atMs, outcome }` and nothing else. No coordinates, no black
spot ids — asserted by a test. Retention: 48 hours, capped at 200 entries,
pruned on write.

---

## Incident reporting

```
app/(tabs)/report.tsx
   ├── permission / location not ready  → LocationPermissionGate
   ├── user === null                    → ErrorState  (practically unreachable)
   ├── !user.emailVerified              → EmailVerificationGate      ← DEC-002
   └── otherwise                        → <ReportForm>
        ↓  react-hook-form + zodResolver(incidentReportFormSchema)
handleSubmit
        ↓
useSubmitReport()                       src/features/reports/useSubmitReport.ts
        ↓
submitIncidentReport(input)             src/features/reports/submitIncidentReport.ts
        ├── buildIncidentReportPayload() src/features/reports/reportDocument.ts   (pure)
        ├── uploadReportImage(…)         src/features/reports/reportStorage.ts
        │        └── Firebase Storage  incidentReports/{uid}/{file}
        │           progress · cancel · retry; maxUploadRetryTime 45 s
        └── createIncidentReport(reportId, { …payload, imageUrls })
                 ↓                       src/features/reports/reportRepository.ts
             ONE atomic commit of THREE documents:
                 incidentReports/{reportId}
                 reportRateLimits/{uid}
                 reportFingerprints/{fingerprintId}
                 ↓
             firebase/firestore.rules  allow create:
                 hasVerifiedEmail()                     ← DEC-002
                 reporterId == request.auth.uid
                 status == 'pending'                    ← load-bearing
                 hasServerTimestamps(…)
                 getAfter(rateLimit).lastReportAt == request.time
                 getAfter(rateLimit).count <= 10
                 getAfter(fingerprint).reportId == reportId
```

The `getAfter` coupling is what makes the rate limit binding: it reads the
sibling's state _after this commit_, so a lone report write leaves a stale
counter and is refused. `docs/security-and-privacy.md` §2 has the full argument.

Offline, the submission goes to the draft queue instead:

```
useDraftQueue()      src/features/reports/useDraftQueue.ts
        ↓
draftQueue.ts (pure: retry, backoff, ordering) + draftStore.ts (AsyncStorage)
        ↓  on reconnect
submitIncidentReport(…)   same path as above
```

---

## SOS

Deliberately **not** gated on email verification.

```
app/(tabs)/sos.tsx
        ↓
useSosCountdown()                       src/features/sos/useSosCountdown.ts
        ↓  3 s cancellable — sosCountdown.ts is pure
buildSosMessage()                       src/features/sos/sosMessage.ts  (pure)
        ↓  coordinates + accuracy disclosure + map link
sendSosSms(contacts, message)           src/features/sos/sosDelivery.ts
        ↓  expo-sms
   unavailable → copySosMessage() (expo-clipboard)
               → shareSosMessage() (react-native Share)
               → callContact() (Linking, tel: URI)
```

The app never claims a message was delivered. `expo-sms` reports handoff to the
messaging app, not receipt.

---

## Nearby help

```
Nearby screen → useNearbyPlaces()       src/features/nearby-places/useNearbyPlaces.ts
        ↓  TanStack, staleTime raised to 1 hour
searchNearbyPlaces(query, providers)    src/features/nearby-places/nearbyPlacesService.ts
        ↓  ordered fallback chain, first success wins
   1. googlePlacesProvider   → declines immediately unless
                               EXPO_PUBLIC_GOOGLE_PLACES_PROXY_ENABLED,
                               then calls the nearbyPlacesProxy Cloud Function
   2. overpassProvider       → OpenStreetMap Overpass API, keyless, the
                               effective default
        ↓
nearbyPlaceCache.ts → AsyncStorage
```

Failures accumulate in `result.failures` rather than aborting, so a partial
outage degrades instead of breaking.

---

## Cloud Functions

`functions/src/index.ts` exports four:

```
deleteAccount        callable  → deletionPolicy.ts (pure) → cascade delete across
                                 4 collections + Auth record + Storage prefix
exportMyData         callable  → exportPayload.ts (pure) → one JSON document
nearbyPlacesProxy    callable  → Google Places, keeping the API key server-side
sweepOrphanedImages  scheduled → runOrphanSweep()          ← DEC-005
```

### Orphan sweep

```
onSchedule('every day 03:00')  ← a one-line shell
        ↓
runOrphanSweep(nowMs = Date.now())      functions/src/sweepOrphanedImages.ts
        ├── firestore.collection('incidentReports').get()
        │        └── failure ⇒ { aborted: true }, deletes NOTHING
        ├── adminBucket().getFiles({ prefix: 'incidentReports/' })
        ├── planOrphanSweep({ objects, referencedUrls, nowMs })   (pure)
        │        └── functions/src/orphanSweep.ts — 24 h grace period
        └── bucket.file(path).delete() for each orphan
        ↓
OrphanSweepOutcome { scanned, referenced, withinGracePeriod, deleted, aborted }
```

`bucketName()` in `functions/src/firebaseAdmin.ts` exists because the Admin
SDK's default is `<project>.appspot.com` while this project's bucket is
`<project>.firebasestorage.app` — and the SDK returns an _empty bucket_ rather
than erroring, so the sweep once reported success having deleted nothing.

---

## Moderation dashboard

```
Browser → apps/admin/src/app/login/LoginForm.tsx
        ↓  Firebase client SDK sign-in → ID token
POST /api/session                       apps/admin/src/app/api/session/route.ts
        ↓
createSessionCookie()                   apps/admin/src/lib/session.ts
        ↓  httpOnly cookie, revocation-checked
apps/admin/src/app/(dashboard)/layout.tsx  — server component, verifies the cookie
        ↓
reports · black-spots · roles · audit pages   (server components)
        ↓
apps/admin/src/lib/data.ts              Admin SDK reads
        ↓
toReportRow()                           apps/admin/src/lib/reporterPrivacy.ts
        ↓   ReportRow has NO reporterId field — its absence IS the control,
        ↓   because Next serialises client-component props into the HTML
        ↓
<ActionForm> (client) → server action
        ↓
moderateReport(formData)                apps/admin/src/lib/actions.ts
        ├── evaluateModerationDecision() packages/shared-types  ← same rule the
        │                                Firestore rules mirror; refuses
        │                                self-approval server-side
        └── ONE transaction:
                incidentReports/{id}.status = approved | rejected
                adminAuditLogs/{id}         written in the SAME transaction
```

An algorithm never publishes a warning. Only `createBlackSpot` — an explicit
admin action — writes to `blackSpots`.

---

## Analytics service

```
POST /analyse   (Bearer token, dry_run defaults TRUE)
        ↓                               services/analytics/app/api/routes.py
require_token()                         fails CLOSED when unconfigured
        ↓
FirestoreRepository.fetch_approved_reports()
        ↓                               app/repositories/firestore.py
run_pipeline(reports, eps_m, min_samples, min_support)
        ↓                               app/services/pipeline.py
        ├── clean_reports()             app/services/cleaning.py — dedupe, validate
        ├── cluster_reports()           app/algorithms/clustering.py
        │        └── DBSCAN on the haversine metric
        ├── build_transactions()        app/algorithms/transactions.py
        ├── eclat()                     app/algorithms/eclat.py — hand-written,
        │                               cross-validated against mlxtend.fpgrowth
        └── score_cluster()             app/algorithms/risk_score.py — 0–100, versioned
        ↓
   dry_run == false ⇒ write_candidates() → blackSpotCandidates
                      write_job()        → analysisJobs
```

`blackSpotCandidates` documents carry **no `verified` and no `active` field**.
Their absence is what stops a candidate ever satisfying the mobile app's
`blackSpots` query even if one were copied across — the shape is part of the
safety argument. The mobile app cannot read the collection at all.

---

## Error handling

```
Anything throws
        ↓
toAppError(error) / new AppError(kind, userMessage, meta)   src/utils/errors.ts
        ↓
screens render AppError.userMessage — never a Firebase code
        ↓
logger.{debug,info,warn,error}(scope, message, meta)        src/utils/logger.ts
```

Two rules that recur: **nothing on the background task's path may throw** (an
escaping exception is reported by the OS as a task failure), and **Firestore
reads check `snapshot.metadata.fromCache`** because `getDocs` resolves empty
when offline rather than rejecting.

---

## Verification gates

```
npm run verify        no emulator, ~1 min
   format:check → lint → typecheck → test → test:scripts → scan:secrets
                                      │         │
                                      │         ├── node --test scripts/**/*.test.mjs
                                      │         ├── checkWorkflowParity.mjs
                                      │         └── checkNativeBuildOutput.mjs   ← DEC-001
                                      └── jest --coverage, per-path floors       ← DEC-004

npm run test:rules        156 tests   Firestore + Storage emulators
npm run test:functions     13 tests   Auth + Firestore + Storage + Functions emulators
npm run analytics:verify  293 tests   ruff + mypy + pytest, no emulator

.github/workflows/ci.yml         four jobs, mirrors the above
.github/workflows/advisories.yml weekly, reports only                            ← DEC-006
```

`checkWorkflowParity.mjs` fails if `ci.yml` stops running any step `verify` runs
— the two are written in different files and nothing else notices drift.

---

## Current Modification Context

### Task

A batch of improvements to project hygiene, abuse resistance, observability and
test coverage. All complete and verified. Recorded as DEC-001 through DEC-007.

### Files Involved

Removed from tracking:

- `/ios/` (13 files), `/app.json`

Added:

- `scripts/nativeBuildOutput.mjs`, `scripts/checkNativeBuildOutput.mjs`,
  `scripts/__tests__/nativeBuildOutput.test.mjs`
- `apps/mobile/src/features/alerts/backgroundRunHealth.ts`,
  `backgroundRunHealthStore.ts`, `backgroundRunCopy.ts`,
  `useBackgroundRunHealth.ts` (+ 2 test files)
- `apps/mobile/src/features/reports/EmailVerificationGate.tsx`
- `apps/mobile/src/features/alerts/__tests__/zoneStateStore.test.ts`
- `firebase/tests/integration/orphanSweep.test.mjs`
- `firebase/scripts/confirmEmail.mjs`
- `.github/workflows/advisories.yml`
- `docs/running.md`, `docs/verification.md`, `docs/what-has-been-built.md`,
  `docs/known-limitations.md`
- `decisions.md`, `flow.md`

Modified:

- `firebase/firestore.rules`, `firebase/tests/helpers.mjs`,
  `firebase/tests/ownership.test.mjs`
- `apps/mobile/src/features/auth/authService.ts`, `AuthProvider.tsx`
- `apps/mobile/src/features/alerts/backgroundLocationTask.ts`
- `apps/mobile/app/(tabs)/report.tsx`, `settings.tsx`
- `apps/mobile/src/features/reports/reportCopy.ts`
- `apps/mobile/jest.config.js`, `apps/mobile/package.json`, `package.json`
- `functions/src/sweepOrphanedImages.ts`
- `README.md`, `docs/demo.md`, `docs/security-and-privacy.md`, `.gitignore`

### Existing Flow → Modified Flow

**Report creation**

```
BEFORE:  ReportScreen → user !== null → ReportForm → submitIncidentReport
                                                          ↓
                                          rules: isSignedIn() && …

AFTER:   ReportScreen → user !== null
                     → !user.emailVerified → EmailVerificationGate  [NEW]
                     → ReportForm → submitIncidentReport
                                          ↓
                          rules: isSignedIn() && hasVerifiedEmail() && …  [NEW]
```

**Background task**

```
BEFORE:  handleBackgroundLocations → … → deliverAlert → recordAlert
         (every early return left no trace)

AFTER:   handleBackgroundLocations → … → deliverAlert → recordAlert
                                              ↓
                                   noteBackgroundRun(outcome, now)  [NEW]
         at all six exit points, plus 'failed' from the defineTask catch
```

**Orphan sweep**

```
BEFORE:  onSchedule(… async () => { …all logic inline… })
         unreachable from any test

AFTER:   onSchedule(… async () => { await runOrphanSweep(); })
                                          ↓
         runOrphanSweep(nowMs?) → OrphanSweepOutcome   [EXPORTED, testable]
```

### Call Chain

The chain exercised by the new integration tests:

```
firebase/tests/integration/orphanSweep.test.mjs
    ↓
import('../../../functions/lib/sweepOrphanedImages.js')   ← compiled output
    ↓
>>> runOrphanSweep(nowMs)                     [MODIFIED THIS SESSION]
    ├── adminFirestore()  → Firestore emulator
    ├── adminBucket()     → Storage emulator  ← the Phase 12 bug lived here
    └── planOrphanSweep() → pure
```

### Data Flow

- **Email verification.** `email_verified` originates in Firebase Auth, travels
  inside the ID token, and is read by `firestore.rules` on report creation. The
  app's copy in `user.emailVerified` is a local mirror that `reload()` updates —
  it does _not_ update the token, which is why `getIdToken(true)` is required.
- **Run telemetry.** `BackgroundRunOutcome` (a string label) plus
  `Date.now()` → `recordBackgroundRun()` → JSON → AsyncStorage. Read back
  through `parseBackgroundRunHealth()` → `summariseBackgroundRuns()` →
  `describeBackgroundRuns()` → two captions. Never leaves the device.
- **Sweep outcome.** Firestore `imageUrls` + Storage object metadata →
  `planOrphanSweep` → deletions → `OrphanSweepOutcome` returned to the caller and
  logged.

### Side Effects

- `npm run test` now writes `apps/mobile/coverage/` on every run (gitignored)
  and fails on a coverage floor breach.
- `npm run test:scripts` now shells out to `git ls-files`.
- Registration now performs an extra Auth call (`sendEmailVerification`).
- Sign-out clears one additional AsyncStorage key.
- The demo flow gained a required step; `docs/demo.md` and the README quick
  start were updated to match.

### Dependencies

No dependencies added or removed. Three were **removed** from the workspace root
(`expo`, `react`, `react-native`) as strays — they remain correctly declared in
`apps/mobile/package.json`. `sendEmailVerification` comes from the already-present
`firebase` package; `pip-audit` is invoked via `uvx` in CI only.

### Related Decisions

- `DEC-001` — root prebuild removal and the tracked-path guard
- `DEC-002` — verified email on report creation
- `DEC-003` — background run telemetry
- `DEC-004` — per-path coverage floors
- `DEC-005` — `runOrphanSweep` extraction
- `DEC-006` — weekly advisory reporting
- `DEC-007` — README reduction

### Verified state at time of writing

```
format:check · lint · typecheck · scan:secrets   pass
npm run test                966 tests, 45 suites  pass
npm run test:scripts         46 tests             pass
npm run test:rules          156 tests             pass
npm run test:functions       13 tests             pass
npm run analytics:verify    293 tests             pass
```
