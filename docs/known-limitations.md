# Known limitations

What this project does not do, has not verified, or has deliberately left out. Moved out of
the README so it can grow without pushing the setup instructions off the page.

**Read this before drawing conclusions about coverage, accuracy or readiness.**

---

## Known limitations

- **All fifteen phases are complete, which is not the same as production-ready.** The list below is what remains true, and it is long on purpose.
- **No EAS build exists.** The preview _configuration_ was verified by building it locally into a
  real release APK, but EAS needs an Expo account this repository does not have and `eas init` has
  never been run.
- **The emulator CI job has not yet been seen passing on GitHub.** The first push ran the workflow
  and three of four jobs were green; the fourth failed on a Java version pin, now corrected but not
  re-run. See the table in [`builds-and-releases.md`](builds-and-releases.md), which states
  claim by claim what is verified and what is not.
- **No crash reporter is registered.** Phase 14 added the seam — `setCrashReporter` in
  `src/utils/logger.ts`, with tests — but ships no vendor. Choosing one adds a data-processing
  relationship that the privacy policy and both stores' data-safety forms have to describe, which is
  a decision for whoever ships this rather than for a build phase. Until then the first users are the
  error-reporting system.
- **`engines.node >= 20.19.4` has never been exercised.** CI and `eas.json` both pin 24.15.0, the
  version everything here has actually been run on. The declared floor is either worth testing in a
  matrix or worth raising to match reality.
- **The first administrator is still granted by a script.** `npm run grant-role` uses the Admin SDK.
  Phase 12 added a `/roles` screen for every _subsequent_ role change, audited and with immediate
  revocation, but the bootstrap has to come from outside the system — a dashboard that could create
  its own first admin would be one anyone could create an admin in.
- **The real-project Admin SDK path has never authenticated to Google.** Everything has only ever run
  against emulators. Phase 14 extracted the credential handling into a tested pure function
  (`apps/admin/src/lib/serviceAccount.ts`) covering a missing variable, malformed JSON, each missing
  field, and — the one that matters — a service account belonging to a _different_ project than the
  dashboard was configured for, which the Admin SDK would otherwise follow silently with rules
  bypassed. What remains untested is `cert()` and the credential exchange itself, which needs a real
  project.
- **SMS delivery can never be confirmed.** `expo-sms` opens the phone's composer and returns no
  usable status on Android at all; on iOS "sent" means the user pressed send, not that anything
  arrived. Every outcome message in the app is phrased about the composer, never about delivery.
- **The SMS composer does not exist on the iOS simulator**, so the SOS send path can only be
  exercised on a real device (Phase 13). The copy, share and call fallbacks are the routes that
  work there — and they are the routes that work on a SIM-less device too.
- **Emergency contacts are other people's personal data.** They are stored only for their owner,
  capped at five, never told they were added, and never contacted automatically.
- **Orphaned report photographs are collected daily, not immediately.** Images upload before the
  report document is written, so abandoning the form after choosing a photo leaves an unreferenced
  object. That ordering is deliberate — a report must never reference photographs that never
  arrived — and the `sweepOrphanedImages` scheduled function removes anything unreferenced for more
  than 24 hours. The grace period is generous on purpose: deleting an object from a submission still
  being typed would strip evidence from a live report.
- **The scheduled sweep does not run in the local emulator.** It needs the Pub/Sub emulator, which
  `npm run emulators` does not start; the emulator logs `function ignored`. Its decision logic is
  pure and unit-tested (`functions/src/orphanSweep.ts`), but the scheduled trigger itself has only
  ever been verified by inspection.
- **Content type on an upload is client-declared.** The Storage rules allow-list image types and cap
  the size, but nothing inspects the bytes, so a file with a lying content type is accepted. See
  `docs/security-and-privacy.md` for the full list of known gaps.
- **The rate limit is per account, not per person.** Someone willing to register repeatedly can file
  more than the daily allowance. Bounding that needs registration controls, which Phase 12 does not
  add. There is also no App Check, so nothing proves a request comes from a genuine build of this
  app rather than a script driving the SDK with valid credentials.
