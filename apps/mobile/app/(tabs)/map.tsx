import { View } from 'react-native';

import { AppText, EmptyState, RiskBadge, ScreenContainer } from '@/components';
import { COVERAGE_DISCLAIMER } from '@/constants/disclaimer';
import { useTheme } from '@/theme';
import { RISK_LEVELS } from '@/types/domain';

/**
 * Map screen — placeholder.
 *
 * Phase 3 adds `react-native-maps` with the location permission flow, the user's
 * position, a re-centre control and sample black spot markers with warning-radius
 * circles. Phase 4 replaces the samples with approved Firestore records and wires
 * up proximity alerts.
 *
 * The risk ramp is rendered here so the design system's colour and label pairing
 * can be reviewed in both themes before any map is involved.
 */
export default function MapScreen() {
  const theme = useTheme();

  return (
    <ScreenContainer scrollable testID="map-screen">
      <View style={{ gap: theme.spacing.lg }}>
        <AppText variant="titleLarge">Map</AppText>

        <EmptyState
          title="The map arrives in Phase 3"
          description="Location permissions, your current position and black spot markers are added next."
        />

        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="titleSmall">Risk levels</AppText>
          <AppText variant="caption" color="textSubtle">
            Each level always shows a written label, never colour alone.
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {RISK_LEVELS.map((level) => (
              <RiskBadge key={level} level={level} />
            ))}
          </View>
        </View>

        <AppText variant="caption" color="textSubtle">
          {COVERAGE_DISCLAIMER}
        </AppText>
      </View>
    </ScreenContainer>
  );
}
