import { View } from 'react-native';

import { AppText, DisclaimerNotice, ScreenContainer } from '@/components';
import { useTheme } from '@/theme';

/**
 * Registration screen — placeholder.
 *
 * Phase 2 collects full name, email, optional phone, password, password
 * confirmation and an explicit terms/privacy acknowledgement, then creates the
 * Firestore user document. Passwords are never stored or handled by app code —
 * Firebase Authentication owns them.
 */
export default function RegisterScreen() {
  const theme = useTheme();

  return (
    <ScreenContainer scrollable testID="register-screen">
      <View style={{ gap: theme.spacing.lg }}>
        <AppText variant="titleLarge">Create your account</AppText>
        <AppText variant="bodySmall" color="textMuted">
          You need an account to submit reports and store emergency contacts.
        </AppText>

        <AppText variant="caption" color="textSubtle">
          Registration is implemented in Phase 2.
        </AppText>

        <DisclaimerNotice />
      </View>
    </ScreenContainer>
  );
}
