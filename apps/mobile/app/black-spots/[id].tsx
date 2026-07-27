import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { AppText, EmptyState, RiskBadge, ScreenContainer } from '@/components';
import { COVERAGE_DISCLAIMER, LOCATION_ACCURACY_DISCLAIMER } from '@/constants/disclaimer';
import {
  buildSampleBlackSpots,
  CATEGORY_GUIDANCE,
  CATEGORY_LABELS,
} from '@/features/black-spots/sampleBlackSpots';
import { useLocation } from '@/features/location/useLocation';
import { useTheme } from '@/theme';
import { formatDistance, haversineDistanceM } from '@/utils/geo';

/**
 * Black spot detail.
 *
 * Phase 3 resolves the id against the generated samples. Phase 4 replaces this
 * with a Firestore lookup by document id, at which point the route also has to
 * handle loading and not-found states from the network rather than just a
 * missing id.
 */
export default function BlackSpotDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { location } = useLocation('balanced');

  // Samples are positioned relative to the user, so the same anchor rounding as
  // the map is applied here — otherwise the two screens would disagree about
  // where a spot is by a few metres.
  const spot = useMemo(() => {
    if (location === null) {
      return null;
    }
    const anchor = {
      latitude: Math.round(location.latitude * 1000) / 1000,
      longitude: Math.round(location.longitude * 1000) / 1000,
    };
    return buildSampleBlackSpots(anchor).find((candidate) => candidate.id === id) ?? null;
  }, [id, location]);

  const distanceM = useMemo(() => {
    if (spot === null || location === null) {
      return null;
    }
    return haversineDistanceM(location, { latitude: spot.latitude, longitude: spot.longitude });
  }, [location, spot]);

  if (spot === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Black spot' }} />
        <ScreenContainer testID="black-spot-detail-missing">
          <EmptyState
            title="This location is not available"
            description={
              location === null
                ? 'Your location is needed to show this place. Allow location access on the Map tab and try again.'
                : 'It may have been removed, or the link may be out of date.'
            }
            action={{ label: 'Back to the map', onPress: () => router.replace('/(tabs)/map') }}
          />
        </ScreenContainer>
      </>
    );
  }

  const isInsideRadius = distanceM !== null && distanceM <= spot.radiusM;

  return (
    <>
      <Stack.Screen options={{ title: spot.name }} />
      <ScreenContainer scrollable testID="black-spot-detail">
        <View style={{ gap: theme.spacing.xl }}>
          <View style={{ gap: theme.spacing.sm }}>
            <AppText variant="titleLarge">{spot.name}</AppText>
            <RiskBadge level={spot.riskLevel} />
          </View>

          {/* ---------------------------------------------------------------- */}
          <View style={{ gap: theme.spacing.sm }}>
            <AppText variant="titleSmall">What to expect</AppText>
            <AppText variant="body" color="textMuted">
              {spot.description}
            </AppText>
            <AppText variant="body">{CATEGORY_GUIDANCE[spot.category]}</AppText>
          </View>

          {/* ---------------------------------------------------------------- */}
          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="titleSmall">Details</AppText>

            <DetailRow label="Category" value={CATEGORY_LABELS[spot.category]} />
            <DetailRow label="Warning radius" value={`${spot.radiusM} m`} />
            <DetailRow
              label="Distance from you"
              value={distanceM === null ? 'Unavailable' : `About ${formatDistance(distanceM)}`}
            />
            {isInsideRadius ? (
              <AppText variant="bodySmall" color="danger">
                You are currently inside this warning zone.
              </AppText>
            ) : null}
          </View>

          {/* ---------------------------------------------------------------- */}
          <View
            style={{
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: theme.radius.md,
              gap: theme.spacing.xs,
              padding: theme.spacing.md,
            }}
          >
            <AppText variant="label" color="textMuted">
              Sample data
            </AppText>
            <AppText variant="caption" color="textMuted">
              This is a development placeholder, not a real reported location. Verified black spots
              from the database arrive in Phase 4.
            </AppText>
          </View>

          {/* ---------------------------------------------------------------- */}
          <View style={{ gap: theme.spacing.sm }}>
            <AppText variant="caption" color="textSubtle">
              {LOCATION_ACCURACY_DISCLAIMER}
            </AppText>
            <AppText variant="caption" color="textSubtle">
              {COVERAGE_DISCLAIMER}
            </AppText>
          </View>
        </View>
      </ScreenContainer>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', gap: theme.spacing.md, justifyContent: 'space-between' }}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
    >
      <AppText variant="bodySmall" color="textMuted">
        {label}
      </AppText>
      <AppText variant="bodySmall">{value}</AppText>
    </View>
  );
}
