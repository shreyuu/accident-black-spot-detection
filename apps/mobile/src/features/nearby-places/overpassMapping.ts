import type { NearbyPlace, NearbyPlaceCategory } from '@/features/nearby-places/nearbyPlaceTypes';
import { isValidCoordinate } from '@/utils/geo';

/**
 * Translating raw Overpass output into `NearbyPlace`.
 *
 * Pure and separate from the network call, because this is where the awkwardness
 * of crowd-mapped data lives and it needs tests, not a live endpoint. OpenStreetMap
 * has no schema: tags are whatever a volunteer typed, a facility may be a point
 * or an area, and most records carry nothing beyond a position.
 *
 * The governing rule is that a record is either understood completely enough to
 * be trustworthy or it is dropped. A hospital shown in the wrong place, or a
 * police station that is really a disused building, is worse than a shorter list.
 */

/**
 * Overpass JSON, narrowed to what is used.
 *
 * Typed as an interface with an index-free shape rather than validated with Zod:
 * every field is checked explicitly below anyway, and the useful validation here
 * is semantic ("does this have a usable position") rather than structural.
 */
export interface OverpassElement {
  type?: unknown;
  id?: unknown;
  /** Present on nodes. */
  lat?: unknown;
  lon?: unknown;
  /** Present on ways and relations when `out center` is requested. */
  center?: { lat?: unknown; lon?: unknown } | undefined;
  tags?: Record<string, unknown> | undefined;
}

export interface OverpassResponse {
  elements?: unknown;
}

/**
 * OSM tags that identify each category.
 *
 * `amenity=clinic` is deliberately **excluded** from `hospital`. A clinic is
 * frequently a small daytime practice with no emergency provision, and someone
 * driving to one after a crash on the strength of this screen would arrive at a
 * locked door. Under-listing is the survivable error here.
 */
const CATEGORY_TAGS: Record<NearbyPlaceCategory, { key: string; values: readonly string[] }> = {
  hospital: { key: 'amenity', values: ['hospital'] },
  police: { key: 'amenity', values: ['police'] },
};

/** The Overpass tag filters for a set of categories, for query building. */
export function categoryTagFilters(
  categories: readonly NearbyPlaceCategory[],
): { key: string; value: string }[] {
  const filters: { key: string; value: string }[] = [];
  for (const category of categories) {
    const spec = CATEGORY_TAGS[category];
    for (const value of spec.values) {
      filters.push({ key: spec.key, value });
    }
  }
  return filters;
}

function categoryFor(tags: Record<string, unknown>): NearbyPlaceCategory | null {
  for (const category of Object.keys(CATEGORY_TAGS) as NearbyPlaceCategory[]) {
    const spec = CATEGORY_TAGS[category];
    const value = tags[spec.key];
    if (typeof value === 'string' && spec.values.includes(value)) {
      return category;
    }
  }
  return null;
}