- **A submitted report cannot be edited or withdrawn.** The Firestore rules refuse every client
  update and delete, so there is no way to change a report after sending it. Deleting your account
  removes pending and rejected reports, and anonymises approved ones — see
  `docs/security-and-privacy.md`.
- **Android map tiles require your own Google Maps Platform key** — see the † note in What has been built.
  Confirmed in Phase 13 on a _development build_, not only under Expo Go: without
  `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID` the whole map surface stays blank, so the markers and
  warning-radius circles are invisible along with the tiles. The data layer is unaffected — the
  header still reported "5 black spots nearby" and proximity warnings still fired — so this is a
  display-only limitation, but it makes the map screen impossible to assess visually without a key.
- **Background warnings are best-effort, and cannot be otherwise.** Neither platform guarantees a
  background location update will arrive, or arrive promptly. iOS defers and coalesces them and
  pauses them when it decides you have stopped moving; Android's Doze and manufacturer battery
  managers can suspend the task entirely, unpredictably and without notice. The app says this
  plainly rather than implying coverage it cannot provide. See
  [`background-monitoring.md`](background-monitoring.md).
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
  background notification has yet been observed actually firing. It is one of the eight manual
  scenarios still unexecuted — see [`manual-test-plan.md`](manual-test-plan.md) — and it
  needs a physical device rather than an emulator to mean anything.
- **Two unused capabilities were removed in Phase 14** — iOS `UIBackgroundModes: fetch`, appended
  unconditionally by `expo-task-manager`, and Android `SYSTEM_ALERT_WINDOW`, written into the main
  manifest by Expo's prebuild template. Both are stripped by
  `apps/mobile/plugins/withoutUnusedCapabilities.ts` and verified in the generated native files. The
  plugin **must be listed first** in `plugins`, because Expo runs mods in reverse registration
  order — the comment in `app.config.ts` explains why, and it looks like a mistake if you do not
  read it.
- **Dismissing the Android notification stops background warnings.** `killServiceOnDestroy` is on
  deliberately: a user must be able to stop location tracking without opening the app.
- **Background monitoring resumes on launch, not on reboot.** Phase 11 moved the reconciliation to
  the tab layout, so opening the app re-registers a task the OS dropped. Android still has no
  `BOOT_COMPLETED` receiver, so between a reboot and the next launch there is no monitoring.
- **Nearby facility data is crowd-sourced, uneven, and sometimes simply wrong.** The default
  provider is OpenStreetMap, whose coverage is excellent in much of Europe and patchy elsewhere. A
  facility may be closed, moved, or absent from the map entirely — and records are occasionally
  **miscategorised** by whoever entered them. A live central-London query returned a cosmetic clinic
  tagged `amenity=hospital`; nothing client-side can detect that, and no filtering was added to
  pretend otherwise. The screen says the list is a starting point, not a directory.
- **Opening hours are almost always unknown**, and are shown as unknown rather than guessed. Only a
  literal `24/7` tag is reported as always open, and nothing is ever reported as closed.
- **Nearby lookups default to a free public Overpass endpoint**, which throttles under load. That is
  why the provider chain and the offline cache exist. Phase 14 made it configurable —
  `EXPO_PUBLIC_OVERPASS_ENDPOINT`, validated as an absolute `https:` URL — but the default is still
  the public instance, and a deployment beyond demonstration should not stay on it.
- **The Google Places key is no longer in the app.** Phase 12 moved the call behind the
  `nearbyPlacesProxy` Cloud Function, which holds the key in Secret Manager;
  `EXPO_PUBLIC_GOOGLE_PLACES_PROXY_ENABLED` is now a flag, not a credential. The default
  configuration enables nothing and uses OpenStreetMap, which needs no key anywhere.
- **Straight-line distances.** A hospital 2 km away across a river may be a 15 km drive. Stated on
  the screen rather than implied away.
