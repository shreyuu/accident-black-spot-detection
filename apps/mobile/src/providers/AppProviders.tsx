import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { ThemeProvider } from '@/theme';

/**
 * Single composition point for every app-wide provider.
 *
 * Nesting order is load-bearing:
 *   1. GestureHandlerRootView must be the outermost native view for gestures to
 *      work at all (bottom sheets in Phase 3, swipe actions later).
 *   2. SafeAreaProvider must wrap anything calling `useSafeAreaInsets`.
 *   3. ThemeProvider must wrap ErrorBoundary — the boundary's fallback UI calls
 *      `useTheme`, so an error thrown below it still renders a themed screen.
 *   4. ErrorBoundary wraps QueryProvider and the app, so render failures inside
 *      data-driven screens are caught rather than blanking the app.
 *   5. AuthProvider sits inside ErrorBoundary — it touches Firebase, so a
 *      configuration failure there must be caught and shown, not crash the app.
 *      It sits inside QueryProvider so authenticated queries can be added later
 *      without reordering providers.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ErrorBoundary scope="app-root">
            <QueryProvider>
              <AuthProvider>{children}</AuthProvider>
            </QueryProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
