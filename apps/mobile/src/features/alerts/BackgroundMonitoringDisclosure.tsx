import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton, AppText } from '@/components';
import {
  BACKGROUND_MONITORING_ANDROID_NOTE,
  BACKGROUND_MONITORING_DISCLOSURE,
  BACKGROUND_MONITORING_IOS_NOTE,
} from '@/constants/disclaimer';
import { useTheme } from '@/theme';

export interface BackgroundMonitoringDisclosureProps {
  visible: boolean;
  onAccept: () => void;
  onCancel: () => void;
  testID?: string;
}

/**
 * The disclosure shown before background monitoring can be switched on.
 *
 * This is not a courtesy. Background location is the most invasive thing the app
 * does and the most expensive thing it does to the battery, and both platforms
 * require the user to be told before permission is requested. It is also where
 * the project's honesty rule is at its sharpest: the OS may delay or drop these
 * checks entirely, and saying so *before* someone relies on them is the whole
 * point.
 *
 * Deliberate choices:
 *
 *   - It is presented before the toggle takes effect, not after, and not as a
 *     link the user could skip.
 *   - The scrim and Android back button **cancel**. Dismissing by accident must
 *     never be read as consent to background tracking.
 *   - The content scrolls rather than truncating, so nothing material is hidden
 *     below the fold on a small screen.
 *   - The confirm button says what it does. "OK" on a consent dialog is not
 *     informed agreement.
 */
export function BackgroundMonitoringDisclosure({
  visible,
  onAccept,
  onCancel,
  testID,
}: BackgroundMonitoringDisclosureProps) {
  const theme = useTheme();

  const platformNote =
    Platform.OS === 'ios'
      ? BACKGROUND_MONITORING_IOS_NOTE
      : Platform.OS === 'android'
        ? BACKGROUND_MONITORING_ANDROID_NOTE
        : null;

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
        accessibilityLabel="Dismiss without turning on background warnings"
        accessibilityRole="button"
      >
        {/* Stops scrim taps from passing through the dialog body. */}
        <Pressable
          testID={testID}
          onPress={() => undefined}
          style={[
            styles.dialog,
            theme.elevation(3),
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.xl,
              gap: theme.spacing.md,
            },
          ]}
        >
          <AppText variant="titleMedium">Before you turn on background warnings</AppText>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ gap: theme.spacing.md }}
            showsVerticalScrollIndicator
          >
            {BACKGROUND_MONITORING_DISCLOSURE.map((point) => (
              <View key={point} style={[styles.point, { gap: theme.spacing.sm }]}>
                {/* Decorative: the reader gets the sentence, not a bullet character. */}
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.bullet,
                    { backgroundColor: theme.colors.primary, marginTop: theme.spacing.sm },
                  ]}
                />
                <AppText variant="bodySmall" color="textMuted" style={styles.pointText}>
                  {point}
                </AppText>
              </View>
            ))}

            {platformNote !== null ? (
              <AppText variant="caption" color="textSubtle">
                {platformNote}
              </AppText>
            ) : null}
          </ScrollView>

          <View style={{ gap: theme.spacing.sm }}>
            <AppButton
              label="Turn on background warnings"
              onPress={onAccept}
              fullWidth
              accessibilityHint="Requests background location access and starts checking while the app is closed"
              testID="background-monitoring-accept"
            />
            <AppButton label="Not now" onPress={onCancel} variant="ghost" fullWidth />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  dialog: { maxHeight: '85%', maxWidth: 460, width: '100%' },
  // Bounded so the buttons stay reachable on a small screen; the list scrolls.
  body: { flexGrow: 0 },
  point: { flexDirection: 'row' },
  bullet: { borderRadius: 3, height: 6, width: 6 },
  pointText: { flex: 1 },
});
