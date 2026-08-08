# Architecture

How the pieces fit together, where the trust boundaries are, and why the shape is
what it is. For the technology choices themselves and their alternatives, see
[`adr/0001-platform-and-stack.md`](adr/0001-platform-and-stack.md).

---

## 1. The one diagram worth having

```
                          ┌──────────────────────────┐
                          │   Firebase Auth          │
                          │   email/password         │
                          │   + custom-claim roles   │
                          └───────────┬──────────────┘
                                      │ identity + role
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
┌───────┴────────┐          ┌─────────┴──────────┐        ┌─────────┴──────────┐
│  apps/mobile   │          │   apps/admin       │        │ services/analytics │
│  Expo / RN     │          │   Next.js          │        │ FastAPI / Python   │
│                │          │                    │        │                    │
│  Web SDK       │          │  ADMIN SDK         │        │  ADMIN SDK         │
│  rules APPLY   │          │  rules BYPASSED    │        │  rules BYPASSED    │
└───────┬────────┘          └─────────┬──────────┘        └─────────┬──────────┘
        │                             │                             │
        │  reads verified spots       │  moderates reports          │  reads approved
        │  writes pending reports     │  publishes black spots      │  reports, writes
        │  writes own profile         │  writes audit logs          │  candidates only
        │                             │                             │
        └─────────────┬───────────────┴──────────────┬──────────────┘
                      │                              │
              ┌───────┴────────────┐        ┌────────┴─────────┐
              │  Cloud Firestore   │        │  Cloud Storage   │
              │  + security rules  │        │  + rules         │
              └───────┬────────────┘        └──────────────────┘
                      │
              ┌───────┴────────────┐
              │  functions/        │  deleteAccount, exportMyData,
              │  Cloud Functions   │  nearbyPlacesProxy, sweepOrphanedImages
              │  ADMIN SDK         │
              └────────────────────┘
```

The important thing in that picture is not the boxes. It is that **exactly one of
them runs with security rules applied**, and it is the one users install.

---

## 2. The trust model

### The mobile app is untrusted, and is written as though it is

It holds no credential that grants anything. Every `EXPO_PUBLIC_*` value is inlined
into the JavaScript bundle by Metro and can be read out of the binary in minutes, so
the app's configuration is public by construction — stated in
`src/config/env.ts` and designed around rather than mitigated.

What stops a modified client doing damage is Firestore and Storage rules, not app
code. The app's own validation exists to give a person a good error message, not to
protect data. Every constraint that matters is enforced twice, and the server copy is
the one that counts:

| Constraint                       | App                       | Server                                         |
| -------------------------------- | ------------------------- | ---------------------------------------------- |
| Report field shapes              | Zod schema, inline errors | `firestore.rules`                              |
| Daily report limit               | Disabled submit button    | `firestore.rules`, via batch-coupled counters  |
| Duplicate detection              | Warning before submitting | `firestore.rules`, via a fingerprint document  |
| Nobody approves their own report | Button hidden             | `evaluateModerationDecision`, in the dashboard |
| Unapproved reports are not spots | Query filters             | `verified && active` required by the rules     |
| Photo type and size              | Picker constraints        | `storage.rules`                                |

### Two services run with rules bypassed, and that is the whole point

`apps/admin` and `services/analytics` both use the Firebase Admin SDK, which ignores
security rules entirely. That is necessary — a moderator must be able to write fields
no client may write — and it means **the rules stop being the enforcement point for
anything those two do, and their own code becomes it.**

Two consequences run through both:

1. Every privileged action re-checks authorisation in code, using the same
   `evaluateModerationDecision` the rules mirror. Not because the rules will catch a
   mistake — they will not — but because nothing else will.
2. Every privileged action writes its `adminAuditLogs` entry **in the same Firestore
   transaction** as the change itself. An action cannot happen without its record,
   because they are the same write.

### Cloud Functions exist for the four things that genuinely need a credential

`deleteAccount`, `exportMyData`, `nearbyPlacesProxy`, `sweepOrphanedImages`. Nothing
is in `functions/` for convenience. Each one either spans collections a client may not
touch, deletes an Auth record, or holds a secret the app cannot.

---

## 3. Layering, and the rule that produced it

Inside the mobile app:

```
app/          Expo Router routes. Layout and navigation only.
src/
  components/ Presentational. No data access, no Firebase import.
  features/   Screens, hooks, and the pure cores below them.
  services/   Firebase initialisation and repositories. The only Firebase imports.
  utils/      Geo maths, logger, error normalisation.
```

The rule that shaped it: **business-critical logic goes in a pure function with no
I/O, tested exhaustively, and the screen calls it.** Not as an abstraction exercise —
because the alternative is a safety decision that can only be verified by driving a
car past a junction.

The pure cores, and what each one would cost if it were wrong:

