import { Modal, StyleSheet, View } from 'react-native';

import { AppButton, AppText } from '@/components';
import { SOS_COUNTDOWN_HINT } from '@/features/sos/sosCopy';
import { useTheme } from '@/theme';
import { useReducedMotion } from '@/utils/useReducedMotion';

export interface SosCountdownOverlayProps {
  visible: boolean;
  secondsRemaining: number;
  onCancel: () => void;
}

/**
 * The cancellable countdown, shown full-screen.
 *
 * Full-screen on purpose. The user has three seconds to notice that an SOS is
 * about to be composed, and a small banner is exactly the thing a person under
 * stress does not see. Everything else is covered so the only two things on
 * screen are the number and the way out.
 *
 * The Cancel control is deliberately large and sits under the thumb rather than
 * in a corner: cancelling has to be easier than confirming, because an
 * accidental SOS costs a contact a frightening message.
 *
 * `onRequestClose` maps to Cancel so Android's back gesture stops the countdown
 * instead of leaving it running behind a dismissed dialog.
 */
export function SosCountdownOverlay({
  visible,
  secondsRemaining,
  onCancel,
}: SosCountdownOverlayProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();

  return (
    <Modal
      visible={visible}
      transparent
      // The app has no sliding, scaling or parallax animation anywhere — this
      // fade is the only animation it has. It is still switched off when the
      // user has asked for reduced motion: they asked, and a modal appearing
      // instantly costs nothing.
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={onCancel}
      accessibilityViewIsModal
      statusBarTranslucent
    >
      <View style={[styles.backdrop, { backgroundColor: theme.colors.scrim }]}>
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={[
            styles.panel,
            theme.elevation(3),
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              gap: theme.spacing.lg,
              padding: theme.spacing.xl,
            },
          ]}
        >
          <AppText variant="titleMedium" center>
            Preparing your SOS message
          </AppText>

          {/*
            The number is announced as text as well as shown, so it is not a
            purely visual signal — the same rule risk levels follow.
          */}
          <AppText
            variant="displayLarge"
            color="danger"
            center
            accessibilityLabel={`${secondsRemaining} seconds remaining. ${SOS_COUNTDOWN_HINT}`}
            style={styles.count}
          >
            {secondsRemaining}
          </AppText>

          <AppText variant="bodySmall" color="textMuted" center>
            {SOS_COUNTDOWN_HINT}
          </AppText>

          <AppButton
            label="Cancel"
            size="large"
            variant="secondary"
            fullWidth
            onPress={onCancel}
            accessibilityHint="Stops the SOS. Nothing will be sent."
            testID="sos-cancel"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  panel: { maxWidth: 420, width: '100%' },
  count: { fontSize: 72, lineHeight: 80 },
});
