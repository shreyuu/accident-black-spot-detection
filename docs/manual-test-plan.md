# Manual test plan and results

Phase 13. Twenty scenarios covering the behaviour that automated tests cannot
reach — real permissions, real OS dialogs, real process death — plus what
happened when they were run.

**Executed 2026-08-04** on an Android Pixel_9 emulator (API 36) and an iOS 26.5
simulator, both development builds, against the Firebase Emulator Suite. Results
are recorded per platform below. The scenarios marked ⬜ need a physical device,
a SIM, or a destructive action against a real account, and carry the steps to run
them.

### Getting the iOS build to compile

The iOS development build had never compiled in this environment, and the cause
was narrower than the earlier note suggested. Recorded here because the symptom
points at the wrong thing:

- `xcodebuild` reported **no simulator destinations at all** — not with a booted
  simulator, not with `generic/platform=iOS Simulator`, not with
  `-sdk iphonesimulator`. The only destinations it listed were physical devices,
  each erroring "iOS 26.5 is not installed".
- That message is easy to read as "your simulators are wrong". They were fine:
  `simctl` listed iOS 26.2 devices and one **booted successfully**.
- The actual gap was Xcode 26.6's **iOS Simulator platform**, which ships
  separately from the SDK. `xcodebuild -showsdks` listed `iphonesimulator26.5`,
  so the SDK was present while the platform was not — which is why every
  destination-based diagnostic came back empty rather than explaining itself.

The fix is one command, needs no password, and downloads 8.52 GB:

```bash
xcodebuild -downloadPlatform iOS
```

On a nearly-full disk, clear space first — the existing runtime can be listed and
removed with `xcrun simctl runtime list` and `xcrun simctl runtime delete <id>`,
and re-downloaded later.

> The scenario list is derived from the phase gates in `docs/phase-0-audit.md`
> §7 and the safety rules in the README, because the original brief's list is not
> in the repository. Each scenario names the gate it exercises so the mapping is
> checkable rather than asserted.

---

## How to run these yourself

```bash
npm run emulators
```

```bash
npm run seed -- <your-latitude> <your-longitude>
```

```bash
npm run android
```

Then move the simulated device with the emulator console, which is how every
location-dependent scenario below was driven:

```bash
(printf 'auth %s\ngeo fix <lon> <lat>\n' "$(cat ~/.emulator_console_auth_token)"; sleep 2) | nc localhost 5554
```

Note the argument order: `geo fix` takes **longitude first**.

---

## Results

| #   | Scenario                               | Gate         | Android         | iOS             |
| --- | -------------------------------------- | ------------ | --------------- | --------------- |
| 1   | Register a new account                 | Phase 2      | ✅ Pass         | ✅ Pass         |
| 2   | Session survives process death         | Phase 2 (H1) | ✅ Pass         | ✅ Pass         |
| 3   | Permission rationale precedes prompt   | Phase 3      | ✅ Pass         | ✅ Pass         |
| 4   | Only verified+active spots load        | Phase 4      | ✅ Pass         | ✅ Pass         |
| 5   | Proximity warning fires                | Phase 4      | ✅ Pass         | ✅ Pass         |
| 6   | Overlapping zones fold into one        | Phase 4      | ✅ Pass         | ✅ Pass         |
| 7   | Empty state is honest                  | Safety rule  | ✅ Pass         | ✅ Pass         |
| 8   | Unapproved report never published      | Phase 5      | ✅ Pass         | ⬜ Not executed |
| 9   | SOS makes no delivery claim            | Phase 6 (M7) | ✅ Pass         | ⬜ Not executed |
| 10  | Settings render with correct defaults  | Phase 11     | ✅ Pass         | ✅ Pass         |
| 11  | Preference saves to the account        | Phase 11     | ❌ → fixed      | ✅ Pass         |
| 12  | Export and delete screen               | Phase 12     | ✅ Pass         | ✅ Pass         |
| 13  | Data export returns the account's data | Phase 12     | ✅ Pass         | ✅ Pass         |
| 14  | Background warning while app closed    | Phase 8      | ⬜ Not executed | ⬜ Not executed |
| 15  | Draft survives a force-quit            | Phase 11     | ⬜ Not executed | ⬜ Not executed |
| 16  | Nearby help list                       | Phase 9      | ⬜ Not executed | ⬜ Not executed |
| 17  | Emergency contact CRUD                 | Phase 6      | ⬜ Not executed | ⬜ Not executed |
| 18  | Report with photo, upload retry        | Phase 5      | ⬜ Not executed | ⬜ Not executed |
| 19  | Rate limit and duplicate refusals      | Phase 12     | ⬜ Not executed | ⬜ Not executed |
| 20  | Account deletion erases the data       | Phase 12     | ⬜ Not executed | ⬜ Not executed |

