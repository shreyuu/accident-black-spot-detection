# Background monitoring

Phase 8. How the opt-in background proximity warnings work, what the operating
systems actually guarantee (very little), and how to build and run the app now
that Expo Go is no longer sufficient.

---

## 1. What it does

When the user opts in, the app asks the OS to deliver location updates while it
is closed or backgrounded. Each batch of updates runs through the **same**
`evaluateProximity` the foreground uses, and a notification is raised if the user
has entered a warning zone.

```
OS location update
      ↓
backgroundLocationTask.ts        headless — no React, no navigation, no network assumed
      ↓
backgroundAlertSnapshot          the user's preferences, mirrored to disk
blackSpotCache                   black spots already downloaded
zoneStateStore                   which zones the user was already inside
      ↓
proximityEngine.evaluateProximity        ← unchanged, shared with the foreground
      ↓
partitionBackgroundAlerts        high/critical risk only
      ↓
alertDelivery.deliverAlert       notification + haptics
```

Nothing in this path re-implements the alerting rules. Hysteresis, cooldown,
overlap folding and risk prioritisation are the foreground's, unchanged — a
second copy would eventually disagree with the first, and a warning that fires in
one mode but not the other is worse than either behaviour on its own.

### Why the task reads from disk

The task runs **headless**: the OS starts the JS bundle with no UI mounted to
hand over a location update. There is no `AuthProvider`, no TanStack Query cache,
no guarantee that Firebase has restored the session, and no guarantee of a
network. Anything the task needs must already be on disk before it runs.

| What                     | Where it comes from       | Written by                            |
| ------------------------ | ------------------------- | ------------------------------------- |
| User preferences, uid    | `backgroundAlertSnapshot` | `AuthProvider`, on every profile load |
| Black spots              | `blackSpotCache`          | the map screen's query                |
| Which zones were entered | `zoneStateStore`          | both the foreground hook and the task |

The snapshot is the **authority** for the background path. Its absence means "not
opted in" — never "assume the defaults". A missing snapshot stops the task.

---

## 2. What the platforms actually guarantee

**Neither platform guarantees that a background location update will be
delivered, or delivered promptly.** The app must never be described as
continuously monitoring, and the in-app copy does not describe it that way.

### iOS

- Updates are **deferred and coalesced**. `deferredUpdatesDistance` /
  `deferredUpdatesInterval` explicitly ask the OS to batch fixes and hand several
  over at once, which is why `handleBackgroundLocations` reads the newest of a
  batch rather than the first.
- `pausesUpdatesAutomatically` is left on. iOS suspends updates when it decides
  the user has stopped moving and resumes on significant movement. A parked car
  needs no proximity checks; a user who walks back to it may not get an update
  until they are moving again.
- Low Power Mode reduces or stops background location entirely.
- The **blue status-bar indicator** is shown while the app is using location in
  the background. This is deliberately not suppressed: the user should be able to
  see it without opening the app.
