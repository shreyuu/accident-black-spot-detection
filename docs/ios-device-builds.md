# iOS builds on a physical device

Getting `npx expo run:ios --device` onto a real iPhone with a **free Apple
Account**. Recorded from an actual run, in the order the failures appeared.

The headline: it works, and it costs nothing. But six independent Apple
requirements have to be satisfied first, and each one fails with an error that
names a symptom rather than a cause. None of them is about this project's code.

```bash
cd apps/mobile
npx expo run:ios --device
```

| Configuration used |                                                 |
| ------------------ | ----------------------------------------------- |
| Workspace          | `ios/AccidentBlackSpotDetectionDev.xcworkspace` |
| Scheme             | `AccidentBlackSpotDetectionDev`                 |
| Bundle identifier  | `com.shreyuu.accidentblackspotdetection.dev`    |
| Team               | Personal Team (free Apple Account)              |

---

## The chain, in the order it has to be untangled

| #   | What you see                                                                  | What is actually wrong                                        |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | `No code signing certificates are available to use`                           | No Apple Development certificate in the login Keychain        |
| 2   | `Failed to retrieve development teams`                                        | Xcode cannot fetch the Personal Team                          |
| 3   | `0 valid identities found`                                                    | The certificate exists but its WWDR trust chain is incomplete |
| 4   | `Timed out waiting for all destinations…` / `Developer Mode disabled`         | Developer Mode is off on the iPhone                           |
| 5   | `Personal development teams do not support the Push Notifications capability` | An APNs entitlement the app never uses                        |
| 6   | `…its profile has not been explicitly trusted by the user`                    | The developer profile is untrusted on the iPhone              |

Stage 5 is the one this repository can fix for you, and now does — see below.
The rest are machine and device state.

---

## 1. Add the Apple Account to Xcode

**Xcode → Settings → Apple Accounts →** `+`. After signing in you should see the
account with a **Personal Team** beside it.

A free Apple Account can install and test on your own devices through Xcode. It
manages App IDs, registered devices and provisioning profiles for you, and the
profiles **expire seven days after issue** — so a development build stops
launching after a week and has to be rebuilt. There is also a limit of three such
apps installed at once.

### If Xcode says "Failed to retrieve development teams"

1. Sign in to the Apple Developer website with the same account.
2. Complete the developer profile if prompted, and accept any updated agreement.
3. In Xcode, remove the account, **quit Xcode completely**, reopen it, and add
   the account again.
4. Wait for the Personal Team to appear.

Temporarily disable anything that intercepts TLS or DNS while doing this — VPN,
iCloud Private Relay, DNS filtering, an HTTP proxy, or a campus or workplace
network. Tethering to an iPhone hotspot is a quick way to find out whether the
network is the problem.

---

## 2. Create an Apple Development certificate

**Xcode → Settings → Apple Accounts → select the account → select the Personal
Team → Manage Certificates →** `+` **→ Apple Development**.

Verify from a terminal:

```bash
security find-identity -v -p codesigning
```

Expected:

```
1) <HASH> "Apple Development: <account> (<id>)"
   1 valid identities found
```

If it says `0 valid identities found`, go to the next section.

---

## 3. Fix an untrusted certificate

The symptom is a certificate that exists but does not count. Drop the `-v`:

```bash
security find-identity -p codesigning
```

```
Matching identities
  1 identities found
Valid identities only
  0 valid identities found
```

macOS can pair the certificate with its private key, but the chain fails trust
validation. Keychain Access shows **"Apple Development certificate is not
trusted"**.

**First check there is a private key at all.** Keychain Access → **login → My
Certificates**, expand the certificate with the disclosure arrow:

```
Apple Development: <account>
└── Private Key
```

No private key means the identity is incomplete — delete it and generate a new
one from Xcode. The rest of this section will not help.

**With a private key present, the missing piece is the intermediate.** These
certificates are issued through Apple's Worldwide Developer Relations G3
intermediate, which supported Xcode versions normally install automatically:

