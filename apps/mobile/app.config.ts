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
      // ACCESS_COARSE_LOCATION and ACCESS_FINE_LOCATION are contributed by the
      // expo-location plugin below; listing them here as well produced duplicate
      // entries in the merged manifest. ACCESS_BACKGROUND_LOCATION and the
      // foreground-service permissions arrive in Phase 8, alongside the opt-in
      // toggle and battery disclosure that must accompany them.
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
          // The plugin writes the "Always" Info.plist keys regardless of the
          // background flags below, defaulting them to the generic
          // "Allow $(PRODUCT_NAME) to access your location". A vague purpose
          // string is exactly what App Store review rejects, so it is replaced
          // here even though Phase 3 never requests Always authorisation.
          locationAlwaysAndWhenInUsePermission:
            'Accident Black Spot Detection can warn you about nearby accident-prone areas while the app is in the background. This is optional and off by default.',
          // Background location is deliberately NOT enabled. Turning it on would
          // add the background mode to the build before there is any feature
          // behind it, and before the user has been told about the battery cost.
          // That arrives in Phase 8.
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
          isAndroidForegroundServiceEnabled: false,
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