function readString(tags: Record<string, unknown>, key: string): string | undefined {
  const value = tags[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** First non-empty tag from a list of aliases. Volunteers use all of them. */
function readFirst(tags: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = readString(tags, key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

/**
 * Assemble a street address from the `addr:*` tags.
 *
 * Returns `undefined` unless there is enough to be worth showing. A lone
 * postcode or a bare house number tells the user nothing and makes the row look
 * more informative than it is.
 */
export function buildAddress(tags: Record<string, unknown>): string | undefined {
  const house = readString(tags, 'addr:housenumber');
  const street = readString(tags, 'addr:street');
  const city = readString(tags, 'addr:city');
  const postcode = readString(tags, 'addr:postcode');

  const line = [house, street]
    .filter((part) => part !== undefined)
    .join(' ')
    .trim();
  const parts = [line.length === 0 ? undefined : line, city, postcode].filter(
    (part): part is string => part !== undefined && part.length > 0,
  );

  // A street or a city on its own locates the place; a postcode or a house
  // number on its own does not. `line` is not a sufficient test here — it is
  // just the house number when no street is tagged, which is the exact case
  // this is meant to reject.
  const hasSubstance = street !== undefined || city !== undefined;
  return hasSubstance && parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * Read `opening_hours`, returning `true` only for an unambiguous 24/7.
 *
 * Anything else is `undefined` — "unknown" — rather than `false`. The tag has a
 * genuinely complex grammar ("Mo-Fr 08:00-18:00; Sa 09:00-13:00; PH off") and
 * this app has no business half-parsing it. Claiming a hospital is closed on the
 * strength of a misread string is the one outcome to avoid.
 */
export function readAlwaysOpen(tags: Record<string, unknown>): boolean | undefined {
  const value = readString(tags, 'opening_hours');
  if (value === undefined) {
    return undefined;
  }
  return value.replace(/\s+/g, '').toLowerCase() === '24/7' ? true : undefined;
}

function readPosition(element: OverpassElement): { latitude: number; longitude: number } | null {
  // Nodes carry lat/lon directly; ways and relations carry a computed centre,
  // which is why the query asks for `out center`. A hospital is usually mapped
  // as an area, so without the centre branch most results would be discarded.
  const candidates: { lat: unknown; lon: unknown }[] = [
    { lat: element.lat, lon: element.lon },
    { lat: element.center?.lat, lon: element.center?.lon },
  ];

  for (const candidate of candidates) {
    if (typeof candidate.lat === 'number' && typeof candidate.lon === 'number') {
      const position = { latitude: candidate.lat, longitude: candidate.lon };
      if (isValidCoordinate(position)) {
        return position;
      }
    }
  }
  return null;
}

/**
 * Convert one element, or `null` if it cannot be trusted.
 *
 * Dropped when: there is no usable position, no recognised category tag, or no
 * name. The name requirement is deliberate — "Hospital, 1.2 km" with no name is
 * not something anyone can act on, and it occupies a row that a named facility
 * could have used.
 */
export function mapOverpassElement(element: OverpassElement): NearbyPlace | null {
  if (typeof element !== 'object' || element === null) {
    return null;
  }

  const tags = element.tags;
  if (typeof tags !== 'object' || tags === null) {
    return null;
  }

  const category = categoryFor(tags);
  if (category === null) {
    return null;
  }

  const position = readPosition(element);
  if (position === null) {
    return null;
  }

  // `name:en` is a fallback for regions where `name` is in a local script the
  // user may not read; it is never preferred over the local name.
  const name = readFirst(tags, ['name', 'name:en', 'official_name']);
  if (name === undefined) {
    return null;
  }

  const id = element.id;
  if (typeof id !== 'number' && typeof id !== 'string') {
    return null;
  }

  const elementType = typeof element.type === 'string' ? element.type : 'element';
  const address = buildAddress(tags);
  const phone = readFirst(tags, ['phone', 'contact:phone', 'emergency:phone']);
  const alwaysOpen = readAlwaysOpen(tags);

  return {
    // Prefixed with the provider and the element type: OSM numbers nodes, ways
    // and relations in separate sequences, so id 12345 exists three times over.
    id: `osm:${elementType}:${String(id)}`,
    name,
    category,
    latitude: position.latitude,
    longitude: position.longitude,
    source: 'openstreetmap',
    // Spread conditionally: under `exactOptionalPropertyTypes` an explicit
    // `undefined` is not the same as an absent optional property, and these
    // objects are serialised into the cache where the difference shows up.
    ...(address === undefined ? {} : { address }),
    ...(phone === undefined ? {} : { phone }),
    ...(alwaysOpen === undefined ? {} : { alwaysOpen }),
  };
}

/**
 * Convert a whole response, skipping anything unusable.
 *
 * Never throws. A single malformed element in a thousand must not empty the
 * list, and Overpass does occasionally return partial results when a query
 * approaches its time limit.
 */
export function mapOverpassResponse(response: OverpassResponse | unknown): NearbyPlace[] {
  if (typeof response !== 'object' || response === null) {
    return [];
  }
  const elements = (response as OverpassResponse).elements;
  if (!Array.isArray(elements)) {
    return [];
  }

  const places: NearbyPlace[] = [];
  for (const element of elements) {
    const place = mapOverpassElement(element as OverpassElement);
    if (place !== null) {
      places.push(place);
    }
  }
  return places;
}
