import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { SAFETY_DISCLAIMER } from '@/constants/disclaimer';
import { useTheme } from '@/theme';

export interface DisclaimerNoticeProps {
  /** Defaults to the standard safety disclaimer. */
  text?: string;
  testID?: string;
}

/**
 * Inline safety disclaimer.
 *
 * Kept as a component so the wording is identical everywhere it appears
 * (onboarding, Settings, SOS) and cannot drift into a stronger claim than the
 * app can support.
 */
export function DisclaimerNotice({ text = SAFETY_DISCLAIMER, testID }: DisclaimerNoticeProps) {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
        },
      ]}
    >
      <AppText variant="caption" color="textMuted">
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
});
