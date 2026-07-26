import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';
import { RISK_LEVEL_LABELS, type RiskLevel } from '@/types/domain';

export interface RiskBadgeProps {
  level: RiskLevel;
  /** Compact rendering for dense contexts such as map callouts. */
  compact?: boolean;
  testID?: string;
}

/**
 * Risk level indicator.
 *
 * The text label is not optional, and that is the point. Risk must never be
 * communicated by colour alone: roughly 1 in 12 men have some form of colour
 * vision deficiency, red/amber/orange is exactly the confusable range, and this
 * app is read outdoors in glare. The badge therefore always carries a written
 * level, and the accessibility label spells it out in full.
 */
export function RiskBadge({ level, compact = false, testID }: RiskBadgeProps) {
  const theme = useTheme();

  const backgroundFor: Record<RiskLevel, string> = {
    low: theme.colors.riskLow,
    medium: theme.colors.riskMedium,
    high: theme.colors.riskHigh,
    critical: theme.colors.riskCritical,
  };

  const label = RISK_LEVEL_LABELS[level];
  // Short form for the pill, full form for assistive tech.
  const shortLabel = compact ? label.replace(' risk', '') : label;

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.badge,
        {
          backgroundColor: backgroundFor[level],
          borderRadius: theme.radius.pill,
          paddingHorizontal: compact ? theme.spacing.sm : theme.spacing.md,
          paddingVertical: compact ? theme.spacing.xxs : theme.spacing.xs,
        },
      ]}
    >
      <AppText variant="caption" color="textOnPrimary">
        {shortLabel.toUpperCase()}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
  },
});
