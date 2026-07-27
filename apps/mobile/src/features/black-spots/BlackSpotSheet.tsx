import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, AppText, RiskBadge } from '@/components';
import {
  CATEGORY_GUIDANCE,
  CATEGORY_LABELS,
  type SampleBlackSpot,
} from '@/features/black-spots/sampleBlackSpots';
import { useTheme } from '@/theme';
import { formatDistance, haversineDistanceM, type Coordinates } from '@/utils/geo';

export interface BlackSpotSheetProps {
  spot: SampleBlackSpot;
  /** User position, for the distance readout. Null when unavailable. */
  userLocation: Coordinates | null;
  onClose: () => void;
  onOpenDetail: (spot: SampleBlackSpot) => void;
}

/**
 * Bottom sheet summarising a tapped black spot.
 *
 * Implemented as a plain absolutely-positioned view rather than a gesture-driven
 * sheet library. The content is short, fixed-height and needs no drag states, so
 * a dependency would add native surface area for no user-visible benefit.
 *
 * Kept deliberately brief: this app is used in or near traffic, and the
 * guideline the project set itself is that a warning must be readable at a
 * glance and must never occupy the whole screen.
 */
export function BlackSpotSheet({ spot, userLocation, onClose, onOpenDetail }: BlackSpotSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const distanceM =
    userLocation === null
      ? null
      : haversineDistanceM(userLocation, { latitude: spot.latitude, longitude: spot.longitude });

  return (
    <View
      testID="black-spot-sheet"
      accessibilityViewIsModal={false}
      style={[
        styles.sheet,
        theme.elevation(3),
        {
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: theme.radius.xl,
          borderTopRightRadius: theme.radius.xl,
          gap: theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.headerText, { gap: theme.spacing.xs }]}>
          <AppText variant="titleMedium">{spot.name}</AppText>
          <RiskBadge level={spot.riskLevel} />
        </View>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close details"
          hitSlop={12}
          style={{ padding: theme.spacing.xs }}
        >
          <AppText variant="titleSmall" color="textMuted">
            ✕
          </AppText>
        </Pressable>
      </View>

      <View style={{ gap: theme.spacing.xxs }}>
        <AppText variant="bodySmall" color="textMuted">
          {CATEGORY_LABELS[spot.category]} · warning radius {spot.radiusM} m
        </AppText>
        {distanceM === null ? (
          <AppText variant="bodySmall" color="textSubtle">
            Distance unavailable — your location is not known.
          </AppText>
        ) : (
          <AppText variant="bodySmall" color="textMuted">
            About {formatDistance(distanceM)} away
          </AppText>
        )}
      </View>

      <AppText variant="bodySmall">{CATEGORY_GUIDANCE[spot.category]}</AppText>

      <AppButton
        label="More details"
        onPress={() => onOpenDetail(spot)}
        variant="secondary"
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerText: { flex: 1 },
});
