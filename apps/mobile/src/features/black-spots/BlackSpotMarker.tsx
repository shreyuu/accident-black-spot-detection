import { StyleSheet, View } from 'react-native';
import { Circle, Marker } from 'react-native-maps';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';
import type { BlackSpot, RiskLevel } from '@/types/domain';
import { RISK_LEVEL_LABELS } from '@/types/domain';

export interface BlackSpotMarkerProps {
  spot: BlackSpot;
  /**
   * Radius to draw, in metres.
   *
   * Passed in rather than read from `spot.radiusM` so the circle matches the
   * radius the alert engine actually uses — the engine narrows it to the user's
   * setting. A warning that fired outside the drawn circle would look like a bug
   * and undermine trust in the warnings that matter.
   */
  radiusM: number;
  /** Emphasises the circle when the user is currently inside it. */
  isInside: boolean;
  onPress: (spot: BlackSpot) => void;
}

/** Fill alpha and stroke weight per risk level, so severity reads at a glance. */
const CIRCLE_STYLE: Record<RiskLevel, { fill: string; strokeWidth: number }> = {
  low: { fill: '22', strokeWidth: 1.5 },
  medium: { fill: '2E', strokeWidth: 2 },
  high: { fill: '3A', strokeWidth: 2.5 },
  critical: { fill: '47', strokeWidth: 3 },
};

/**
 * A black spot rendered as a warning-radius circle plus a tappable marker.
 *
 * The marker uses a custom child view rather than a default pin so the risk level
 * appears as **text** on the map itself. A coloured pin alone would make severity
 * a colour-only signal, which fails for colour-blind users and in bright
 * sunlight — both very likely for a road-safety app used outdoors.
 */
export function BlackSpotMarker({ spot, radiusM, isInside, onPress }: BlackSpotMarkerProps) {
  const theme = useTheme();

  const colorFor: Record<RiskLevel, string> = {
    low: theme.colors.riskLow,
    medium: theme.colors.riskMedium,
    high: theme.colors.riskHigh,
    critical: theme.colors.riskCritical,
  };

  const color = colorFor[spot.riskLevel];
  const { fill, strokeWidth } = CIRCLE_STYLE[spot.riskLevel];
  const shortLabel = RISK_LEVEL_LABELS[spot.riskLevel].replace(' risk', '').toUpperCase();

  return (
    <>
      <Circle
        center={{ latitude: spot.latitude, longitude: spot.longitude }}
        radius={radiusM}
        strokeColor={color}
        // Alpha appended as hex so the map stays readable through the fill and
        // overlapping zones remain individually distinguishable.
        fillColor={`${color}${isInside ? '5A' : fill}`}
        strokeWidth={isInside ? strokeWidth + 1.5 : strokeWidth}
        zIndex={1}
      />

      <Marker
        coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
        onPress={() => onPress(spot)}
        // Announced instead of the visual pin, so a screen reader user gets the
        // name, severity and radius rather than "marker".
        accessibilityLabel={`${spot.name}. ${RISK_LEVEL_LABELS[spot.riskLevel]}. Warning radius ${radiusM} metres.${
          isInside ? ' You are inside this zone.' : ''
        }`}
        accessibilityRole="button"
        tracksViewChanges={false}
        anchor={{ x: 0.5, y: 0.5 }}
        zIndex={2}
        testID={`black-spot-marker-${spot.id}`}
      >
        <View
          style={[
            styles.pin,
            theme.elevation(2),
            { backgroundColor: color, borderRadius: theme.radius.pill },
          ]}
        >
          <AppText variant="caption" color="textOnPrimary">
            {shortLabel}
          </AppText>
        </View>
      </Marker>
    </>
  );
}

const styles = StyleSheet.create({
  pin: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