- **No location history is stored.** Alert logs deliberately record the black spot and distance but
  **not** coordinates, and both offline caches round the stored centre to roughly 1 km. Positions
  sent to a place provider are rounded to five decimal places.
- **The demo dataset is synthetic, and every place name in it is invented.** `npm run seed:all` writes twelve black spots and forty-two incident reports to the emulator, positioned relative to coordinates you pass. Roughly half of it exists to be invisible: one unverified and one inactive black spot, scattered reports that must be discarded as noise, and six unmoderated reports planted inside a cluster. It demonstrates the pipeline; it says nothing about any real road.
- **The risk score is a ranking heuristic, not a measurement of danger.** It orders a moderation
  queue using crowd-sourced, unevenly distributed data. Somewhere with no reports scores nothing,
  and that is a statement about reporting, not about safety. No score is shown to app users.
- **ECLAT patterns describe, they do not predict.** "In 89% of reports here" is a statement about
  the reports on record, not a claim about what will happen. Asserted in the tests.
- **The analytics service has only ever run against the Firestore emulator.** The Admin SDK's
  service-account and Application Default Credentials paths are written but never exercised.
- **Analysis has no schedule.** Runs are triggered by an authenticated HTTP call; running it
  periodically is deployment work that Phase 14 did not do — no scheduler exists, and none of the
  deployment path has ever been exercised.
- **Time-of-day patterns ignore timezones.** The service does not know a reporter's local offset,
  and guessing one would place incidents in the wrong band with an air of precision.
- **Emulators only so far.** Authentication and Firestore have been exercised against the local
  Emulator Suite, not a real Firebase project. Pointing at production is a config change
  (`.env`), but that path has not been tested.
- **The old "registration does not submit on iOS" note is no longer reproducible.** Phase 13 ran the
  flow on iOS 26.5 and it submitted and signed in, exactly as on Android. The note predates several
  phases of work on the form, nothing was knowingly done to fix it, and the cause was never
  diagnosed — so it is recorded as no-longer-reproducible rather than fixed.
- **Eight of the twenty manual scenarios have not been executed.** They need a physical device, a
  SIM, or a destructive action against a real account — background notification delivery, the draft
  queue surviving a force-quit, nearby help, contact CRUD, photo upload retry, the rate-limit and
  duplicate refusal copy, and account deletion. Steps for each are in
  [`manual-test-plan.md`](manual-test-plan.md). Account deletion and the submission limits
  are covered end to end by `npm run test:functions` and `npm run test:rules` respectively, so what
  is unverified there is the wording a user sees, not the enforcement.
- **A development build silently falls back to a stale cached bundle when Metro is unreachable.**
  It keeps running and shows screens from whenever that bundle was built, so anything observed after
  a "Cannot connect to Expo CLI" toast must be discarded. `adb reverse tcp:8081 tcp:8081` reconnects
  it. This cost real time during Phase 13.
- **Email addresses are not verified.** An account is usable immediately after registration.
  Requiring verification is a product decision that was left open rather than taken in Phase 12: it
  would bar a bystander at a crash from reporting until they had found their inbox.
- **No rate limiting on registration.** Report _submission_ is rate limited and deduplicated
  server-side (Phase 12), but account creation relies on Firebase's own throttling — so the daily
  report allowance is per account, not per person.
- **No screenshots, feature graphic or privacy-policy URL exist**, and no developer accounts have
  been registered. Play's background-location declaration in particular needs a video of the in-app
  disclosure, which needs a device build. See
  [`store-preparation.md`](store-preparation.md).
- **`npm audit` reports advisories in dev tooling** (`minimatch` via ESLint, `xcode` via
  `@expo/config-plugins`). These are transitive, build-time only, absent from the shipped bundle,
  and not fixable without breaking the Expo toolchain. Revisited in Phases 12 and 14.
- **Physical-device testing has still not been performed.** Verification so far is on the iOS
  Simulator and a `Pixel_9` (Android 16) emulator. Phase 14 produced an installable release APK but
  did not install it on real hardware, and this remains the largest single gap between this
  repository and a submittable app.

---
