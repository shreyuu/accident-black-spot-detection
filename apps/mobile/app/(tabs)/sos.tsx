import { useState } from 'react';
import { View } from 'react-native';

import {
  AppButton,
  AppText,
  ConfirmationDialog,
  DisclaimerNotice,
  ScreenContainer,
} from '@/components';
import { SOS_DELIVERY_DISCLAIMER } from '@/constants/disclaimer';
import { useTheme } from '@/theme';

/**
 * SOS screen — placeholder.
 *
 * Phase 6 adds the real flow: emergency contact selection, a cancellable
 * countdown, a message containing the user's name, a help request, live
 * coordinates, a map link and a timestamp, handed to the SMS composer via
 * `expo-sms`, plus copy/share/call fallbacks.
 *
 * The confirmation dialog is wired up now because the *shape* of this
 * interaction is the safety-critical part: an SOS must never fire from a single
 * accidental tap. The dialog here demonstrates and preserves that constraint.
 */
export default function SosScreen() {
  const theme = useTheme();
  const [confirmVisible, setConfirmVisible] = useState(false);

  return (
    <ScreenContainer scrollable testID="sos-screen">
      <View style={{ gap: theme.spacing.lg }}>
        <AppText variant="titleLarge">Emergency SOS</AppText>
        <AppText variant="bodySmall" color="textMuted">
          Shares your current location with the emergency contacts you choose.
        </AppText>

        <AppButton
          label="Send SOS"
          variant="danger"
          size="large"
          fullWidth
          onPress={() => setConfirmVisible(true)}
          accessibilityHint="Asks you to confirm before anything is sent"
        />

        <AppText variant="caption" color="textSubtle">
          {SOS_DELIVERY_DISCLAIMER}
        </AppText>

        <AppText variant="caption" color="textSubtle">
          The full SOS flow, including emergency contacts and the cancellable countdown, arrives in
          Phase 6.
        </AppText>

        <DisclaimerNotice />
      </View>

      <ConfirmationDialog
        visible={confirmVisible}
        title="Send an SOS message?"
        message={
          'This is a placeholder — nothing will be sent yet. In Phase 6 this opens your messaging ' +
          'app with your location so you can review and send it.'
        }
        confirmLabel="Continue"
        destructive
        onConfirm={() => setConfirmVisible(false)}
        onCancel={() => setConfirmVisible(false)}
        testID="sos-confirm-dialog"
      />
    </ScreenContainer>
  );
}
