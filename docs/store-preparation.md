# Store preparation

Phase 14. What App Store and Play Store submission would require, what this project
already satisfies, and what it does not.

**Nothing here has been submitted anywhere.** There is no Apple Developer account, no
Google Play developer account, no App Store Connect record and no Play Console listing.
This is a prerequisites document, not a status report.

The order below is deliberate: the sections that would get this app _rejected_ come
before the ones that are merely incomplete.

---

## 1. Blocking, and specific to this app

### 1.1 Background location is the hardest review this app faces

Both stores treat continuous background location as a category needing separate
justification, and both have rejected apps for asking without a clear user-visible
benefit. This app asks for it.

What is already in place, and it is most of what is asked for:

- **Off by default.** `backgroundMonitoringEnabled` defaults to false. Nothing is
  requested until the user turns it on.
- **An in-app disclosure before the OS prompt**, naming the battery cost and what is
  and is not stored. `BackgroundMonitoringDisclosure` — this is Google Play's
  "prominent disclosure" requirement almost verbatim, and it predates this phase.
- **Purpose strings that name the feature**, not "to improve your experience". Both
  `NSLocationWhenInUseUsageDescription` and
  `NSLocationAlwaysAndWhenInUseUsageDescription` are written in `app.config.ts` and the
  plugin's generic defaults are overridden.
- **A foreground service with a persistent notification** on Android, which is required
  and which the app does not attempt to hide.
- **No location history.** The app stores the current zone state, not a trail. This is
  the answer to the question both review teams actually ask.

What is missing:

- **Play's Location Permissions declaration form.** A written justification plus a video
  demonstrating the in-app disclosure and the feature working. Cannot be produced
  without a device build and a real user flow.
- **A privacy policy at a public URL.** Required by both stores, and required by Play
  before the declaration form can even be submitted. `docs/security-and-privacy.md` is
  the engineering document, not a privacy policy, and must not be filed as one.

### 1.2 The safety claims must survive the store listing

Everything the app is careful about in its own copy can be undone in one line of
marketing text. The store listing is subject to the same rules as the UI:

The app must never state or imply that it **prevents accidents or crime**, guarantees
**emergency response**, guarantees **SMS delivery**, provides **complete coverage**, or
is affiliated with any police force, ambulance service or road authority. It is not an
emergency service and must not be findable as one.

Concretely, for whoever writes the listing:

- Do not use the words "prevent", "protect", "guarantee", "emergency service",
  "official", or "verified by" in the title, subtitle, or first paragraph.
- Do not submit under a category that implies emergency dispatch.
- Screenshots must not be captioned in a way the UI itself would refuse to say.
- The SOS feature must be described as "sends a message you compose to contacts you
  choose", never as "alerts emergency services".

If a listing needs a disclaimer to be honest, the listing is wrong; write a listing
that is true without one.

### 1.3 Data safety and privacy nutrition labels

Both stores require an itemised declaration. What this app collects, from the code:

| Data                                | Collected                                | Linked to identity | Purpose                                 |
| ----------------------------------- | ---------------------------------------- | ------------------ | --------------------------------------- |
| Precise location                    | Yes, in use and optionally in background | No — not stored    | Proximity alerts, report placement, SOS |
| Email address                       | Yes                                      | Yes                | Account                                 |
| Display name                        | Yes                                      | Yes                | Account                                 |
| Photos                              | Optional, only when attached to a report | Yes                | Incident reports                        |
| Emergency contact names and numbers | Yes                                      | Yes                | SOS                                     |
| Approximate location in reports     | Yes                                      | Yes                | Incident reports                        |
| Crash logs / analytics              | **No**                                   | —                  | No reporter is configured — see §4.1    |

Two answers need care because the obvious answer is wrong:

- **Location: collected but not stored.** The proximity engine holds the current
  position in memory and persists zone state, not coordinates. A report and an SOS
  message each carry a position because the user chose to send one. Declaring "location
  history" would be inaccurate in the direction of over-claiming, which is the safer
  direction but is still inaccurate.
- **Emergency contacts are other people's personal data**, supplied by the user without
  those people's involvement. Both forms have a category for this and it is easy to
  miss.

