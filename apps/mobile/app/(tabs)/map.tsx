import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, LoadingIndicator, ScreenContainer } from '@/components';
import { COVERAGE_DISCLAIMER } from '@/constants/disclaimer';
import { BlackSpotMarker } from '@/features/black-spots/BlackSpotMarker';
import { BlackSpotSheet } from '@/features/black-spots/BlackSpotSheet';
import {
  buildSampleBlackSpots,
  SAMPLE_BLACK_SPOT_COUNT,
} from '@/features/black-spots/sampleBlackSpots';
import { LocationPermissionGate } from '@/features/location/LocationPermissionGate';
import { useLocation } from '@/features/location/useLocation';
import { useTheme } from '@/theme';
import { regionDeltasForRadius } from '@/utils/geo';

/**
 * Map screen.
 *
 * Phase 3 renders the user's position and three **sample** black spots. Phase 4
 * replaces the samples with approved Firestore records and adds the proximity
 * alerting that actually warns the user.
 *
 * Accuracy is set to `high` here on purpose: this is the one screen where the
 * user is actively looking at their own position, so the battery cost is
 * justified. Background proximity checks use `balanced` instead.
 */

/**
 * Vertical space to leave for the open detail sheet, in points.
 *
 * A measured constant rather than a `onLayout` read: the sheet has fixed content
 * and measuring it would add a render pass and a frame of visible jumping for no
 * practical gain.
 */
const SHEET_CLEARANCE = 300;

export default function MapScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);

  const {
    permission,
    location,
    loading,
    error,
    initialising,
    requestAccess,
    refresh,
    openSettings,
  } = useLocation('high');

  /**
   * Only the id is held in state; the spot itself is derived below.
   *
   * Storing the object would mean keeping a second copy in sync with `spots`,
   * which is recomputed whenever the user moves far enough to re-anchor the
   * samples. Deriving it makes a stale selection resolve to `null` for free
   * instead of needing an effect to clean up after itself.
   */
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  /**
   * Samples are positioned relative to the user, so they are recomputed only
   * when the user moves a meaningful distance rather than on every GPS tick —
   * otherwise the markers would jitter continuously.
   */
  const anchor = useMemo(() => {
    if (location === null) {
      return null;
    }
    // ~3 decimal places is about 100 m, a sensible granularity for re-anchoring.
    return {
      latitude: Math.round(location.latitude * 1000) / 1000,
      longitude: Math.round(location.longitude * 1000) / 1000,
    };
  }, [location]);

  const spots = useMemo(() => (anchor === null ? [] : buildSampleBlackSpots(anchor)), [anchor]);

  const initialRegion = useMemo<Region | null>(() => {
    if (location === null) {
      return null;
    }
    // Framed to a 1500 m radius so all three samples are visible at first paint.
    const { latitudeDelta, longitudeDelta } = regionDeltasForRadius(location, 1500);
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta,
      longitudeDelta,
    };
  }, [location]);

  const recentre = useCallback(() => {
    void refresh('high');
    if (location !== null && mapRef.current !== null) {
      const { latitudeDelta, longitudeDelta } = regionDeltasForRadius(location, 1500);
      mapRef.current.animateToRegion(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta,
          longitudeDelta,
        },
        400,
      );
    }
  }, [location, refresh]);

  const selectedSpot = useMemo(
    () => spots.find((spot) => spot.id === selectedSpotId) ?? null,
    [selectedSpotId, spots],
  );

  // Permission or device problem — show the explanation instead of a blank map.
  const mapIsUsable = permission === 'granted' && error === null && !initialising;

  if (!mapIsUsable) {
    return (
      <ScreenContainer scrollable testID="map-screen">
        <View style={{ gap: theme.spacing.lg }}>
          <AppText variant="titleLarge">Map</AppText>

          <LocationPermissionGate
            permission={permission}
            error={error}
            initialising={initialising}
            onRequestAccess={() => void requestAccess()}
            onOpenSettings={() => void openSettings()}
            onRetry={() => void refresh('high')}
          />

          <AppText variant="caption" color="textSubtle">
            {COVERAGE_DISCLAIMER}
          </AppText>
        </View>
      </ScreenContainer>
    );
  }

  if (location === null || initialRegion === null) {
    return (
      <ScreenContainer testID="map-screen">
        <LoadingIndicator fullscreen message="Finding your location…" />
      </ScreenContainer>
    );
  }

  return (
    <View style={styles.container} testID="map-screen">
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        // iOS uses Apple Maps by default and needs no API key.
        //
        // Android has no non-Google provider, and tiles require a Google Maps
        // Platform key. Note that Expo Go does NOT reliably supply a working one:
        // verified on the Pixel_9 emulator, its bundled key fails with
        // "Google Maps Android API: Authorization failure … StatusCode=
        // INVALID_ARGUMENT", leaving a blank grid. Set
        // EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID (wired up in app.config.ts) to
        // render tiles on Android.
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        // Dismisses the sheet when the user taps empty map, which is the gesture
        // people reach for instinctively.
        //
        // The `action` guard is essential: a marker tap ALSO fires the map's
        // own onPress, so without it the marker would select a spot and this
        // handler would immediately deselect it — the sheet never appeared.
        onPress={(event) => {
          if (event.nativeEvent.action !== 'marker-press') {
            setSelectedSpotId(null);
          }
        }}
        accessibilityLabel={`Map showing your location and ${SAMPLE_BLACK_SPOT_COUNT} sample black spots nearby.`}
      >
        {spots.map((spot) => (
          <BlackSpotMarker
            key={spot.id}
            spot={spot}
            onPress={(tapped) => setSelectedSpotId(tapped.id)}
          />
        ))}
      </MapView>

      {/* Sample-data banner. Phase 4 removes this with the samples themselves. */}
      <View
        style={[
          styles.banner,
          theme.elevation(2),
          {
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
            marginTop: insets.top + theme.spacing.sm,
            marginHorizontal: theme.spacing.lg,
            padding: theme.spacing.md,
          },
        ]}
        accessibilityRole="summary"
      >
        <AppText variant="caption" color="textMuted">
          Showing {SAMPLE_BLACK_SPOT_COUNT} sample locations for development. Real black spots and
          proximity warnings arrive in Phase 4.
        </AppText>
      </View>

      <Pressable
        onPress={recentre}
        accessibilityRole="button"
        accessibilityLabel="Re-centre the map on your location"
        accessibilityState={{ busy: loading }}
        hitSlop={8}
        style={[
          styles.recentre,
          theme.elevation(2),
          {
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.pill,
            // Lifted clear of the sheet when one is open so the control is never
            // hidden behind it.
            bottom: insets.bottom + (selectedSpot === null ? theme.spacing.xxl : SHEET_CLEARANCE),
            height: theme.minTouchTarget,
            right: theme.spacing.lg,
            width: theme.minTouchTarget,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Ionicons
            name={Platform.OS === 'ios' ? 'locate' : 'locate-outline'}
            size={22}
            color={theme.colors.primary}
          />
        )}
      </Pressable>

      {selectedSpot !== null ? (
        <BlackSpotSheet
          spot={selectedSpot}
          userLocation={location}
          onClose={() => setSelectedSpotId(null)}
          onOpenDetail={(spot) => {
            setSelectedSpotId(null);
            router.push({ pathname: '/black-spots/[id]', params: { id: spot.id } });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: { position: 'absolute', left: 0, right: 0, top: 0 },
  recentre: { alignItems: 'center', justifyContent: 'center', position: 'absolute' },
});
