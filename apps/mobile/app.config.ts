import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Expo app configuration.
 *
 * This is a TypeScript config (not app.json) so that build-time values can be
 * derived from the environment. Anything read here runs on the *build machine*,
 * never on the device.
 *
 * Note the split in how environment variables are used:
 *   - `EXPO_PUBLIC_*` values consumed by app code are validated at runtime by
 *     src/config/env.ts.
 *   - Values needed to configure *native* projects (Google Maps API keys, for
 *     example) must be injected here, because native config is generated at
 *     build time and cannot read a runtime value.
 */

const APP_NAME = 'Accident Black Spot Detection';
const APP_SLUG = 'accident-black-spot-detection';
const APP_SCHEME = 'accidentblackspotdetection';
const BUNDLE_ID = 'com.shreyuu.accidentblackspotdetection';

type AppVariant = 'development' | 'preview' | 'production';

function resolveVariant(): AppVariant {
  const raw = process.env.EXPO_PUBLIC_APP_ENV;
  if (raw === 'preview' || raw === 'production') {
    return raw;
  }
  return 'development';
}

/**
 * Separate identifiers per variant so a development build, a preview build and
 * a store build can all be installed on the same device simultaneously.
 */
function identifierFor(variant: AppVariant): string {
  switch (variant) {
    case 'development':
      return `${BUNDLE_ID}.dev`;
    case 'preview':
      return `${BUNDLE_ID}.preview`;
    case 'production':
      return BUNDLE_ID;
  }
}

function displayNameFor(variant: AppVariant): string {
  switch (variant) {
    case 'development':
      return `${APP_NAME} (Dev)`;
    case 'preview':
      return `${APP_NAME} (Preview)`;
    case 'production':
      return APP_NAME;
  }
}

