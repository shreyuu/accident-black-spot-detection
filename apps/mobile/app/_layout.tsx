import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { AppProviders } from '@/providers/AppProviders';
import { useTheme } from '@/theme';

// Imported for its side effect: the module calls `TaskManager.defineTask` at
// evaluation time. It has to be reached from the root layout because the OS may
// start this bundle headlessly — with no screen mounted and no navigation — to
// hand over a background location update, and it looks the task up by name
// immediately. A definition that only ran once a screen imported it would not
// exist yet, and the update would be dropped.
import '@/features/alerts/backgroundLocationTask';

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
  const { status } = useAuth();

  useEffect(() => {
    // Held until the persisted session has been read, so the first frame the user
    // sees is already the correct destination. Hiding earlier would show the
    // login screen for a moment to someone who is actually signed in.
    if (status !== 'restoring') {
      void SplashScreen.hideAsync();
    }
  }, [status]);

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
        {/*
          Pushed over the tabs so the map stays in the back stack.
          `headerBackTitle` is set because iOS otherwise labels the back button
          with the previous route's name — which for a route group is the raw
          "(tabs)", leaking an implementation detail into the UI.
        */}
        <Stack.Screen
          name="black-spots/[id]"
          options={{ title: 'Black spot', headerBackTitle: 'Map' }}
        />
        <Stack.Screen
          name="reports/index"
          options={{ title: 'My reports', headerBackTitle: 'Report' }}
        />
        <Stack.Screen
          name="emergency-contacts/index"
          options={{ title: 'Emergency contacts', headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="nearby/index"
          options={{ title: 'Nearby help', headerBackTitle: 'Back' }}
        />
        <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
      </Stack>
    </>
  );
}
