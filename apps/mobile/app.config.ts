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

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveVariant();
  const identifier = identifierFor(variant);

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
    },

    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },

    plugins: [
      'expo-router',
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
