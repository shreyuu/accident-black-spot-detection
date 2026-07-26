import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppProviders } from '@/providers/AppProviders';
import { useTheme } from '@/theme';

// Keep the native splash visible until the first screen is ready to paint, so
// the user never sees a flash of unstyled background.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

/**
 * Navigator, split out from RootLayout so it can read the theme.
 *
 * `useTheme` requires ThemeProvider, which RootLayout itself mounts — a hook
 * cannot consume a provider rendered by the same component.
 */
function RootNavigator() {
  const theme = useTheme();

  useEffect(() => {
    // Phase 1 has nothing async to wait on. From Phase 2 this hides only once
    // the auth session has been restored, so protected routes are resolved
    // before the first frame and no unauthenticated flash occurs.
    void SplashScreen.hideAsync();
  }, []);

  return (
    <>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
          headerTitleStyle: theme.typography.titleSmall,
          contentStyle: { backgroundColor: theme.colors.background },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
      </Stack>
    </>
  );
}
