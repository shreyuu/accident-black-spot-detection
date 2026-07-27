import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, EmptyState, ErrorState, LoadingIndicator, ScreenContainer } from '@/components';
import { COVERAGE_DISCLAIMER } from '@/constants/disclaimer';
import { ProximityAlertBanner } from '@/features/alerts/ProximityAlertBanner';
import { effectiveRadiusM } from '@/features/alerts/proximityEngine';
import { useProximityAlerts } from '@/features/alerts/useProximityAlerts';
import { useAuth } from '@/features/auth/AuthProvider';
import { BlackSpotMarker } from '@/features/black-spots/BlackSpotMarker';
import { BlackSpotSheet } from '@/features/black-spots/BlackSpotSheet';
import { useNearbyBlackSpots } from '@/features/black-spots/useNearbyBlackSpots';
import { LocationPermissionGate } from '@/features/location/LocationPermissionGate';
import { useLocation } from '@/features/location/useLocation';
import { useTheme } from '@/theme';
import { regionDeltasForRadius } from '@/utils/geo';

/**
 * Map screen.
 *
 * Shows the user's position, verified black spots from Firestore, and the live
 * proximity warning. Background monitoring is Phase 8; this screen watches
 * position only while it is open.
 *
 * Location accuracy is `high` here because the user is actively looking at their
 * own position. The proximity watcher inside `useProximityAlerts` runs at
 * `balanced` instead — the same fix quality would cost battery for nothing
 * against radii of 100 m and up.
 */

/**
 * Vertical space to leave for the open detail sheet, in points.
 *
 * A measured constant rather than an `onLayout` read: the sheet has fixed
 * content, and measuring it would add a render pass and a frame of visible
 * jumping for no practical gain.
 */
const SHEET_CLEARANCE = 300;

