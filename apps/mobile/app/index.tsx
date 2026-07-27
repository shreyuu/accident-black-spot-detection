import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, DisclaimerNotice, LoadingIndicator } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme';

/**
 * Entry route — the session-restoration gate.
 *
 * Firebase reads the persisted session from SecureStore asynchronously, so on a
 * cold start there is a brief window where it is not yet known whether anyone is
 * signed in. This screen holds that window rather than guessing.
 *
 * Rendering a loading state during `restoring` is the important part: redirecting
 * to login on the assumption of "signed out" would flash the login screen at
 * every launch for a user who is in fact authenticated.
 */
export default function IndexScreen() {
  const theme = useTheme();
  const { status } = useAuth();

  if (status === 'authenticated') {
    return <Redirect href="/(tabs)/map" />;
  }

  if (status === 'unauthenticated') {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View
      testID="session-gate"
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

      <LoadingIndicator message="Restoring your session…" />

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
