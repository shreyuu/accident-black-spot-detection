import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText } from '@/components';
import { buildTelUrl } from '@/features/nearby-places/directions';
import {
  NEARBY_PLACES_ALWAYS_OPEN,
  NEARBY_PLACES_HOURS_UNKNOWN,
  NEARBY_PLACE_SINGULAR,
} from '@/features/nearby-places/nearbyPlaceCopy';
import type { RankedNearbyPlace } from '@/features/nearby-places/nearbyPlaceTypes';
import { useTheme } from '@/theme';
import { formatDistance } from '@/utils/geo';

export interface NearbyPlaceRowProps {
  place: RankedNearbyPlace;
  onDirections: (place: RankedNearbyPlace) => void;
  onCall: (place: RankedNearbyPlace, telUrl: string) => void;
}

/**
 * One facility.
 *
 * Two things about this row are deliberate rather than stylistic.
 *
 * **The category is written out, not just drawn.** A hospital and a police
 * station are distinguished by a word as well as an icon and a colour, following
 * the same rule the risk badges follow: no meaning carried by colour alone.
 *
 * **Unknown opening hours are stated as unknown.** Most crowd-mapped records
 * carry no hours at all, and leaving the line blank would let someone assume a
 * facility is open. The row says the data is missing and to check before
 * travelling.
 */
export function NearbyPlaceRow({ place, onDirections, onCall }: NearbyPlaceRowProps) {
  const theme = useTheme();

  const telUrl = place.phone === undefined ? null : buildTelUrl(place.phone);
  const categoryLabel = NEARBY_PLACE_SINGULAR[place.category];
  const distance = formatDistance(place.distanceM);

  return (
    <View
      // Grouped so a screen reader announces the facility as one item rather
      // than six disconnected fragments, with the buttons still reachable.
      accessible={false}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
        },
      ]}
    >
      <View style={[styles.header, { gap: theme.spacing.sm }]}>
        <Ionicons
          name={place.category === 'hospital' ? 'medkit-outline' : 'shield-outline'}
          size={20}
          color={theme.colors.primary}
          // Decorative: the category is already stated in words below.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View style={styles.headerText}>
          <AppText variant="titleSmall">{place.name}</AppText>
          <AppText variant="caption" color="textMuted">
            {categoryLabel} · {distance} away
          </AppText>
        </View>
      </View>

      {place.address !== undefined ? (
        <AppText variant="bodySmall" color="textMuted">
          {place.address}
        </AppText>
      ) : null}

      <AppText variant="caption" color="textSubtle">
        {place.alwaysOpen === true ? NEARBY_PLACES_ALWAYS_OPEN : NEARBY_PLACES_HOURS_UNKNOWN}
      </AppText>

      <View style={[styles.actions, { gap: theme.spacing.sm }]}>
        <AppButton
          label="Directions"
          variant="secondary"
          size="medium"
          onPress={() => onDirections(place)}
          style={styles.action}
          accessibilityLabel={`Directions to ${place.name}`}
          accessibilityHint="Opens your maps app"
        />
        {/*
          Only rendered when a dialable number survived cleaning. Offering a
          call button that silently does nothing is worse than not offering one.
        */}
        {telUrl !== null ? (
          <AppButton
            label="Call"
            variant="secondary"
            size="medium"
            onPress={() => onCall(place, telUrl)}
            style={styles.action}
            accessibilityLabel={`Call ${place.name} on ${place.phone ?? ''}`}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  header: { alignItems: 'center', flexDirection: 'row' },
  headerText: { flex: 1 },
  actions: { flexDirection: 'row' },
  action: { flex: 1 },
});
