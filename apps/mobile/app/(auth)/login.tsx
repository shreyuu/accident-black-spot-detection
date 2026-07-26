import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { AppButton, AppText, DisclaimerNotice, ScreenContainer } from '@/components';
import { useTheme } from '@/theme';

/**
 * Sign-in screen — placeholder.
 *
 * Phase 2 adds the real form: React Hook Form + Zod validation, Firebase
 * email/password sign-in, and field-level error messages for invalid email,
 * wrong password, unknown account and network failure.
 */
export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <ScreenContainer scrollable testID="login-screen">
      <View style={{ gap: theme.spacing.lg }}>
        <AppText variant="titleLarge">Welcome back</AppText>
        <AppText variant="bodySmall" color="textMuted">
          Sign in to see black spot warnings near you, submit reports and manage emergency contacts.
        </AppText>

        <AppText variant="caption" color="textSubtle">
          Sign-in is implemented in Phase 2.
        </AppText>

        <View style={{ gap: theme.spacing.sm }}>
          <AppButton
            label="Create an account"
            onPress={() => router.push('/(auth)/register')}
            variant="secondary"
            fullWidth
          />
          <AppButton
            label="Forgot your password?"
            onPress={() => router.push('/(auth)/forgot-password')}
            variant="ghost"
            fullWidth
          />
        </View>

        <DisclaimerNotice />
      </View>
    </ScreenContainer>
  );
}
