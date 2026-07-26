import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';

export interface LoadingIndicatorProps {
  /** Describes what is loading. Announced to screen readers. */
  message?: string;
  /** Fills the available space and centres itself. */
  fullscreen?: boolean;
  testID?: string;
}

/**
 * Loading state.
 *
 * `accessibilityLiveRegion` / `accessibilityRole="progressbar"` matter here: a
 * spinner is invisible to a screen reader, so without them a blind user gets
 * silence and no indication that anything is happening.
 */
export function LoadingIndicator({
  message = 'Loading…',
  fullscreen = false,
  testID,
}: LoadingIndicatorProps) {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
      style={[styles.container, fullscreen && styles.fullscreen, { gap: theme.spacing.md }]}
    >
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <AppText variant="bodySmall" color="textMuted" center>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fullscreen: { flex: 1 },
});
