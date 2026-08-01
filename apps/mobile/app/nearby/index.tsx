import { useCallback, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  EmptyState,
  ErrorState,
  LoadingIndicator,
  ScreenContainer,
} from '@/components';
import { LocationPermissionGate } from '@/features/location/LocationPermissionGate';
import { useLocation } from '@/features/location/useLocation';
import { NearbyPlaceRow } from '@/features/nearby-places/NearbyPlaceRow';
import {
  buildDirectionsUrl,
  buildUniversalDirectionsUrl,
  type DirectionsPlatform,
} from '@/features/nearby-places/directions';
import {
  NEARBY_PLACES_DIRECTIONS_NOTE,
  NEARBY_PLACES_DISCLAIMER,
  NEARBY_PLACES_DISTANCE_NOTE,
  NEARBY_PLACES_EMPTY_BODY,
  NEARBY_PLACES_EMPTY_TITLE,
  NEARBY_PLACES_OFFLINE_NOTE,
  NEARBY_PLACES_PROVIDER_FAILED,
  NEARBY_PLACE_LABELS,
  NEARBY_PLACE_SOURCE_LABELS,
} from '@/features/nearby-places/nearbyPlaceCopy';
import {
  NEARBY_PLACE_CATEGORIES,
  type NearbyPlaceCategory,
  type RankedNearbyPlace,
} from '@/features/nearby-places/nearbyPlaceTypes';
import { useNearbyPlaces } from '@/features/nearby-places/useNearbyPlaces';
import { useTheme } from '@/theme';
import { logger } from '@/utils/logger';

/**
 * Nearby help — hospitals and police stations around the user.
 *
 * ## What this screen is careful not to be
 *
 * It is not an emergency service, and it says so in the first sentence rather
 * than in a footnote. It cannot call anyone, cannot confirm a facility is open,
 * and is drawing on public map data whose coverage varies enormously by region.
 * Every one of those limits is stated on screen, because the alternative is a
 * driver at the roadside trusting a list that is quietly wrong.
 *
 * Distances are straight-line. A hospital 2 km away across a river may be a
 * 15 km drive, and presenting the crow-flies figure as though it were travel
 * distance would be the kind of small dishonesty this project avoids.
 */

function directionsPlatform(): DirectionsPlatform {
  if (Platform.OS === 'ios') {
    return 'ios';
  }
  return Platform.OS === 'android' ? 'android' : 'other';
}