### The map only renders on iOS

The single largest platform difference, and it is a **tooling** difference rather
than a code one. iOS uses Apple Maps (the Phase 0 decision, taken to stay
unblocked without a Google key), so the map surface renders with no credential:
tiles, warning-radius circles and markers all appear. Android needs
`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID` and without it the whole surface stays
blank — markers and circles included, not just tiles.

So the marker design could be assessed for the first time on iOS, and it holds
the safety rule: each marker is labelled **CRITICAL / HIGH / MEDIUM / LOW in
words** as well as by colour.

## 1. Register a new account — ✅ both platforms

**Why it matters.** The README has recorded since Phase 2 that "the registration
screen would not submit on the iOS simulator", undiagnosed.

**Steps.** Launch → Create an account → fill name, email, password, confirm,
accept terms → Create account.

**Result — Android.** Submitted and signed in.

**Result — iOS.** **Also submitted and signed in.** The account
`grace@example.test` was created with `role: "user"` and the app proceeded to the
permission flow.

> **Correction.** An earlier revision of this document concluded from the Android
> run alone that "the defect is iOS-only". That was wrong. Running the same flow
> on iOS 26.5 shows registration working there too, so the README's long-standing
> note is **not reproducible** on the current codebase and toolchain. What
> changed between then and now is not known — the note predates several phases of
> work on the form — so it is recorded as no-longer-reproducible rather than
> fixed, since nothing was knowingly done to fix it.

Confirmed along the way, on both platforms:

- inline validation is live and correct — a malformed address produced
  "Enter a valid email address, for example name@example.com" and blocked
  submission;
- the created profile has `role: "user"`, so a client cannot self-assign a
  privileged role at registration.

---

## 2. Session survives process death — ✅

**Steps.** Sign in → `adb shell am force-stop <package>` → relaunch.

**Result.** The app showed "Restoring your session…" and returned signed in.
This is hypothesis H1 from the Phase 0 audit, validated on a real process kill
rather than a reload.

---

## 3. Permission rationale precedes the OS prompt — ✅

**Steps.** First launch after signing in, open the map.

**Result.** The app's own explanation appears **before** the system dialog, says
what location is used for, states that the position is not uploaded and no
history is kept, and says the app keeps working without it. Only after tapping
through does the OS dialog appear, and it requests foreground access only
("While using the app").

---

## 4. Only verified and active spots load — ✅

**Setup.** `npm run seed` writes seven spots: five ordinary, one unverified, one
inactive.

**Result.** `matched: 5`. The unverified candidate and the inactive spot were
both excluded by the query, which is the rule that stops an algorithm proposal or
a withdrawn spot reaching a user as an official hazard.

---

## 5. Proximity warning fires — ✅

**Steps.** `geo fix` onto a seeded spot.

**Result.** The banner appeared with:

- the name, "Kings Road junction";
- **CRITICAL** as a word, not only a colour;
- "You are in a critical-risk accident area. Reduce speed and stay alert." —
  presence phrasing rather than the nonsensical "0 m ahead";
- a dismiss control and "See details".

---

## 6. Overlapping zones fold into one warning — ✅

**Result.** Two zones were entered at once and produced **one** banner reading
"You are also within 1 other warning zone", not two stacked banners. Three things
to dismiss while driving is the failure this avoids.

---

## 7. The empty state is honest — ✅

**Result.** With no spots in range: "No black spots recorded nearby — **This does
not mean the area is safe** — coverage is incomplete. Stay alert." The app does
not let absence of data read as evidence of safety.

---

