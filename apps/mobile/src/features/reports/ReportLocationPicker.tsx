import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { AppButton, AppText } from '@/components';
import { REPORT_LOCATION_NOTICE } from '@/features/reports/reportCopy';
import { useTheme } from '@/theme';
import { formatDistance, haversineDistanceM, regionDeltasForRadius } from '@/utils/geo';
import type { Coordinates } from '@/utils/geo';

export interface ReportLocationPickerProps {
  /** The position the report will be filed at. */
  value: Coordinates;
  onChange: (value: Coordinates) => void;
  /** The device's own position, used for the "move back" affordance. */
  deviceLocation: Coordinates | null;
  error?: string;
  disabled?: boolean;
}

/** How much map to show around the pin, in metres. */
const PREVIEW_RADIUS_M = 250;

/**
 * Where the incident happened.
 *
 * Defaults to the device position but is explicitly adjustable, because the
 * common case is reporting something a moment after passing it — filing it at
 * the reporter's current position would put the evidence a few hundred metres
 * down the road, and Phase 10 clusters on exactly these coordinates.
 *
 * The coordinates are also printed as text. That is not decoration: on Android
 * the tiles do not render without a Google Maps key (see the note in map.tsx),
 * and a blank grid with an invisible pin would leave the user unable to tell
 * where they are filing. The text is also what a screen reader can convey.
 */
export function ReportLocationPicker({
  value,
  onChange,
  deviceLocation,
  error,
  disabled = false,
}: ReportLocationPickerProps) {
  const theme = useTheme();

  // Framed on the initial value only. Re-framing on every drag would fight the
  // user's own panning and make the pin impossible to place precisely.
  const initialRegion = useMemo<Region>(() => {
    const { latitudeDelta, longitudeDelta } = regionDeltasForRadius(value, PREVIEW_RADIUS_M);
    return {
      latitude: value.latitude,
      longitude: value.longitude,
      latitudeDelta,
      longitudeDelta,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial framing only, by design
  }, []);

  const movedM =
    deviceLocation === null ? null : Math.round(haversineDistanceM(deviceLocation, value));
  const hasMoved = movedM !== null && movedM > 10;
  const hasError = error !== undefined && error.length > 0;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="label" color="textMuted">
        Where it happened
      </AppText>

      <AppText variant="caption" color="textSubtle">
        {REPORT_LOCATION_NOTICE}
      </AppText>

      <View
        style={[
          styles.mapFrame,
          {
            borderColor: hasError ? theme.colors.danger : theme.colors.border,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <MapView
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation={deviceLocation !== null}
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
          scrollEnabled={!disabled}
          zoomEnabled={!disabled}
          rotateEnabled={false}
          pitchEnabled={false}
          // A marker tap also fires the map's onPress; without the guard, picking
          // up the pin would immediately re-place it under the finger.
          onPress={(event) => {
            if (disabled || event.nativeEvent.action === 'marker-press') {
              return;
            }
            onChange({
              latitude: event.nativeEvent.coordinate.latitude,
              longitude: event.nativeEvent.coordinate.longitude,
            });
          }}
          accessibilityLabel="Map for choosing where the incident happened. Tap or drag the pin to move it."
        >
          <Marker
            coordinate={value}
            draggable={!disabled}
            onDragEnd={(event) =>
              onChange({
                latitude: event.nativeEvent.coordinate.latitude,
                longitude: event.nativeEvent.coordinate.longitude,
              })
            }
            title="Incident location"
            description="Drag to adjust"
            testID="report-location-marker"
          />
        </MapView>
      </View>

      <View style={{ gap: theme.spacing.xxs }}>
        <AppText
          variant="caption"
          color="textMuted"
          accessibilityLabel={`Selected position: latitude ${value.latitude.toFixed(5)}, longitude ${value.longitude.toFixed(5)}.`}
        >
          {`${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`}
        </AppText>

        {hasMoved ? (
          <AppText variant="caption" color="textSubtle">
            {`About ${formatDistance(movedM)} from where you are now.`}
          </AppText>
        ) : null}
      </View>

      {deviceLocation !== null && hasMoved ? (
        <AppButton
          label="Use my current location"
          variant="ghost"
          onPress={() => onChange(deviceLocation)}
          disabled={disabled}
          testID="use-current-location"
        />
      ) : null}

      {hasError ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mapFrame: { borderWidth: 1.5, height: 220, overflow: 'hidden' },
  map: { flex: 1 },
});
