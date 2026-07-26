import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';

export interface PermissionCardProps {
  title: string;
  /** Why the permission is needed, in plain language. */
  reason: string;
  /** What is done with the data, and what is *not* stored. */
  dataUsage: string;
  /** How the user turns the feature off again. */
  optOut: string;
  primaryAction: { label: string; onPress: () => void };
  /** Secondary path, e.g. "Not now" or "Open Settings". */
  secondaryAction?: { label: string; onPress: () => void };
  testID?: string;
}

/**
 * Pre-permission explanation card.
 *
 * Shown *before* the OS permission dialog. This is a deliberate pattern, for two
 * reasons. Practically, the OS prompt can only be shown once — a user who denies
 * it without understanding why is very hard to recover, especially on iOS.
 * Ethically, an app that reads location continuously owes the user a plain
 * explanation of what it collects and what it does not keep before it asks.
 *
 * All four content props are required so that no caller can quietly ship a
 * permission request with the justification left out.
 */
export function PermissionCard({
  title,
  reason,
  dataUsage,
  optOut,
  primaryAction,
  secondaryAction,
  testID,
}: PermissionCardProps) {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      style={[
        styles.card,
        theme.elevation(1),
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
        },
      ]}
    >
      <AppText variant="titleMedium">{title}</AppText>

      <View style={{ gap: theme.spacing.sm }}>
        <AppText variant="bodySmall" color="textMuted">
          {reason}
        </AppText>
        <AppText variant="bodySmall" color="textMuted">
          {dataUsage}
        </AppText>
        <AppText variant="caption" color="textSubtle">
          {optOut}
        </AppText>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <AppButton label={primaryAction.label} onPress={primaryAction.onPress} fullWidth />
        {secondaryAction !== undefined ? (
          <AppButton
            label={secondaryAction.label}
            onPress={secondaryAction.onPress}
            variant="ghost"
            fullWidth
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
});