- The "Always" authorisation prompt is shown **once**, and only after foreground
  access already exists. After that the user must go to Settings. iOS may also
  re-prompt the user later of its own accord ("… has been using your location in
  the background") and they can revoke it there.

### Android

- **Doze** and App Standby suspend background work when the device is stationary
  and the screen has been off. The foreground service mitigates this but does not
  make it impossible.
- **Manufacturer battery managers** — Xiaomi, Huawei, Oppo, OnePlus, Samsung and
  others — kill background services aggressively and to their own undocumented
  rules. On those devices monitoring may stop with no notice and no error, and
  there is nothing the app can do about it beyond what it already does.
- A **foreground service with an ongoing notification** is mandatory: Android
  stops delivering updates within minutes without one, and Android 14+ requires
  the notification for a `location`-typed service. `killServiceOnDestroy: true`
  means **dismissing that notification stops background warnings** — which is
  intentional. The user must be able to stop location tracking without opening
  the app.
- `ACCESS_BACKGROUND_LOCATION` ("Allow all the time") cannot be granted from a
  dialog on Android 11+. `requestBackgroundPermission` sends the user to the
  app's Settings page, so the app is backgrounded during the request and the
  result only arrives when they return — which is why `useBackgroundMonitoring`
  re-reads permissions on `AppState` becoming `active`.

### Restarts and reboots

A registered location task survives an app restart — the OS keeps the registration,
so monitoring continues without the app doing anything. It does **not** always
survive a device reboot; on Android there is no `BOOT_COMPLETED` receiver, so the
task is not re-registered automatically. `useBackgroundMonitoring` is mounted only
by the Settings screen, so in that case background warnings resume the next time
the user opens Settings. Moving the reconciliation to app launch is a
`TODO(phase-11)`, noted in the hook.

### Coverage

Background warnings only cover **black spots already cached on the device**. The
task does not query Firestore: a network request on the background path would
either block on something that may never resolve, or burn battery on a radio wake
for every update. If the user travels beyond the cached area, they are not warned
there, and the app says so rather than implying coverage it does not have.

---

## 3. Privacy

- The user's position is compared to black spots **on the device**. Coordinates
  are never uploaded by this feature.
- `alertLogs` records the black spot id, the rounded distance and the time —
  never a coordinate. That predates Phase 8 and is unchanged.
- `zoneStateStore` holds black spot ids and timestamps only, and the presence
  flag expires after 15 minutes (`PRESENCE_MAX_AGE_MS`); the whole record is
  discarded after 24 hours.
- `blackSpotCache` stores its centre rounded to ~1 km, as it did in Phase 4.
- Signing out stops the task and clears both the snapshot and the zone state.

There is still **no continuous location history** anywhere in the app.

---

## 4. Safety design notes

Two decisions are worth understanding before changing anything here.

**Presence expires; alert history does not need to.** A restored `inside: true`
_suppresses_ an entry alert, because the engine only alerts on a boundary
crossing. A stale one would silently swallow a real warning. A restored
`lastAlertedAt` can only suppress for the length of the engine's cooldown, after
which it stops mattering. So presence is aggressively expired and alert times are
not. See the header of `zoneStatePersistence.ts`.

**Zone state is saved before the alert is delivered.** If the process is killed
between the two, the user misses one warning they may receive again on the next
update. The other order risks delivering the same warning repeatedly, and
repeated warnings are how people learn to ignore warnings.

**Background notifications are high and critical risk only.**
`partitionBackgroundAlerts` uses `INTERRUPTING_RISK_LEVELS`. A background
notification buzzes a phone in a pocket, possibly while the user is driving,
which is a materially heavier interruption than a banner on a screen they are
already looking at. Withheld alerts still advance zone state, and the disclosure
and Settings copy both state which levels are covered — the user is told, not
quietly given less than they expected.

---

## 5. Development builds

Expo Go **cannot** run any of this. It has no way to register a custom task, and
since SDK 53 it does not provide `expo-notifications` on Android at all. From
Phase 8 the app needs a development build.

### Local builds (no Expo account needed)

```bash
npm run ios       # iOS simulator
npm run android   # Android emulator or attached device
```

Both now mean `expo run:*` rather than `expo start --ios`: they run
`expo prebuild` and then compile. The first build takes a long time (CocoaPods on
iOS, Gradle on Android); later ones are incremental.

`ios/` and `android/` are generated and **gitignored** — regenerate them, never
commit them. Re-run the build command after any change to `app.config.ts`, an
added native package, or a changed permission string; a JS-only change needs
only Metro.

Day to day, after the dev build is installed:

```bash
npm start               # Metro; the dev build connects to it
```

The dev client shows a launcher instead of Expo Go. Everything else — Fast
Refresh, the dev menu, Metro — works as before.

> **CocoaPods and the locale.** `pod install` fails with
> `Encoding::CompatibilityError: Unicode Normalization not appropriate for
ASCII-8BIT` when the shell locale is not UTF-8, which it is not in a bare
> non-interactive shell. `npm run ios` sets `LANG`/`LC_ALL` for this reason —
> if you invoke `npx expo run:ios` directly, set them yourself.

### EAS builds

`apps/mobile/eas.json` defines four profiles: `development` (simulator),
`development-device`, `preview` and `production`.

```bash
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile development --platform android
```

EAS builds run on Expo's servers and do **not** read the local `.env`. Every
`EXPO_PUBLIC_*` value the app needs must be set as an EAS environment variable or
secret — in particular `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID`, without which
Android map tiles render as a blank grid.

### What changed in the native config

`app.config.ts`, via the `expo-location` plugin:

| Flag                                 | Effect                                                      |
| ------------------------------------ | ----------------------------------------------------------- |
| `isIosBackgroundLocationEnabled`     | adds `location` to `UIBackgroundModes`                      |
| `isAndroidBackgroundLocationEnabled` | adds `ACCESS_BACKGROUND_LOCATION`                           |
| `isAndroidForegroundServiceEnabled`  | adds `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION` |

`expo-location`'s own library manifest contributes the `LocationTaskService`
declaration with `android:foregroundServiceType="location"`, which Android 14+
requires.

All of this is verified from the **built** Android debug APK, not just from the
prebuild output:

```bash
$ANDROID_HOME/build-tools/36.0.0/aapt2 dump permissions \
  apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

which lists `ACCESS_BACKGROUND_LOCATION`, `ACCESS_COARSE_LOCATION`,
`ACCESS_FINE_LOCATION`, `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION`.
On iOS, the generated `Info.plist` carries `location` in `UIBackgroundModes` and
all three location purpose strings.

None of this activates on its own. The permissions merely exist in the binary;
`backgroundMonitoringEnabled` defaults to `false` and nothing starts until the
user reads the disclosure and opts in.

---

## 6. Testing it

`npm run verify` covers the logic without a device:

| Suite                                | Covers                                                          |
| ------------------------------------ | --------------------------------------------------------------- |
| `zoneStatePersistence.test.ts`       | what survives a restart, and what must not                      |
| `backgroundMonitoringPolicy.test.ts` | when the task may run, and that no revocation leaves it running |
| `backgroundAlertSnapshot.test.ts`    | that a malformed snapshot is rejected rather than coerced       |
| `backgroundLocationTask.test.ts`     | end to end: a background fix producing a delivered notification |

On a device, with the dev build installed and the emulators seeded:

1. Settings → **Background warnings** → toggle on → read the disclosure → accept.
2. Grant "Always" / "Allow all the time" when asked.
3. Open the map once, so black spots are cached for the area.
4. Background the app (Home). On Android the ongoing notification appears; on
   iOS the blue indicator appears once an update is in flight.
5. Simulate movement into a **high or critical** risk seeded spot — Xcode's
   Debug ▸ Simulate Location, or `adb emu geo fix <lon> <lat>`.
6. A notification should arrive. Be patient: both platforms batch, and iOS may
   not deliver until the simulated position has moved a meaningful distance.
7. Toggle it off. The Android notification disappears; `hasStartedLocationUpdatesAsync`
   returns false and no further updates arrive.

Step 6 is genuinely flaky on both platforms, by design of the platforms. That is
the honest state of background location, not a defect in this code.