/** Trims a build-machine env var to `undefined` when unset or blank. */
function optionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveVariant();
  const identifier = identifierFor(variant);

  // Read here rather than in src/config/env.ts because native map configuration
  // is generated at build time and cannot consult a runtime value.
  const googleMapsKeyAndroid = optionalEnv(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID);
  const googleMapsKeyIos = optionalEnv(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS);

  return {
    ...config,
    name: displayNameFor(variant),
    slug: APP_SLUG,
    version: '0.1.0',
    orientation: 'portrait',
    scheme: APP_SCHEME,
    // "automatic" lets the OS light/dark setting drive the app theme. The
    // design system honours this; see src/theme/ThemeProvider.tsx.
    userInterfaceStyle: 'automatic',
    icon: './assets/images/icon.png',

    ios: {
      bundleIdentifier: identifier,
      supportsTablet: true,
      config: {
        // Only needed for provider={PROVIDER_GOOGLE}. iOS uses Apple Maps by
        // default, which needs no key — see the note on the plugins array below.
        ...(googleMapsKeyIos === undefined ? {} : { googleMapsApiKey: googleMapsKeyIos }),
      },
      infoPlist: {
        // The expo-location plugin writes this deprecated iOS 10-era key with its
        // generic default and offers no option to set it. It is inert at our
        // deployment target, but a placeholder purpose string should not ship in
        // a binary, so it is overridden here to match the other two.
        NSLocationAlwaysUsageDescription:
          'Accident Black Spot Detection can warn you about nearby accident-prone areas while the app is in the background. This is optional and off by default.',
        // UIBackgroundModes is NOT set here. The expo-location plugin appends
        // "location" to it, and expo-task-manager's own plugin appends "fetch"
        // unconditionally — both run after this object is applied, so anything
        // written here is added to rather than replaced.
        //
        // TODO(phase-14): "fetch" is declared but unused; this app has no
        // background fetch task. Verified in the generated Info.plist. App Store
        // review does query unused background modes, so before submission either
        // strip it with a small `withInfoPlist` mod or confirm expo-task-manager
        // has stopped adding it. Harmless until then — a declared capability the
        // app never exercises, not a permission over user data.
      },
    },

    android: {
      package: identifier,
      adaptiveIcon: {
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
        backgroundColor: '#0B1F3A',
      },
      // Note: there is no `edgeToEdgeEnabled` flag in SDK 57 — edge-to-edge is
      // unconditional on Android now, which is why every screen must go through
      // ScreenContainer for safe-area insets rather than assuming an inset-free
      // viewport.
      predictiveBackGestureEnabled: false,
      config: {
        // Android has no non-Google map provider, so a development or release
        // build needs its own key or the map renders as a blank grid. Expo Go
        // supplies its own key, which is why the map works there without this.
        ...(googleMapsKeyAndroid === undefined
          ? {}
          : { googleMaps: { apiKey: googleMapsKeyAndroid } }),
      },
      // Every location permission — ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION,
      // ACCESS_BACKGROUND_LOCATION, FOREGROUND_SERVICE and
      // FOREGROUND_SERVICE_LOCATION — is contributed by the expo-location plugin
      // below. Listing any of them here as well produced duplicate entries in the
      // merged manifest.
    },

    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },

    plugins: [
      'expo-router',
      // Required so the Keychain/Keystore entitlements are configured. The auth
      // session is persisted here rather than in AsyncStorage because it contains
      // a refresh token — see src/services/firebase/secureAuthStorage.ts.
      'expo-secure-store',
      [
        'expo-location',
        {
          // These strings are what the user actually reads in the OS permission
          // dialog, so they name the feature rather than saying "for a better
          // experience". The in-app PermissionCard shown beforehand carries the
          // fuller explanation, including what is not stored.
          locationWhenInUsePermission:
            'Accident Black Spot Detection uses your location to warn you when you approach a known accident-prone or crime-prone area.',
          // Read by the OS when the app asks to upgrade to "Always" — which only
          // happens after the user has switched background monitoring on and
          // read the in-app disclosure. The generic default the plugin would
          // otherwise write ("Allow $(PRODUCT_NAME) to access your location") is
          // both an App Store review rejection and, more importantly, not enough
          // for the user to make an informed choice.
          locationAlwaysAndWhenInUsePermission:
            'Accident Black Spot Detection can warn you about nearby accident-prone areas while the app is in the background. This is optional and off by default.',
          // Phase 8. These three flags are what make background monitoring
          // possible at all, and each one has a user-visible cost:
          //
          //   - iOS gains the `location` background mode, and with it the blue
          //     status-bar indicator whenever the task is running.
          //   - Android gains ACCESS_BACKGROUND_LOCATION, which Android 11+
          //     presents as a separate "Allow all the time" trip to Settings.
          //   - The foreground service is what stops Android killing the task
          //     within minutes; it is legally and practically required to show a
          //     persistent notification while it runs.
          //
          // None of this activates on its own: the permissions merely exist in
          // the binary. `backgroundMonitoringEnabled` defaults to false, the
          // disclosure in Settings is shown before anything is requested, and
          // nothing is started until the user opts in. See
          // docs/background-monitoring.md.
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
          // TODO(phase-14): supply `androidForegroundServiceIcon` alongside the
          // real icon set. Until then Android draws its own default glyph in the
          // persistent notification, which is legible but unbranded.
        },
      ],
      [
        'expo-image-picker',
        {
          // Shown in the OS dialogs when a reporter attaches a photograph. Both
          // name the feature rather than saying "to improve your experience" —
          // a vague purpose string is both a review rejection and a reason for
          // the user to refuse.
          photosPermission:
            'Accident Black Spot Detection needs access to your photos so you can attach one to an incident report. Photos are only uploaded with a report you submit.',
          cameraPermission:
            'Accident Black Spot Detection needs access to your camera so you can photograph an incident you are reporting. Photos are only uploaded with a report you submit.',
          // The app never saves to the library, so the write-only permission is
          // not requested at all.
          microphonePermission: false,
        },
      ],
      // Contributes the Android manifest bits the date/time dialogs need. The
      // package has no configurable options.
      '@react-native-community/datetimepicker',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#0B1F3A',
          image: './assets/images/splash-icon.png',
          imageWidth: 180,
          dark: {
            backgroundColor: '#060F1D',
            image: './assets/images/splash-icon.png',
            imageWidth: 180,
          },
        },
      ],
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },

    extra: {
      // Surfaced to app code through expo-constants. Useful for showing the
      // active variant in Settings and in bug reports.
      appVariant: variant,
    },
  };
};