export default function NearbyPlacesScreen() {
  const theme = useTheme();

  // `balanced` rather than `high`: the search radius is 15 km, so a fix good to
  // 100 m changes nothing about the results, and this screen may be opened on a
  // phone whose battery already matters.
  const {
    permission,
    location,
    error: locationError,
    initialising,
    requestAccess,
    refresh,
    openSettings,
  } = useLocation('balanced');

  const [selected, setSelected] = useState<NearbyPlaceCategory[]>([...NEARBY_PLACE_CATEGORIES]);

  const { places, loading, error, isFromCache, isStale, providerId, failures, refetch } =
    useNearbyPlaces(location, selected);

  const toggleCategory = useCallback((category: NearbyPlaceCategory) => {
    setSelected((current) => {
      const next = current.includes(category)
        ? current.filter((entry) => entry !== category)
        : [...current, category];
      // Never allow an empty selection: it would produce an empty list that
      // looks identical to "nothing found nearby", which is a different and
      // much more alarming message.
      return next.length === 0 ? current : next;
    });
  }, []);

  const openDirections = useCallback(async (place: RankedNearbyPlace) => {
    const destination = { latitude: place.latitude, longitude: place.longitude };
    const native = buildDirectionsUrl(directionsPlatform(), {
      destination,
      label: place.name,
    });

    try {
      await Linking.openURL(native);
    } catch (caught) {
      // A device with no maps app, or an Android ROM without a geo: handler.
      // The universal https link opens a browser at worst, so the user is never
      // left with a button that did nothing.
      logger.warn('NearbyPlacesScreen', 'Native directions link failed; using the web fallback', {
        error: caught instanceof Error ? caught.message : 'unknown',
      });
      try {
        await Linking.openURL(buildUniversalDirectionsUrl(destination));
      } catch (fallbackError) {
        logger.error('NearbyPlacesScreen', 'Could not open directions at all', fallbackError);
      }
    }
  }, []);

  const callPlace = useCallback(async (place: RankedNearbyPlace, telUrl: string) => {
    try {
      await Linking.openURL(telUrl);
    } catch (caught) {
      // Common on a tablet or a simulator with no dialler. Logged, not surfaced
      // as a failure — the number is still on the row for the user to dial by
      // hand. The place id, never the number, goes to the log.
      logger.warn('NearbyPlacesScreen', 'Could not open the dialler', {
        placeId: place.id,
        error: caught instanceof Error ? caught.message : 'unknown',
      });
    }
  }, []);

  const usable = permission === 'granted' && locationError === null && !initialising;

  if (!usable) {
    return (
      <ScreenContainer scrollable testID="nearby-screen">
        <View style={{ gap: theme.spacing.lg }}>
          <AppText variant="bodySmall" color="textMuted">
            {NEARBY_PLACES_DISCLAIMER}
          </AppText>

          <LocationPermissionGate
            permission={permission}
            error={locationError}
            initialising={initialising}
            onRequestAccess={() => void requestAccess()}
            onOpenSettings={() => void openSettings()}
            onRetry={() => void refresh('balanced')}
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable testID="nearby-screen">
      <View style={{ gap: theme.spacing.lg }}>
        {/* First, before the list. Someone skimming must not miss it. */}
        <AppText variant="bodySmall" color="textMuted">
          {NEARBY_PLACES_DISCLAIMER}
        </AppText>

        <View style={[styles.filters, { gap: theme.spacing.sm }]}>
          {NEARBY_PLACE_CATEGORIES.map((category) => {
            const active = selected.includes(category);
            return (
              <AppButton
                key={category}
                label={NEARBY_PLACE_LABELS[category]}
                variant={active ? 'primary' : 'secondary'}
                onPress={() => toggleCategory(category)}
                style={styles.filter}
                // State is announced rather than left to the fill colour alone.
                accessibilityLabel={`${NEARBY_PLACE_LABELS[category]}, ${active ? 'showing' : 'hidden'}`}
                accessibilityHint={active ? 'Hides these results' : 'Shows these results'}
              />
            );
          })}
        </View>

        {/*
          A caution rather than an error: there are usable results on screen, a
          fallback provider supplied them, and the only thing the user needs to
          know is that the list may be shorter than it should be. Carried by the
          words, not by a colour.
        */}
        {failures.length > 0 && places.length > 0 ? (
          <AppText variant="caption" color="textMuted">
            Some sources could not be reached. Results may be incomplete.
          </AppText>
        ) : null}

        {isFromCache ? (
          <AppText variant="caption" color={isStale ? 'danger' : 'textSubtle'}>
            {NEARBY_PLACES_OFFLINE_NOTE}
          </AppText>
        ) : null}

        {loading ? <LoadingIndicator message="Looking for facilities near you…" /> : null}

        {/*
          An error is only fatal when there is nothing to show. With cached
          results on screen the failure is reported as a caption above, because
          replacing a usable list with an error box would be a downgrade.
        */}
        {error !== null && places.length === 0 && !loading ? (
          <ErrorState error={error} title="Could not look up nearby facilities" onRetry={refetch} />
        ) : null}

        {error !== null && places.length > 0 ? (
          <AppText variant="caption" color="textSubtle">
            {NEARBY_PLACES_PROVIDER_FAILED}
          </AppText>
        ) : null}

        {!loading && error === null && places.length === 0 ? (
          <EmptyState title={NEARBY_PLACES_EMPTY_TITLE} description={NEARBY_PLACES_EMPTY_BODY} />
        ) : null}

        {places.length > 0 ? (
          <View style={{ gap: theme.spacing.md }}>
            {places.map((place) => (
              <NearbyPlaceRow
                key={place.id}
                place={place}
                onDirections={(target) => void openDirections(target)}
                onCall={(target, telUrl) => void callPlace(target, telUrl)}
              />
            ))}
          </View>
        ) : null}

        <View style={{ gap: theme.spacing.xxs }}>
          <AppText variant="caption" color="textSubtle">
            {NEARBY_PLACES_DISTANCE_NOTE}
          </AppText>
          <AppText variant="caption" color="textSubtle">
            {NEARBY_PLACES_DIRECTIONS_NOTE}
          </AppText>
          {/*
            Attribution. Required by the ODbL for OpenStreetMap data, so this is
            a licence obligation rather than a nicety — and it also tells the
            user how old the information they are acting on might be.
          */}
          {places.length > 0 ? (
            <AppText variant="caption" color="textSubtle">
              Data from{' '}
              {NEARBY_PLACE_SOURCE_LABELS[isFromCache ? 'cache' : (providerId ?? 'openstreetmap')]}.
            </AppText>
          ) : null}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row' },
  filter: { flex: 1 },
});
