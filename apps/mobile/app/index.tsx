import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, DisclaimerNotice, LoadingIndicator } from '@/components';
import { useTheme } from '@/theme';

/**
 * Entry route — loading/splash screen.
 *
 * From Phase 2 this becomes the session-restoration gate: it waits for Firebase
 * to rehydrate the persisted session, then redirects to `(tabs)` for a signed-in
 * user or `(auth)/login` otherwise, which is what keeps protected tabs
 * unreachable while logged out.
 *
 * In Phase 1 there is no auth yet, so it presents both entry points instead of
 * redirecting automatically. That keeps every placeholder route reachable for
 * review without pretending auth exists.
 */
export default function IndexScreen() {
  const theme = useTheme();
  const router = useRouter();

  useEffect(() => {
    // TODO(phase-2): replace with a redirect driven by restored auth state:
    //   router.replace(session === null ? '/(auth)/login' : '/(tabs)/map');
  }, [router]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background,
          gap: theme.spacing.xl,
          padding: theme.spacing.xl,
        },
      ]}
    >
      <View style={{ gap: theme.spacing.sm }}>
        <AppText variant="displaySmall" center>
          Accident Black Spot Detection
        </AppText>
        <AppText variant="bodySmall" color="textMuted" center>
          Proximity warnings for accident-prone and crime-prone locations.
        </AppText>
      </View>

      <LoadingIndicator message="Preparing your session…" />

      <View style={{ gap: theme.spacing.sm, width: '100%' }}>
        <AppButton
          label="Sign in"
          onPress={() => router.push('/(auth)/login')}
          fullWidth
          accessibilityHint="Opens the sign in screen"
        />
        <AppButton
          label="Continue to app"
          onPress={() => router.push('/(tabs)/map')}
          variant="secondary"
          fullWidth
          accessibilityHint="Opens the map. Placeholder navigation until sign in is implemented."
        />
      </View>

      <DisclaimerNotice />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