| Module                       | Decides                                               |
| ---------------------------- | ----------------------------------------------------- |
| `proximityEngine.ts`         | Whether to warn, and whether this warning is a repeat |
| `draftQueue.ts`              | Whether an offline report is resent or duplicated     |
| `reportLimits.ts`            | Whether a submission is over the limit or a duplicate |
| `evaluateModerationDecision` | Whether this person may approve this report           |
| `eclat.py`, `risk_score.py`  | What the analytics service proposes, and how it ranks |

Every one is reachable from more than one caller. `proximityEngine.ts` in particular
runs unchanged in the foreground _and_ inside the headless background task — which is
why hysteresis, cooldown and overlap folding cannot behave differently between them.

`packages/shared-types` holds the vocabulary and the moderation rules that both apps
must agree on. It is consumed as **TypeScript source**, not a build artefact; the
`functions` workspace cannot do that, because Cloud Functions run compiled JavaScript
on a runtime that does not strip types, so it keeps a checked copy guarded by a test.

---

## 4. How data moves

### A proximity warning

```
expo-location  →  proximityEngine (pure)  →  banner + notification + haptics
      ↑                    ↑
   position       black spots from Firestore (geohash range query),
                  or from the AsyncStorage cache when offline
```

The engine is given a position and a set of spots and returns what to warn about. It
holds the zone state, applies hysteresis so a warning does not flicker at the
boundary, enforces a cooldown, and folds overlapping zones into one warning. It knows
nothing about React, Firebase or notifications.

Offline, the cache answers instead — and the UI says the data is saved rather than
live. `getDocs` does **not** throw when offline; it resolves from an empty local cache
and returns `[]`, indistinguishable from "nothing here". Every repository checks
`snapshot.metadata.fromCache` and throws a network error instead. That check is
load-bearing: without it, "no signal" renders as "no black spots nearby".

### A report becoming a black spot

```
user submits            →  incidentReports, status: "pending"
moderator approves      →  status: "approved"   (+ audit log, same transaction)
analytics run           →  blackSpotCandidates  (a proposal, not a warning)
administrator publishes →  blackSpots, verified: true, active: true (+ audit log)
```

Four steps, two of them human, and **no arrow skips a box**. A report cannot become a
warning without a person deciding twice. The candidate stage is where an algorithm's
output stops: `blackSpotCandidates` cannot be read by the mobile app at all, cannot be
written by any client whatever role its token carries, and carries no `verified` or
`active` field — so it could not satisfy the app's query even if a document were
copied across.

### The analytics pipeline

```
approved reports → clean & dedupe → DBSCAN (haversine, 150 m, min 3)
                 → per-cluster transactions → ECLAT (min support 0.5)
                 → risk score 0–100 (versioned) → blackSpotCandidates
```

It runs on a server and never on a phone. It reads only `approved` reports — a
pending or rejected report is invisible to it, which is what makes the moderation step
meaningful rather than decorative.

---

## 5. Boundaries that are deliberate

**No location history is stored.** The proximity engine holds a position in memory and
persists zone state, not a trail. `alertLogs` record which black spot and how far
away, not where the user was. Both offline caches round the stored centre to roughly a
kilometre.

**Reporter identity does not reach the moderation UI.** The dashboard shows a salted
pseudonym. A moderator can recognise a repeat reporter across rows without learning
who they are.

**Risk is never communicated by colour alone.** Every risk level carries a label and a
shape as well as a hue, in the app and on the map. Contrast is measured in the test
suite, not reviewed by eye — a pass that found two real WCAG failures.

**The app never claims delivery, response or coverage.** `expo-sms` hands a message to
the phone's composer and returns nothing usable on Android; "sent" on iOS means the
user pressed send. Every outcome message is phrased about the composer. Nothing in the
app implies it contacts the emergency services, because it does not.

---

## 6. Where to look

| You want to understand               | Start at                                               |
| ------------------------------------ | ------------------------------------------------------ |
| The collections and their fields     | [`data-model.md`](data-model.md)                       |
| What the rules enforce, and do not   | [`security-and-privacy.md`](security-and-privacy.md)   |
| The clustering and pattern mining    | [`eclat-methodology.md`](eclat-methodology.md)         |
| Background location and its limits   | [`background-monitoring.md`](background-monitoring.md) |
| Settings, offline cache, drafts      | [`settings-and-offline.md`](settings-and-offline.md)   |
| The nearby-facilities provider chain | [`nearby-places.md`](nearby-places.md)                 |
| Running the whole thing              | [`demo.md`](demo.md)                                   |
| Builds, CI and releases              | [`builds-and-releases.md`](builds-and-releases.md)     |
| Why anything is the way it is        | [`phase-0-audit.md`](phase-0-audit.md), [`adr/`](adr/) |
| When something will not start        | [`troubleshooting.md`](troubleshooting.md)             |
| Building for a real iPhone           | [`ios-device-builds.md`](ios-device-builds.md)         |