Data deletion is implemented — `deleteAccount` as a Cloud Function, end-to-end tested —
which satisfies Play's account-deletion requirement, including the part that requires a
deletion route reachable without installing the app once there is a website.

---

## 2. Identifiers and artwork

### Bundle identifiers

`com.shreyuu.accidentblackspotdetection`, with `.dev` and `.preview` suffixes per
variant so three builds coexist on one device. `com.shreyuu.` is a placeholder domain
and should be changed to one actually controlled before anything is registered — the
identifier cannot be changed after first submission on either store.

### Artwork status

| Asset                           | Status                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------ |
| App icon (1024², no alpha)      | **Done.** Phase 14. Generated, alpha-stripped and asserted.                    |
| Android adaptive icon           | **Done.** Foreground, background and monochrome layers.                        |
| Splash                          | **Done.** Light and dark.                                                      |
| Notification icon               | **Done.** White-on-transparent silhouette, both notification types.            |
| iOS screenshots                 | **Missing.** 6.7" and 5.5" required, per orientation.                          |
| Android screenshots             | **Missing.** Phone required; tablet if declared, and `supportsTablet` is true. |
| Play feature graphic (1024×500) | **Missing.**                                                                   |
| App preview video               | Optional, and required in practice for the location declaration.               |

Screenshots have to come from real screens with real data. Do not stage them with
fabricated black spots that imply coverage the app does not have.

---

## 3. Accounts and credentials

None of this exists.

**Apple.** A Developer Program membership ($99/year), a Bundle ID registered in the
portal, an App Store Connect app record, and an App Store Connect API key for
`eas submit`. Distribution certificates and provisioning profiles can be managed by EAS.

**Google.** A Play Console account ($25 once), an app entry, an upload key, and a
service account JSON with Play Developer API access for `eas submit`. The `production`
profile builds an AAB because Play accepts nothing else for a new app.

**Neither credential may be committed.** `eas submit` prompts for both interactively;
`eas.json`'s `submit.production` is empty for this reason and should stay empty.

---

## 4. Known gaps that a reviewer or a user would notice

### 4.1 No crash reporting

Phase 14 added the seam — `setCrashReporter` in `src/utils/logger.ts`, tested — but
registers nothing. A shipped app with no crash reporting means the first users are the
error-reporting system.

Choosing one is not purely technical: it adds a data-processing relationship that the
privacy policy and both data-safety forms have to describe, and the table in §1.3 would
gain a row. That decision belongs to whoever ships this, which is why the phase built
the seam and stopped.

### 4.2 Android map tiles need a Google Maps key

Without `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID` the entire map surface renders blank
on Android — not just tiles, but markers and radius circles too. A build submitted
without it would ship a broken primary screen. iOS is unaffected; it uses Apple Maps
and needs no key. Restrict the key to the release package name and signing SHA-1.

### 4.3 Email addresses are not verified

Anyone can register with an address they do not control. Report rate limits are
therefore per account, not per person, and there is no App Check — so the limits
constrain a casual abuser and not a determined one.

### 4.4 The public Overpass endpoint

"Nearby help" defaults to `overpass-api.de`, a volunteer-run service with no obligation
to this app. It rate-limits under load, which the app treats as recoverable but which a
user experiences as "nearby help is unavailable" — on a screen they may have opened in
an emergency. Configurable since Phase 14 via `EXPO_PUBLIC_OVERPASS_ENDPOINT`; a real
deployment should point it somewhere it controls.

### 4.5 The iOS back button reads `(tabs)`

Expo Router uses the route-group directory name as the back title on pushed screens.
Cosmetic, iOS-only, visible in any screenshot taken of a detail screen.

### 4.6 Eight manual scenarios remain unexecuted

Listed in `docs/manual-test-plan.md`. Most need a physical device, a SIM or a camera.
Enforcement of the submission limits and of account deletion is covered end to end by
the automated suites; what is unverified is the wording a user reads, which is exactly
what a store reviewer sees.

### 4.7 Physical-device testing has never been done

Both simulator and emulator passes are complete. No build of this app has run on real
hardware. That is the largest single gap between this repository and a submittable app,
and no amount of automated testing closes it.
