import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { RiskBadge } from '@/components/RiskBadge';
import type { ProximityAlert } from '@/features/alerts/proximityEngine';
import { useTheme } from '@/theme';
import type { RiskLevel } from '@/types/domain';

export interface ProximityAlertBannerProps {
  alert: ProximityAlert;
  onDismiss: () => void;
  onOpenDetail: (blackSpotId: string) => void;
}

/**
 * The in-app proximity warning.
 *
 * Deliberately a top banner rather than a modal. The project's safety rules say
 * a warning must never block the whole screen — someone driving needs to see the
 * road and the map, and a full-screen dialog demanding dismissal is exactly the
 * wrong thing to put in front of them.
 *
 * It is also why dismissal is a large, obvious control and why the whole banner
 * is not itself the dismiss target: an accidental swipe should not silence a
 * warning the user has not read.
 */
export function ProximityAlertBanner({
  alert,
  onDismiss,
  onOpenDetail,
}: ProximityAlertBannerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const accentFor: Record<RiskLevel, string> = {
    low: theme.colors.riskLow,
    medium: theme.colors.riskMedium,
    high: theme.colors.riskHigh,
    critical: theme.colors.riskCritical,
  };

  return (
    <View
      testID="proximity-alert-banner"
      accessibilityRole="alert"
      // Announced immediately: a warning the user cannot see must still reach a
      // screen reader without waiting for focus to move.
      accessibilityLiveRegion="assertive"
      style={[
        styles.banner,
        theme.elevation(3),
        {
          backgroundColor: theme.colors.surface,
          borderLeftColor: accentFor[alert.blackSpot.riskLevel],
          borderRadius: theme.radius.lg,
          gap: theme.spacing.sm,
          marginHorizontal: theme.spacing.lg,
          marginTop: insets.top + theme.spacing.sm,
          padding: theme.spacing.lg,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.headerText, { gap: theme.spacing.xs }]}>
          <AppText variant="titleSmall">{alert.blackSpot.name}</AppText>
          <RiskBadge level={alert.blackSpot.riskLevel} compact />
        </View>

        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss this warning"
          hitSlop={12}
          style={{ minHeight: theme.minTouchTarget, justifyContent: 'center', paddingLeft: 12 }}
        >
          <AppText variant="titleSmall" color="textMuted">
            ✕
          </AppText>
        </Pressable>
      </View>

      <AppText variant="bodySmall">{alert.message}</AppText>

      <Pressable
        onPress={() => onOpenDetail(alert.blackSpot.id)}
        accessibilityRole="button"
        accessibilityLabel={`See details for ${alert.blackSpot.name}`}
        hitSlop={8}
        style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}
      >
        <AppText variant="label" color="primary">
          See details
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderLeftWidth: 5,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerText: { flex: 1 },
});