## 8. An unapproved report is never published — ✅

**Result.** "My reports" showed pending reports badged "Awaiting review" with the
text "A moderator has not reviewed this yet. It is not visible to other people
and is not shown as a black spot", and the screen header repeats it. Status is
carried by an icon and a word, never colour alone.

---

## 9. SOS makes no delivery claim — ✅

**Result.** The screen leads with "This is not a way to contact the emergency
services. If you are in danger or someone is hurt, call your local emergency
number first."

It then shows **"Exactly what your contacts will receive"** — the complete
message, including the accuracy disclosure "(accurate to within about 20 m)", a
map link and a timestamp. With no contacts saved it says so plainly and still
offers copy and share.

---

## 10. Settings render with correct defaults — ✅

**Result.** Account block, appearance selector, alert radius defaulting to
**1.0 km** with the named steps, alert/sound/haptics toggles, background
monitoring **off by default** with its battery and permission disclosure, the
Phase 12 "Your data" section, and the safety notices. The note that the on-screen
warning cannot be switched off is present.

---

## 11. Preference saves to the account — ❌ **failed on Android, fixed, verified on both**

**This is the scenario that justified the device pass.**

**Steps.** Settings → Appearance → Dark. Then read the profile document.

**Result — first run.** The theme changed on screen but the profile document was
unchanged. The log carried:

```
WARN [usePreferences] Could not save preferences to the account
  PERMISSION_DENIED: evaluation error at L192:24 for 'update',
  Function not found error: Name: [keys].
```

**Cause.** `firestore.rules` called `hasNoPrivilegedFields(...affectedKeys())`,
but the helper was written as though it received a Map and called `.keys()` on
it. `affectedKeys()` returns a **Set**, which has no `keys()`, so the rule raised
an error — and an erroring rule is a denial. **Every profile update had been
refused since Phase 2, and saving a preference to the account had never once
worked.**

**Why nothing caught it.** There was no `users` update test in the rules suite —
143 tests covering creation, deletion and every refusal, and none of the one
operation the settings screen performs. Phase 11 then mirrors preferences
locally and downgrades a sync failure to "Saved on this device, but not to your
account yet", so the app kept working and said something reassuring.

**Fix.** `hasNoPrivilegedFields` now takes the Set and calls `hasAny` directly.
Six regression tests were added in `firebase/tests/privacy.test.mjs`, the first
of which asserts the **happy path** — a rule that denies everything passes every
test that only checks refusals.

**Re-verified on both platforms.** After the fix, the same interaction wrote
`darkModePreference: "dark"` to the account with no warning on Android, and on
iOS wrote both `darkModePreference: "dark"` and `alertRadiusM: 500` with zero
save failures in the log. The bug was never platform-specific — it was in the
security rules, so it affected every client equally; Android simply happened to
be where it was caught.

---

## 12. Export and delete screen — ✅

**Result.** Settings → Your data renders both sections. The delete section states
what is erased and, before the decision rather than after, what is **kept**:
approved reports, with the identity removed, because a published warning rests on
them. "Delete my account" is **disabled** until `DELETE` is typed.

---

## 13. Data export returns the account's data — ✅

**Steps.** Your data → Copy to clipboard.

**Result.** The `exportMyData` Cloud Function ran and returned
`{"reports":0,"contacts":0,"alerts":1}`. The single alert log is the proximity
warning from scenario 5 — written by the app, then read back by the function, so
the two halves cross-validate. The clipboard held the export JSON beginning
`{"format":"accident-black-spot-detection/…`, and the screen warned that the
clipboard is readable by other apps.

---

## 14–20. Not executed

Each needs something this environment cannot provide. Steps are given so they can
be run without rediscovering them.

### 14. Background warning while the app is closed — ⬜

Needs a real device: the Android emulator does not deliver background location
updates on a realistic schedule, and OS batching is the behaviour under test.

Settings → enable "Warn me while the app is closed" → accept the disclosure →
grant background location → close the app → travel into a high or critical zone.
Expect a notification. Then disable and confirm updates stop.

### 15. Draft survives a force-quit — ⬜

Enable airplane mode → fill in a report → submit → confirm it is queued →
force-stop the app → relaunch → confirm the draft is still queued → restore
connectivity → confirm it submits.

