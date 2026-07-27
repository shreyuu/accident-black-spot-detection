import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import {
  AppText,
  EmptyState,
  ErrorState,
  LoadingIndicator,
  RiskBadge,
  ScreenContainer,
} from '@/components';
import { COVERAGE_DISCLAIMER, LOCATION_ACCURACY_DISCLAIMER } from '@/constants/disclaimer';
import { effectiveRadiusM } from '@/features/alerts/proximityEngine';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchBlackSpotById } from '@/features/black-spots/blackSpotRepository';
import {
  CATEGORY_GUIDANCE,
  CATEGORY_LABELS,
  SOURCE_LABELS,
} from '@/features/black-spots/blackSpotCopy';
import { useLocation } from '@/features/location/useLocation';
import { useTheme } from '@/theme';
import { formatDistance, haversineDistanceM } from '@/utils/geo';
import { toAppError } from '@/utils/errors';

/**
 * Black spot detail.
 *
 * Looked up through the repository, which only ever returns verified and active
 * records — so a deactivated or unverified spot reached by a stale link resolves
 * to "not available" rather than being displayed as an official hazard.
 */
export default function BlackSpotDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { location } = useLocation('balanced');
  const { profile } = useAuth();

  const userAlertRadiusM = profile?.alertRadiusM ?? 1000;

  const query = useQuery({
    queryKey: ['blackSpot', id],
    enabled: location !== null && typeof id === 'string',
    queryFn: async () => {
      if (location === null || typeof id !== 'string') {
        return null;
      }
      return fetchBlackSpotById(id, location);
    },
  });

  if (location === null || query.isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Black spot' }} />
        <ScreenContainer testID="black-spot-detail-loading">
          <LoadingIndicator
            fullscreen
            message={location === null ? 'Finding your location…' : 'Loading this location…'}
          />
        </ScreenContainer>
      </>
    );
  }

  if (query.error !== null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Black spot' }} />
        <ScreenContainer testID="black-spot-detail-error">
          <ErrorState
            error={toAppError(query.error)}
            title="Could not load this location"
            onRetry={() => void query.refetch()}
          />
        </ScreenContainer>
      </>
    );
  }

  const spot = query.data ?? null;

  if (spot === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Black spot' }} />
        <ScreenContainer testID="black-spot-detail-missing">
          <EmptyState
            title="This location is not available"
            description="It may have been removed or deactivated, or it may be too far away to load."
            action={{ label: 'Back to the map', onPress: () => router.replace('/(tabs)/map') }}
          />
        </ScreenContainer>
      </>
    );
  }

  const distanceM = haversineDistanceM(location, {
    latitude: spot.latitude,
    longitude: spot.longitude,
  });
  const radiusM = effectiveRadiusM(spot, userAlertRadiusM);
  const isInsideRadius = distanceM <= radiusM;
  const evidenceCount = spot.accidentCount + spot.crimeCount;

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
            {spot.description !== undefined ? (
              <AppText variant="body" color="textMuted">
                {spot.description}
              </AppText>
            ) : null}
            <AppText variant="body">{CATEGORY_GUIDANCE[spot.category]}</AppText>
          </View>

          {/* ---------------------------------------------------------------- */}
          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="titleSmall">Details</AppText>

            <DetailRow label="Category" value={CATEGORY_LABELS[spot.category]} />
            <DetailRow label="Warning radius" value={`${radiusM} m`} />
            <DetailRow label="Distance from you" value={`About ${formatDistance(distanceM)}`} />
            {evidenceCount > 0 ? (
              <DetailRow
                label="Recorded incidents"
                value={`${evidenceCount} (${spot.accidentCount} accident, ${spot.crimeCount} crime)`}
              />
            ) : null}

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
              Where this comes from
            </AppText>
            <AppText variant="caption" color="textMuted">
              {SOURCE_LABELS[spot.source]}
              {spot.reportCount > 0
                ? ` · ${spot.reportCount} approved ${spot.reportCount === 1 ? 'report' : 'reports'}`
                : ''}
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
      <AppText variant="bodySmall" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  );
}
