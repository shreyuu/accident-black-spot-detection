import type { NearbyPlace, NearbyPlaceCategory } from '@/features/nearby-places/nearbyPlaceTypes';
import { isValidCoordinate } from '@/utils/geo';

/**
 * Translating Google Places API (New) output into `NearbyPlace`.
 *
 * Pure and separate from the request, for the same reason as the Overpass
 * mapping: the awkward part is the data, not the transport, and this is the
 * layer that must not be allowed to leak a provider-shaped object upwards.
 *
 * The response is far more regular than OpenStreetMap's, but it is still checked
 * field by field. A shape assumed rather than verified is how a schema change on
 * someone else's server becomes a crash on a user's phone.
 */

/** Google's `includedTypes` values for each of our categories. */
const CATEGORY_TYPES: Record<NearbyPlaceCategory, readonly string[]> = {
  // `doctor` and `pharmacy` are deliberately excluded, matching the Overpass
  // mapping: this list is for somewhere that can help after a road incident.
  hospital: ['hospital'],
  police: ['police'],
};

/** The `includedTypes` array for a request. */
export function includedTypesFor(categories: readonly NearbyPlaceCategory[]): string[] {
  const types = new Set<string>();
  for (const category of categories) {
    for (const type of CATEGORY_TYPES[category]) {
      types.add(type);
    }
  }
  return [...types];
}

/** Map a returned `types` array back to one of our categories. */
export function categoryForTypes(types: readonly unknown[]): NearbyPlaceCategory | null {
  const asStrings = types.filter((type): type is string => typeof type === 'string');
  for (const category of Object.keys(CATEGORY_TYPES) as NearbyPlaceCategory[]) {
    if (CATEGORY_TYPES[category].some((type) => asStrings.includes(type))) {
      return category;
    }
  }
  return null;
}

export interface GooglePlaceResult {
  id?: unknown;
  displayName?: { text?: unknown } | undefined;
  formattedAddress?: unknown;
  nationalPhoneNumber?: unknown;
  internationalPhoneNumber?: unknown;
  location?: { latitude?: unknown; longitude?: unknown } | undefined;
  types?: unknown;
  regularOpeningHours?: { openNow?: unknown } | undefined;
}

export interface GooglePlacesResponse {
  places?: unknown;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Convert one result, or `null` if it cannot be trusted.
 *
 * `regularOpeningHours.openNow` is read but **not** mapped onto `alwaysOpen`:
 * "open right now" and "open 24 hours" are different claims, and conflating them
 * would tell a user at 3 a.m. that a daytime clinic never closes. `alwaysOpen`
 * is therefore left unset for this provider, which the type documents as
 * "the source does not say".
 */
export function mapGooglePlace(result: GooglePlaceResult): NearbyPlace | null {
  if (typeof result !== 'object' || result === null) {
    return null;
  }

  const id = readString(result.id);
  if (id === undefined) {
    return null;
  }

  const name = readString(result.displayName?.text);
  if (name === undefined) {
    return null;
  }

  const latitude = result.location?.latitude;
  const longitude = result.location?.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  if (!isValidCoordinate({ latitude, longitude })) {
    return null;
  }

  const category = Array.isArray(result.types) ? categoryForTypes(result.types) : null;
  if (category === null) {
    return null;
  }

  const address = readString(result.formattedAddress);
  // International first: it works from anywhere, which matters to someone
  // travelling, and the national form is only useful inside its own country.
  const phone =
    readString(result.internationalPhoneNumber) ?? readString(result.nationalPhoneNumber);

  return {
    id: `google:${id}`,
    name,
    category,
    latitude,
    longitude,
    source: 'google-places',
    ...(address === undefined ? {} : { address }),
    ...(phone === undefined ? {} : { phone }),
  };
}

/** Convert a whole response, skipping anything unusable. Never throws. */
export function mapGooglePlacesResponse(response: GooglePlacesResponse | unknown): NearbyPlace[] {
  if (typeof response !== 'object' || response === null) {
    return [];
  }
  const results = (response as GooglePlacesResponse).places;
  if (!Array.isArray(results)) {
    return [];
  }

  const places: NearbyPlace[] = [];
  for (const result of results) {
    const place = mapGooglePlace(result as GooglePlaceResult);
    if (place !== null) {
      places.push(place);
    }
  }
  return places;
}