### 16. Nearby help list — ⬜

SOS → "Nearby help". Needs outbound internet to the Overpass API, and a location
with mapped hospitals or police stations. Confirm attribution is shown and that a
provider failure degrades to the cache rather than an empty list.

### 17. Emergency contact CRUD — ⬜

Settings → Manage emergency contacts. Add, edit, set primary, delete. Confirm the
five-contact cap and that a deleted contact disappears from the SOS recipient
list.

### 18. Report with a photograph, and upload retry — ⬜

Needs the camera or a populated gallery, which the emulator lacks. Submit a
report with three photographs, interrupt connectivity mid-upload, confirm the
progress and cancel controls behave and that a retry resumes rather than
restarting.

### 19. Rate limit and duplicate refusals — ⬜

Submit the same incident type at the same place twice within six hours; expect
"You have already reported this kind of incident at this location recently."
Then submit eleven reports in a day; expect the daily-limit message. Both are
covered by `firebase/tests/limits.test.mjs` against the real rules engine, so
this scenario is confirming the _copy_, not the enforcement.

### 20. Account deletion erases the data — ⬜

Destructive: it deletes the account it is run on. Covered end to end by
`npm run test:functions`, which asserts against real Auth, Firestore and Storage
that the profile, contacts, alert logs, counters, fingerprints, pending reports,
photographs and Auth record are all gone, that approved reports survive
anonymised, and that another account is untouched.

To run it manually, register a throwaway account, file a report, add a contact,
then Settings → Your data → type DELETE → confirm. Expect a return to the sign-in
screen and no data remaining under that uid.

---

## Environment notes worth keeping

- **`adb shell input text` splits on spaces.** Use `%s`, or the field silently
  receives only the first word — which looks like a truncation bug in the app.
- **Validation errors move the layout**, so coordinates captured from an earlier
  screenshot land on the wrong control. Re-capture after any state change.
- **A dev build falls back to a stale cached bundle when Metro is unreachable**,
  and does so quietly — the app kept running and showed _Phase 10_ screens
  ("persistence arrives in Phase 11") while claiming to be current. Anything
  observed after a "Cannot connect to Expo CLI" toast must be discarded.
  `adb reverse tcp:8081 tcp:8081` reconnects it.
- **The iOS simulator's location resets to San Francisco** and ignores a
  `simctl location set` issued before the app has resolved a first fix. Seed
  where the simulator actually is, or set the location and then force a refetch
  from the app's own locate control.
- **Map tiles and overlays do not render without
  `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID`** — Android only; iOS uses Apple Maps
  and needs no key. Previously recorded as an Expo Go
  limitation; it applies to development builds too, and it hides the markers and
  radius circles as well as the tiles. The data layer is unaffected — the header
  still reported "5 black spots nearby" — so this is a display-only limitation,
  but it makes the map screen impossible to assess visually without a key.

---

## iOS-specific observations

Recorded from the first successful iOS run of this project.

- **The back button on a pushed screen reads "(tabs)".** Expo Router is using the
  route-group directory name as the back title, so navigating Settings → Your
  data shows a control labelled `(tabs)` where iOS convention expects the
  previous screen's title. Cosmetic, iOS-only — Android renders a plain arrow and
  is unaffected — but it exposes an internal directory name in the interface.
- **The `Info.plist` usage string is correct and specific.** The system prompt
  read "Accident Black Spot Detection uses your location to warn you when you
  approach a known accident-prone or crime-prone area", which is the string that
  has to justify the permission to a reviewer as well as a user.
- **Only foreground access is requested.** The dialog offered "Allow Once" /
  "Allow While Using App" / "Don't Allow" — no background prompt, matching the
  Phase 8 design where background monitoring is a separate opt-in.
- **The dark theme's Phase 11 accents read well on device.** Risk markers use
  light fills with dark text, which is the pattern gotcha 24 settled on after the
  contrast failure, and it survives being overlaid on Apple Maps tiles.
- **Text entry is faithful.** Unlike `adb shell input text`, the simulator accepts
  spaces and full strings without truncation, so form fixtures do not need
  escaping.
