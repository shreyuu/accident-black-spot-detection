import { View } from 'react-native';

import { AppText, ScreenContainer } from '@/components';
import { useTheme } from '@/theme';

/**
 * Password reset screen — placeholder.
 *
 * Phase 2 sends a Firebase password-reset email. The confirmation message will
 * be deliberately neutral ("if an account exists for that address…") so the
 * screen cannot be used to discover which email addresses are registered.
 */
export default function ForgotPasswordScreen() {
  const theme = useTheme();

  return (
    <ScreenContainer scrollable testID="forgot-password-screen">
      <View style={{ gap: theme.spacing.lg }}>
        <AppText variant="titleLarge">Reset your password</AppText>
        <AppText variant="bodySmall" color="textMuted">
          We will email you a link to choose a new password.
        </AppText>

        <AppText variant="caption" color="textSubtle">
          Password reset is implemented in Phase 2.
        </AppText>
      </View>
    </ScreenContainer>
  );
}
