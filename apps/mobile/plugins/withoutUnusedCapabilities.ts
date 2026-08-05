import { withAndroidManifest, withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

/**
 * Remove capabilities the generated native projects declare but this app never
 * exercises.
 *
 * ## Why this exists
 *
 * Two separate mechanisms add capabilities nobody in this codebase asked for:
 *
 *   - `expo-task-manager`'s config plugin appends `fetch` to iOS
 *     `UIBackgroundModes` unconditionally. It has no option to opt out and runs
 *     whether or not a background-fetch task is registered. This app registers
 *     exactly one task, a background *location* task (see
 *     `src/features/background-monitoring/`), and `location` is contributed
 *     separately by `expo-location`. Nothing here calls
 *     `BackgroundFetch.registerTaskAsync`.
 *   - Expo's Android prebuild template writes `SYSTEM_ALERT_WINDOW` — "Display
 *     over other apps" — into the main manifest. It is there for React Native's
 *     development error overlay, and the template *also* declares it in
 *     `android/app/src/debug/AndroidManifest.xml`, where it belongs. The copy in
 *     the main manifest changes nothing for a debug build and affects only
 *     release builds, which are exactly the ones that must not ask for it.
 *
 * Both are submission risks rather than tidiness. App Review asks what each
 * background mode is for, Play treats `SYSTEM_ALERT_WINDOW` as a sensitive
 * permission, and in both cases the honest answer — "a template added it" — is
 * the one that gets a binary rejected. They are also claims about the app that
 * are not true, which is the standard the rest of this project holds its
 * user-facing copy to.
 *
 * ## Why a plugin rather than `ios.infoPlist` / `android.permissions`
 *
 * Both of those are applied *before* the package plugins and the prebuild
 * template run, and the additions above happen afterwards. `UIBackgroundModes`
 * in particular is appended to rather than replaced, so anything written in
 * app.config.ts is added to and never subtracted from. Only a mod that runs
 * after them can remove an entry.
 *
 * ## Ordering: this plugin must be listed FIRST
 *
 * Which reads backwards, and is the single thing most likely to be "corrected"
 * by somebody tidying app.config.ts. **Expo runs mods in reverse registration
 * order.** `withMod` wraps whatever mod was registered before it and each action
 * runs *then* chains down to that earlier one, so the last plugin listed is the
 * first to run and the first plugin listed is the last — immediately before the
 * base mod writes the file. Autolinked plugins are registered after everything
 * in the `plugins` array, so they run before all of it; `expo-task-manager`,
 * which contributes `fetch`, is autolinked.
 *
 * Listed last, this plugin ran before `expo-location` had added `location`, saw
 * only the `fetch` that autolinked `expo-task-manager` had just contributed, and
 * threw. That is how the ordering was established, and it is why the assertions
 * below are worth their weight: the wrong order produced a loud failure at
 * prebuild instead of a silently under-permissioned binary.
 *
 * `AndroidConfig.Permissions.removePermissions` was the obvious alternative for
 * the Android half and is not used: it matches on the short permission name,
 * which makes it easy to strip a similarly-named permission a library legitimately
 * needs. The filter below matches the full name and nothing else.
 *
 * ## Failure modes this guards against
 *
 * Removing a capability the app genuinely uses is worse than leaving a spare
 * one. A background task that never fires reports no error to JavaScript, and a
 * permission missing from the manifest is not a build error — the runtime
 * request simply returns "denied", and every proximity feature stops working
 * with no message a user or a developer would connect to the cause. So the
 * required entries are asserted rather than assumed, and a mismatch throws
 * during prebuild, where somebody is watching.
 *
 * If a future SDK stops adding these, the plugin quietly does nothing, which is
 * correct.
 */

/** iOS background modes this app must never ship. */
const UNUSED_BACKGROUND_MODES = ['fetch'] as const;

/**
 * iOS background modes this app genuinely uses. Kept explicit so removing one by
 * accident is an error rather than a silent regression in a shipped binary.
 */
const REQUIRED_BACKGROUND_MODES = ['location'] as const;

/** Android permissions to strip. Full names, matched exactly. */
const UNUSED_ANDROID_PERMISSIONS = ['android.permission.SYSTEM_ALERT_WINDOW'] as const;

/**
 * Android permissions the app depends on. Every one is either requested from the
 * user at runtime or required for the foreground service to start at all.
 */
const REQUIRED_ANDROID_PERMISSIONS = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.INTERNET',
] as const;

const withoutUnusedBackgroundModes: ConfigPlugin = (config) =>
  withInfoPlist(config, (modConfig) => {
    const current = modConfig.modResults.UIBackgroundModes;

    if (!Array.isArray(current)) {
      // Nothing declared at all — possible if expo-location is removed. Not an
      // error here, because this plugin only ever subtracts.
      return modConfig;
    }

    const kept = current.filter(
      (mode) => !(UNUSED_BACKGROUND_MODES as readonly string[]).includes(String(mode)),
    );

    const missing = REQUIRED_BACKGROUND_MODES.filter((mode) => !kept.includes(mode));
    if (missing.length > 0) {
      throw new Error(
        `withoutUnusedCapabilities: expected UIBackgroundModes to contain ${missing.join(', ')} ` +
          `but found [${current.join(', ')}]. Background monitoring cannot work without it, and a ` +
          'build that silently lacks it looks identical until a user relies on it.',
      );
    }

    modConfig.modResults.UIBackgroundModes = kept;
    return modConfig;
  });

const withoutUnusedAndroidPermissions: ConfigPlugin = (config) =>
  withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const declared = manifest['uses-permission'] ?? [];

    const kept = declared.filter((entry) => {
      const name = entry.$['android:name'];
      return !(UNUSED_ANDROID_PERMISSIONS as readonly string[]).includes(name);
    });

    const keptNames = new Set(kept.map((entry) => entry.$['android:name']));
    const missing = REQUIRED_ANDROID_PERMISSIONS.filter((name) => !keptNames.has(name));
    if (missing.length > 0) {
      throw new Error(
        `withoutUnusedCapabilities: expected the Android manifest to declare ${missing.join(', ')} ` +
          `but found [${[...keptNames].join(', ')}].`,
      );
    }

    manifest['uses-permission'] = kept;
    return modConfig;
  });

export const withoutUnusedCapabilities: ConfigPlugin = (config) =>
  withoutUnusedAndroidPermissions(withoutUnusedBackgroundModes(config));

export default withoutUnusedCapabilities;
