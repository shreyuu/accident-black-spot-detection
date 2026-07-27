import { StyleSheet, View } from 'react-native';
import { Circle, Marker } from 'react-native-maps';

import { AppText } from '@/components/AppText';
import type { SampleBlackSpot } from '@/features/black-spots/sampleBlackSpots';
import { useTheme } from '@/theme';
import { RISK_LEVEL_LABELS, type RiskLevel } from '@/types/domain';

export interface BlackSpotMarkerProps {
  spot: SampleBlackSpot;
  onPress: (spot: SampleBlackSpot) => void;
}

/** Fill and stroke opacity per risk level, so severity reads at a glance. */
const CIRCLE_OPACITY: Record<RiskLevel, { fill: string; strokeWidth: number }> = {
  low: { fill: '22', strokeWidth: 1.5 },
  medium: { fill: '2E', strokeWidth: 2 },
  high: { fill: '3A', strokeWidth: 2.5 },
  critical: { fill: '47', strokeWidth: 3 },
};

/**
 * A black spot rendered as a warning-radius circle plus a tappable marker.
 *
 * The marker uses a custom child view rather than a default pin so that the risk
 * level appears as **text** on the map itself. A coloured pin alone would make
 * severity a colour-only signal, which fails for colour-blind users and in
 * bright sunlight — both very likely for a road-safety app used outdoors.
 *
 * The circle shows the real warning radius in map units, so it grows and shrinks
 * correctly with zoom and honestly represents the area covered.
 */
export function BlackSpotMarker({ spot, onPress }: BlackSpotMarkerProps) {
  const theme = useTheme();

  const colorFor: Record<RiskLevel, string> = {
    low: theme.colors.riskLow,
    medium: theme.colors.riskMedium,
    high: theme.colors.riskHigh,
    critical: theme.colors.riskCritical,
  };

  const color = colorFor[spot.riskLevel];
  const { fill, strokeWidth } = CIRCLE_OPACITY[spot.riskLevel];
  const shortLabel = RISK_LEVEL_LABELS[spot.riskLevel].replace(' risk', '').toUpperCase();

  return (
    <>
      <Circle
        center={{ latitude: spot.latitude, longitude: spot.longitude }}
        radius={spot.radiusM}
        strokeColor={color}
        // Alpha is appended as hex so the underlying map stays readable through
        // the fill; overlapping zones must remain individually distinguishable.
        fillColor={`${color}${fill}`}
        strokeWidth={strokeWidth}
        zIndex={1}
      />

      <Marker
        coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
        onPress={() => onPress(spot)}
        // Announced instead of the visual pin, so a screen reader user gets the
        // name, severity and radius rather than "marker".
        accessibilityLabel={`${spot.name}. ${RISK_LEVEL_LABELS[spot.riskLevel]}. Warning radius ${spot.radiusM} metres.`}
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
