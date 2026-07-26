import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';

export interface ConfirmationDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. Use for deletes and SOS. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
}

/**
 * Modal confirmation for consequential actions.
 *
 * Built on RN's `Modal` rather than `Alert.alert` because Alert cannot be themed
 * and cannot be asserted on in tests. Two behaviours are deliberate:
 *
 *   - Cancel is the safe default. Tapping the scrim cancels, and
 *     `onRequestClose` (Android hardware back) cancels too. A stray tap must
 *     never confirm a destructive action.
 *   - Cancel is rendered *after* confirm in the tree but is visually secondary,
 *     so the reading order still reaches it — important given this component
 *     will guard account deletion and SOS.
 */
export function ConfirmationDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
  testID,
}: ConfirmationDialogProps) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
      statusBarTranslucent
    >
      <Pressable
        style={[styles.scrim, { backgroundColor: theme.colors.scrim }]}
        onPress={onCancel}
        accessibilityLabel="Dismiss dialog"
        accessibilityRole="button"
      >
        {/* Stops scrim taps from passing through the dialog body. */}
        <Pressable
          testID={testID}
          accessibilityRole="alert"
          onPress={() => undefined}
          style={[
            styles.dialog,
            theme.elevation(3),
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              gap: theme.spacing.md,
              padding: theme.spacing.xl,
            },
          ]}
        >
          <AppText variant="titleMedium">{title}</AppText>
          <AppText variant="bodySmall" color="textMuted">
            {message}
          </AppText>

          <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            <AppButton
              label={confirmLabel}
              onPress={onConfirm}
              variant={destructive ? 'danger' : 'primary'}
              fullWidth
            />
            <AppButton label={cancelLabel} onPress={onCancel} variant="ghost" fullWidth />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    maxWidth: 420,
    width: '100%',
  },
});