```bash
curl -L https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer \
  -o /tmp/AppleWWDRCAG3.cer
sudo security import /tmp/AppleWWDRCAG3.cer -k /Library/Keychains/System.keychain
killall trustd 2>/dev/null || true
```

Then confirm in Keychain Access under **System → Certificates** that the WWDR
authority is present and its trust setting is still **"Use System Defaults"**.

> **Do not set your own Apple Development certificate to "Always Trust".** It
> appears to fix the symptom and instead overrides the evaluation that was
> telling you something real. The intermediate is what was missing.

`security find-identity -v -p codesigning` must now report `1 valid identities
found`.

---

## 4. Enable Developer Mode on the iPhone

Symptom: `Timed out waiting for all destinations matching the provided
destination specifier to become available`. Xcode's device list also shows
**Developer Mode disabled** — which is the real message, and easy to miss next to
the timeout.

On the phone: **Settings → Privacy & Security → Developer Mode** → enable →
**restart** → unlock → confirm → enter the passcode.

Reconnect, unlock, and accept **Trust This Computer** if asked.

---

## 5. Automatic signing

```bash
cd apps/mobile && open ios/AccidentBlackSpotDetectionDev.xcworkspace
```

**Project navigator → the target → Signing & Capabilities**:

```
Automatically manage signing   ✔
Team                           <your name> (Personal Team)
Bundle Identifier              com.shreyuu.accidentblackspotdetection.dev
```

Check both the **Debug** and **Release** tabs; they are configured separately.

Confirm from a terminal rather than by eye:

```bash
xcodebuild -workspace ios/AccidentBlackSpotDetectionDev.xcworkspace \
  -scheme AccidentBlackSpotDetectionDev -configuration Debug -showBuildSettings |
  grep -E 'CODE_SIGN_STYLE|DEVELOPMENT_TEAM|PRODUCT_BUNDLE_IDENTIFIER|PROVISIONING_PROFILE_SPECIFIER'
```

```
CODE_SIGN_STYLE = Automatic
DEVELOPMENT_TEAM = <your team id>
PRODUCT_BUNDLE_IDENTIFIER = com.shreyuu.accidentblackspotdetection.dev
PROVISIONING_PROFILE_SPECIFIER =
```

An empty `PROVISIONING_PROFILE_SPECIFIER` is correct under automatic signing.

If signing fails on the identifier, it is registered to somebody else's account.
Change `BUNDLE_ID` in `apps/mobile/app.config.ts` to something under a domain you
control and re-run prebuild.

---

## 6. The Push Notifications capability — fixed in this repository

This is the only stage that was a project problem rather than machine state, and
it is now handled. Recorded because the fix is invisible unless you know to look.

The failure was:

```
Cannot create an iOS App Development provisioning profile for
"com.shreyuu.accidentblackspotdetection.dev".
Personal development teams do not support the Push Notifications capability.
```

**For an entitlement this app has never used.** `expo-notifications`' iOS config
plugin adds `aps-environment` unconditionally, and it does so through
**autolinking** — so it applied whether or not the plugin was listed in
`app.config.ts`, and had been present since Phase 4 when the package was added.
Meanwhile the app sends only _local_ notifications: `alertDelivery.ts` calls
`scheduleNotificationAsync`, and nothing anywhere requests a push token.

### What was done instead of editing Xcode

`apps/mobile/plugins/withoutUnusedCapabilities.ts` now strips `aps-environment`,
alongside the unused iOS `fetch` background mode and the Android
`SYSTEM_ALERT_WINDOW` permission it already removed. Verify:

```bash
cd apps/mobile && npx expo config --type introspect --json | grep -A3 entitlements
```

```
"entitlements": {}
```

**Removing the capability card in Xcode by hand also works, and does not
last.** `expo prebuild --clean` regenerates `ios/` from the config and puts the
entitlement back, so the manual fix has to be redone after every prebuild — and
a prebuild is exactly what you run when something else goes wrong. Fixing it in
the config is what makes it survive.

