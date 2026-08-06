# Running the demonstration

A reproducible walkthrough of the whole system: the app, the moderation
dashboard and the analytics service, against the Firebase emulators with seeded
data. About twenty minutes the first time, most of it spent compiling a
development build.

Every step below states **what you should see**. That is the point of the
document — a demo you cannot check is a demo you cannot trust, and "it ran
without an error" is not the same as "it worked".

Nothing here touches a real Firebase project, costs anything, or needs an
account. The project id is `demo-accident-black-spot-detection`, and the `demo-`
prefix is meaningful to Firebase: the SDK cannot reach Google Cloud with it.

---

## 0. Before you start

You need Node 20.19.4+ (developed on 24.15.0), the Firebase CLI, a JDK for the
emulators, [uv](https://docs.astral.sh/uv/) for the Python service, and Xcode or
Android Studio for the mobile build. Full list in the README's Prerequisites.

```bash
npm install
```

```bash
cp .env.example apps/mobile/.env
cp apps/admin/.env.local.example apps/admin/.env.local
cp services/analytics/.env.example services/analytics/.env
```

```bash
cd services/analytics && uv sync && cd ../..
```

The three copied files are emulator defaults and work unmodified. None contains a
credential.

---

## 1. Start the emulators

**Terminal 1**, and leave it running:

```bash
npm run emulators
```

**You should see** Auth, Firestore, Storage and Functions all listed as running,
and the Emulator UI on <http://localhost:4000>. The Functions emulator builds
first, so the first start takes longer than later ones.

> If it exits complaining about ports, something is already using 4000, 5001,
> 8080, 9099 or 9199 — often a previous run that did not shut down.

---

## 2. Seed the demo data

**Terminal 2.** Use coordinates near wherever you are going to pretend to be —
the whole dataset is positioned relative to this centre, which is what makes it
usable outside London:

```bash
npm run seed:all -- 51.5074 -0.1278
```

**You should see** twelve black spots and forty-two incident reports written:

```
  + demo-kings-junction          critical visible
  …
  + demo-unverified-candidate    critical HIDDEN (expected)
  + demo-inactive-spot           high     HIDDEN (expected)

Done. 10 of 12 should be visible in the app; 2 are deliberately excluded.

  + site A       12 approved  accident    mostly 02:00, all distinct reporters
  + site B       5 approved  pothole     older, low severity, 2 reporters
  + site C       8 approved  crime       mostly 21:00 and high severity
  + site D       6 approved  mixed       mostly 08:00 and medium severity
  + scattered    5 approved  isolated    must be discarded as noise
  + unmoderated  6 pending/rejected inside site A — must be ignored

Done. 36 approved of 42 total.
```

### What is in the dataset, and why

It is built so the system's _guarantees_ can be observed, not just its features.
Roughly half of it exists to be invisible.

**Black spots — 12 documents, 10 visible.**

- Every risk level appears, so marker and circle styling can be compared.
- Two spots overlap deliberately, which exercises the combined-warning path.
- Two sit beyond the 1000 m default alert radius, one of them the highest-risk
  record in the set. Raising the radius in Settings brings them into range and
  changes which risk level is the worst thing nearby.
- **One is unverified and one is inactive.** Neither must ever appear in the app.
  They are the point of the seed as much as the visible ones: if they show up,
  the security rules or the repository query have regressed.

**Incident reports — 42 documents, 36 approved.**

- **Site A** is a strong cluster: 12 reports, 12 distinct reporters, recent, high
  severity. It should score highest.
- **Site B** is weak: 5 reports, 2 reporters, roughly a year old, low severity.
  It should score visibly lower. A single number with nothing to compare it
  against says nothing at all, which is why both exist.
- **Sites C and D** carry patterns of different shapes — see step 5.
- **Five scattered reports** sit 9 km or more from everything. DBSCAN must label
  them noise. If a candidate appears for one, the pipeline is turning isolated
  events into hazards.
- **Six pending and rejected reports sit inside site A's radius.** They must
  never influence a candidate. If site A's report count is not exactly 12, an
  unmoderated report has reached the algorithm — the precise failure the whole
  moderation flow exists to prevent.

---

## 3. The mobile app

**Terminal 3.** This builds a development build; Expo Go is not sufficient,
because the background task and `expo-notifications` need native modules it
cannot provide.

```bash
npm run ios
```

or

```bash
npm run android
```

Register an account — any email and a password of eight characters or more. The
Auth emulator accepts anything and sends nothing.

Then set the simulator's location to the coordinates you seeded around.

<details>
<summary>iOS simulator</summary>

Features → Location → Custom Location, or:

```bash
xcrun simctl location booted set 51.5074,-0.1278
```

The simulator resets to San Francisco on boot, and it **ignores a `simctl
location set` issued before the app has resolved its first fix**. Seed the
location, then use the app's own locate control to force a refetch.

</details>

<details>
<summary>Android emulator</summary>

Extended controls (⋯) → Location → set the coordinates → Send.

**Android map tiles need `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID` in
`apps/mobile/.env`.** Without it the entire map surface is blank — markers and
radius circles as well as tiles — so the map screen cannot be assessed visually.
The data layer is unaffected: the header still counts nearby spots and warnings
still fire. iOS uses Apple Maps and needs no key.

</details>

### What to look for

| Check                              | Expected                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------- |
| Map screen                         | Pins with warning-radius circles. **Ten**, never twelve.                    |
| "UNVERIFIED" / "INACTIVE" pins     | Absent. Their names say so, so they are unmistakable if they appear.        |
| Approaching a spot                 | One banner, a notification and haptics — then nothing while you stay inside |
| Two overlapping spots              | One combined warning, not two                                               |
| Settings → alert distance          | Raising it to 2000 m brings the two far spots into range                    |
| Risk levels                        | A label and a shape as well as a colour, everywhere                         |
| Kill the emulators, reopen the app | Warnings still work from the cache, visibly labelled as saved data          |

That last row is worth doing. It is the difference between an app that degrades
and one that silently shows an empty map when there is no signal.

### File a report

Report tab → pick a type and severity, write a description, adjust the pin,
submit. Then open "My reports".

**You should see** it listed as **Pending**. It must **not** appear on the map as
a black spot. A report is never turned into a warning automatically; that is the
next step, and it involves a person.

---

## 4. The moderation dashboard

**Terminal 4.** The dashboard needs a moderator, and the first one has to be
granted from outside the system — a dashboard that could create its own first
admin would be one anyone could create an admin in.

```bash
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

```bash
npm run grant-role -- you@example.test admin
```

Use the address you registered with in the app. Then:

```bash
npm run admin
```

Sign in at <http://localhost:3000>.

### What to look for

| Check                     | Expected                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| Reports queue             | Your report, oldest first, with a **pseudonym** rather than a uid |
| Approving your own report | **Refused.** Not a hidden button — refused, server-side           |
| Audit tab                 | An entry for every privileged action, with no gaps                |
| Black spots tab           | Publish and withdraw, each one audited                            |
| `/roles`                  | Grant and revoke, effective immediately                           |

The self-approval refusal is worth testing deliberately, because it is the claim
most likely to be implemented in the UI and nowhere else. It is enforced by
`evaluateModerationDecision`, which the dashboard calls and the Firestore rules
mirror. Sign in as a second account and approve from there to see the report move
to **Approved** in the app.

---

## 5. The analytics service

**Terminal 5:**

```bash
npm run analytics
```

**You should see** it start on <http://localhost:8000>, with interactive docs at
`/docs`. Then, in any terminal:

```bash
npm run analyse
```

That is a **dry run** — it computes everything and writes nothing. `dry_run`
defaults to true in the API for the same reason: a run writes to the moderation
queue, and someone exploring should not fill it by accident.

**You should see** four clusters, and output of this shape:

```
  reports ingested       36
  after cleaning         36 (0 duplicates removed)
  clusters found         4

── accident · critical · score 77
   12 reports from 12 people, radius 357 m
   corroboration 0.71  severity 0.90  volume 0.50  recency 1.00
   • time of day night and incident type accident — in 83% of reports here
   …

── crime · high · score 72
   8 reports from 8 people, radius 230 m
   • severity high and time of day evening and incident type crime — in 88% of reports here
   …

── accident · high · score 57
   6 reports from 6 people, radius 183 m
   • severity medium and time of day morning-peak — in 83% of reports here
   …

── unsafe-road · medium · score 32
   5 reports from 2 people, radius 83 m
   • severity low and time of day daytime and incident type pothole — in 100% of reports here
```

### The five things to check, and what each one proves

1. **`reports ingested` is 36, not 42.** The six pending and rejected reports
   sitting inside site A were not read. Moderation is a real gate, not a label.
2. **Four clusters, not five.** The scattered reports were labelled noise.
   Isolated events do not become hazards.
3. **Site A's pattern is a pair** — `time of day night and incident type
accident`. The planted one. If it is missing, the mining stage has regressed.
4. **Site C's pattern is a triple** — `severity high and time of day evening and
incident type crime`. This is the one that matters most: a miner that only
   ever emitted pairs would still pass site A. It is also a _crime_ cluster
   rather than a traffic one, which the app claims to cover and a
   collisions-only dataset would quietly fail to demonstrate.
5. **Site D's pattern contains no `incident type` at all** — its types are mixed
   on purpose, so only `time of day morning-peak` and `severity medium` clear the
   threshold. Without it the demo would suggest the algorithm merely rediscovers
   "crashes happen at junctions". What is worth telling a moderator is usually
   _when_.

The score components are worth reading side by side. Site A and site B differ on
every one of the four — corroboration 0.71 vs 0.29, recency 1.00 vs 0.59 — which
is what makes 77 against 32 legible rather than arbitrary.

> `day type weekday` and `day type weekend` items appear in some runs and not
> others, because the seeded timestamps are relative to the moment you seed. They
> are real, they are not planted, and they should not be relied on. The five
> checks above hold whatever day you run this.

### Write the candidates

```bash
npm run analyse -- --write
```

**You should see** `wrote 4 candidates`. Then, and this is the part worth
watching:

| Check                               | Expected                       |
| ----------------------------------- | ------------------------------ |
| The mobile app's map                | **Unchanged. Still ten pins.** |
| Emulator UI → `blackSpotCandidates` | Four documents                 |
| Dashboard, as a moderator           | The candidates are visible     |

**An algorithm produced four proposals and not one of them reached a user.**
Three independent things ensure that, and any one of them would be enough:
the mobile app cannot read `blackSpotCandidates` at all; no client can write the
collection whatever role its token carries; and a candidate carries no `verified`
or `active` field, so a document copied verbatim into `blackSpots` would still
fail the app's query.

Publishing one is an administrator's deliberate, audited act, in the dashboard.

---

## 6. The verification gates

Nothing above proves the code is correct. These do, as far as anything can:

```bash
npm run verify
```

Format, lint, strict typecheck, 1,051 unit tests, and the secret scan. **No
emulator needed** — run it before pushing.

```bash
npm run verify:all
```

Adds the Python suite (293 tests), the security rules (151, against the real
rules engine), and the end-to-end Cloud Functions tests (8). Needs the emulators
running.

The rules suite is the one to run if you change anything about access control,
and the reason is in [`data-model.md`](data-model.md): a rules bug that denied
every profile update survived eleven phases behind 143 tests that only ever
asserted refusals.

---

## 7. Shutting down

Ctrl-C each terminal. The emulators discard everything on exit — re-seed next
time, or keep the data:

```bash
npm run emulators:persist
```

That writes to `.firebase-data/` on exit and reads it back on start. It is
gitignored.

---

## What this demonstration does not show

Being explicit, because a demo that stops at the happy path implies coverage that
is not there:

- **No physical device.** Everything above is a simulator or an emulator. SMS
  cannot be sent from a simulator at all, and background location behaves
  differently on real hardware under real battery management.
- **Background warnings have never been observed firing.** The logic is tested
  and the native configuration is verified in the built binary, but no
  notification has been seen arriving from the background task.
- **Eight of the twenty manual scenarios are unexecuted** — see
  [`manual-test-plan.md`](manual-test-plan.md). Account deletion and the
  submission limits are covered end to end by the automated suites, so what is
  unverified there is the wording a user reads, not the enforcement.
- **Nothing has run against a real Firebase project**, and no build has been
  produced by EAS. See [`builds-and-releases.md`](builds-and-releases.md), which
  states claim by claim what is verified and what is not.