export default function MapScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const { profile } = useAuth();

  const {
    permission,
    location,
    loading: locationLoading,
    error: locationError,
    initialising,
    requestAccess,
    refresh,
    openSettings,
  } = useLocation('high');

  const {
    spots,
    loading: spotsLoading,
    error: spotsError,
    isFromCache,
    isStale,
    refetch,
  } = useNearbyBlackSpots(location);

  const alertsEnabled = profile?.alertsEnabled ?? true;
  const userAlertRadiusM = profile?.alertRadiusM ?? 1000;

  const { activeAlert, dismissAlert, insideNow, watchedLocation } = useProximityAlerts({
    spots,
    initialLocation: location,
    enabled: permission === 'granted' && location !== null,
  });

  // The watched position is fresher than the one-shot fix once the stream is
  // running, so distances and the "inside" highlight track the user.
  const currentLocation = watchedLocation ?? location;

  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const selectedSpot = useMemo(
    () => spots.find((spot) => spot.id === selectedSpotId) ?? null,
    [selectedSpotId, spots],
  );

  const insideIds = useMemo(() => new Set(insideNow.map((entry) => entry.spot.id)), [insideNow]);

  const initialRegion = useMemo<Region | null>(() => {
    if (location === null) {
      return null;
    }
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
    const target = watchedLocation ?? location;
    if (target !== null && mapRef.current !== null) {
      const { latitudeDelta, longitudeDelta } = regionDeltasForRadius(target, 1500);
      mapRef.current.animateToRegion(
        { latitude: target.latitude, longitude: target.longitude, latitudeDelta, longitudeDelta },
        400,
      );
    }
  }, [location, refresh, watchedLocation]);

  // Permission or device problem — show the explanation instead of a blank map.
  const mapIsUsable = permission === 'granted' && locationError === null && !initialising;

  if (!mapIsUsable) {
    return (
      <ScreenContainer scrollable testID="map-screen">
        <View style={{ gap: theme.spacing.lg }}>
          <AppText variant="titleLarge">Map</AppText>

          <LocationPermissionGate
            permission={permission}
            error={locationError}
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
        // Platform key. Expo Go does NOT reliably supply a working one: verified
        // on the Pixel_9 emulator, its bundled key fails with "Google Maps
        // Android API: Authorization failure … StatusCode=INVALID_ARGUMENT",
        // leaving a blank grid. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID
        // (wired up in app.config.ts) to render tiles on Android.
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        // The `action` guard is essential: a marker tap ALSO fires the map's own
        // onPress, so without it the marker would select a spot and this handler
        // would immediately deselect it — the sheet would never appear.
        onPress={(event) => {
          if (event.nativeEvent.action !== 'marker-press') {
            setSelectedSpotId(null);
          }
        }}
        accessibilityLabel={`Map showing your location and ${spots.length} black spots nearby.`}
      >
        {spots.map((spot) => (
          <BlackSpotMarker
            key={spot.id}
            spot={spot}
            radiusM={effectiveRadiusM(spot, userAlertRadiusM)}
            isInside={insideIds.has(spot.id)}
            onPress={(tapped) => setSelectedSpotId(tapped.id)}
          />
        ))}
      </MapView>

      {/* The live warning. Rendered above everything, but never full-screen. */}
      {activeAlert !== null ? (
        <ProximityAlertBanner
          alert={activeAlert}
          onDismiss={dismissAlert}
          onOpenDetail={(blackSpotId) => {
            dismissAlert();
            router.push({ pathname: '/black-spots/[id]', params: { id: blackSpotId } });
          }}
        />
      ) : (
        <StatusStrip
          spotCount={spots.length}
          loading={spotsLoading}
          error={spotsError}
          isFromCache={isFromCache}
          isStale={isStale}
          alertsEnabled={alertsEnabled}
          onRetry={refetch}
        />
      )}

      <Pressable
        onPress={recentre}
        accessibilityRole="button"
        accessibilityLabel="Re-centre the map on your location"
        accessibilityState={{ busy: locationLoading }}
        hitSlop={8}
        style={[
          styles.recentre,
          theme.elevation(2),
          {
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.pill,
            bottom: insets.bottom + (selectedSpot === null ? theme.spacing.xxl : SHEET_CLEARANCE),
            height: theme.minTouchTarget,
            right: theme.spacing.lg,
            width: theme.minTouchTarget,
          },
        ]}
      >
        {locationLoading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Ionicons
            name={Platform.OS === 'ios' ? 'locate' : 'locate-outline'}
            size={22}
            color={theme.colors.primary}
          />
        )}
      </Pressable>

      {selectedSpot !== null && currentLocation !== null ? (
        <BlackSpotSheet
          spot={selectedSpot}
          userLocation={currentLocation}
          effectiveRadiusM={effectiveRadiusM(selectedSpot, userAlertRadiusM)}
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

/**
 * Small status strip shown when no warning is active.
 *
 * Its job is honesty: say when data is cached and possibly out of date, when
 * nothing was found, and when alerts are switched off — rather than letting an
 * empty map imply "no hazards here".
 */
function StatusStrip({
  spotCount,
  loading,
  error,
  isFromCache,
  isStale,
  alertsEnabled,
  onRetry,
}: {
  spotCount: number;
  loading: boolean;
  error: ReturnType<typeof useNearbyBlackSpots>['error'];
  isFromCache: boolean;
  isStale: boolean;
  alertsEnabled: boolean;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const containerStyle = [
    styles.strip,
    theme.elevation(2),
    {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.md,
      marginHorizontal: theme.spacing.lg,
      marginTop: insets.top + theme.spacing.sm,
      padding: theme.spacing.md,
      gap: theme.spacing.xxs,
    },
  ];

  if (error !== null && spotCount === 0) {
    return (
      <View style={containerStyle}>
        <ErrorState error={error} title="Could not load black spots" onRetry={onRetry} />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={containerStyle} accessibilityRole="summary">
        <AppText variant="caption" color="textMuted">
          Loading black spots near you…
        </AppText>
      </View>
    );
  }

  if (spotCount === 0) {
    return (
      <View style={containerStyle}>
        <EmptyState
          title="No black spots recorded nearby"
          description="This does not mean the area is safe — coverage is incomplete. Stay alert."
        />
      </View>
    );
  }

  return (
    <View style={containerStyle} accessibilityRole="summary">
      <AppText variant="caption" color="textMuted">
        {spotCount === 1 ? '1 black spot nearby' : `${spotCount} black spots nearby`}
        {alertsEnabled ? '' : ' · alerts are off'}
      </AppText>
      {isFromCache ? (
        <AppText variant="caption" color={isStale ? 'danger' : 'textSubtle'}>
          {isStale
            ? 'Showing saved data from over a day ago — you may be offline.'
            : 'Showing saved data — you may be offline.'}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  strip: { position: 'absolute', left: 0, right: 0, top: 0 },
  recentre: { alignItems: 'center', justifyContent: 'center', position: 'absolute' },
});