`src/features/alerts/__tests__/noRemotePush.test.ts` fails if
`getExpoPushTokenAsync`, `getDevicePushTokenAsync` or
`registerForPushNotificationsAsync` ever appears in `src/`. Without it, adding
remote push would produce an opaque runtime failure pointing nowhere near a
config plugin written months earlier.

### If you actually want remote push

It needs a **paid** Apple Developer Program team; a Personal Team cannot
provision it at any point. Re-add `aps-environment` by removing it from
`UNUSED_IOS_ENTITLEMENTS`, delete the guard test, and update the data-safety
table in [`store-preparation.md`](store-preparation.md), which currently declares
that this app sends none.

> `Compiling expo-notifications` in the build log is **not** a symptom. The
> package stays installed and keeps compiling; only the entitlement is gone.
> Local notifications are unaffected.

---

## 7. Build and install

```bash
cd apps/mobile && npx expo run:ios --device
```

Select the connected iPhone. Success looks like:

```
Build Succeeded
Installing ... AccidentBlackSpotDetectionDev.app
Complete 100%
```

Which confirms the identity was valid, a profile was generated, and the app was
compiled, signed and installed. It does **not** mean it will launch.

---

## 8. Trust the profile on the iPhone

First launch fails with:

```
Unable to launch because it has an invalid code signature, inadequate
entitlements or its profile has not been explicitly trusted by the user.
```

Three possible causes named at once, and here it is always the third.

On the phone: **Settings → General → VPN & Device Management → Developer App →**
your account **→ Trust**, or **Allow & Restart** on newer iOS. The device needs an
internet connection to verify the certificate.

Then open the app, or re-run `npx expo run:ios --device`.

---

## 9. Start Metro

The installed app is a development build and expects a dev server:

```bash
npx expo start --dev-client
```

Mac and iPhone on the same network. If local discovery does not work:

```bash
npx expo start --dev-client --tunnel
```

> If Metro is unreachable the build **does not fail loudly** — it serves a stale
> cached bundle and shows screens from whenever that bundle was built. See
> [`troubleshooting.md`](troubleshooting.md).

**Also point the app at the emulators**, or nothing that needs an account will
work: `npm run emulators` binds to `127.0.0.1`, which a phone cannot reach. Use
`npm run emulators:lan` and set `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` to the
printed address. That value is inlined at build time, so it needs a rebuild.
Full sequence in [`demo.md`](demo.md#5a-running-it-on-a-physical-iphone).

---

## Warnings that are not errors

**Metal toolchain search path not found.** Did not block the build, which
continued through linking, signing and installation. Only worth investigating if
Metal or GPU-related compilation later fails.

**`Script has ambiguous dependencies causing it to run on every build`** on the
`[Expo Dev Launcher] Strip Local Network Keys for Release` phase. A build-speed
warning, not a signing one. Silence it in **Build Phases** by unchecking _Based
on dependency analysis_ or declaring output files.

---

## Checklist

```bash
security find-identity -v -p codesigning     # 1 valid identities found
```

```bash
cd apps/mobile && npx expo config --type introspect --json | grep -A3 entitlements
```

Expect `{}` — no `aps-environment`.

On the Mac:

- Automatic signing on, correct team, unique bundle identifier
- Both Debug and Release tabs checked

On the iPhone:

- Developer Mode enabled
- This Mac trusted
- Developer profile trusted under VPN & Device Management
- Unlocked while installing

Then:

```bash
cd apps/mobile && npx expo run:ios --device
```

```bash
npx expo start --dev-client
```

---

## Root cause, in one paragraph

There was no single fault. Five independent Apple requirements were unmet in
sequence — no certificate, then an untrusted chain missing the WWDR G3
intermediate, then Developer Mode off, then an APNs entitlement a Personal Team
cannot provision, then an untrusted profile on the device — and each error named
its symptom rather than its cause. Only the fourth was this project's doing, and
it is now fixed in `app.config.ts` rather than in Xcode, so it survives
`prebuild --clean`.

Personal Team profiles expire after seven days, so expect to rebuild weekly.
