import type { Coordinates } from '@/utils/geo';

/**
 * Provider-agnostic vocabulary for nearby facilities.
 *
 * Everything above the provider layer — ranking, caching, the screen — speaks
 * only in these terms. That separation is the point of the phase rather than
 * tidiness: the app has to keep working when a provider is unreachable, rate
 * limited, or replaced outright, and it can only do that if nothing outside
 * `*Provider.ts` has ever seen an Overpass element or a Google Places response.
 *
 * These are **not** Firestore entities, which is why they live here rather than
 * in `types/domain.ts`. Nothing about a hospital is stored in this project's
 * database; it is fetched, shown, and cached for offline use, and that is all.
 */

/**
 * Facility kinds the app can look up.
 *
 * Deliberately short. Phase 9's brief is police and hospitals — the two things
 * someone stopped at the roadside after an incident actually needs. Adding a
 * kind is one entry here plus one row in each provider's tag table; it was left
 * at two because every extra kind is another category of place the app is
 * implicitly vouching for.
 */
export const NEARBY_PLACE_CATEGORIES = ['hospital', 'police'] as const;
export type NearbyPlaceCategory = (typeof NEARBY_PLACE_CATEGORIES)[number];

/** Where a result came from. Shown to the user — attribution is a licence term. */
export const NEARBY_PLACE_SOURCES = ['openstreetmap', 'google-places', 'cache'] as const;
export type NearbyPlaceSource = (typeof NEARBY_PLACE_SOURCES)[number];

/**
 * One facility.
 *
 * Every field beyond the first five is optional, and that is a statement about
 * the data rather than a convenience: crowd-mapped sources routinely have a
 * position and a name and nothing else. A missing phone number is normal, and
 * the UI must render that case as "not listed" rather than as an empty string
 * that looks like a bug.
 */
export interface NearbyPlace {
  /**
   * Unique within a result set.
   *
   * Provider-prefixed, because two providers number their records
   * independently and an unprefixed id would silently collide the moment a
   * fallback result is merged with a cached one.
   */
  id: string;
  name: string;
  category: NearbyPlaceCategory;
  latitude: number;
  longitude: number;
  source: NearbyPlaceSource;
  /** Free text exactly as the provider gave it. Never parsed or relied upon. */
  address?: string;
  /**
   * Contact number as published.
   *
   * Deliberately not normalised or validated: a number that fails this app's
   * idea of valid is still the only number someone has for that hospital, and
   * dropping it would be worse than offering one that might not connect.
   */
  phone?: string;
  /**
   * Whether the provider states round-the-clock opening.
   *
   * Three states, not two. `undefined` means the source does not say, and that
   * must never be rendered as "closed" — the overwhelming majority of records
   * carry no opening hours at all, and implying a hospital is shut because a
   * volunteer never typed it in would be actively dangerous.
   */
  alwaysOpen?: boolean;
}

/** A place with its distance from the user, produced by `nearbyPlaceRanking`. */
export interface RankedNearbyPlace extends NearbyPlace {
  distanceM: number;
}

export interface NearbyPlacesQuery {
  centre: Coordinates;
  radiusM: number;
  categories: readonly NearbyPlaceCategory[];
  /** Lets the caller abandon a slow provider without waiting for its timeout. */
  signal?: AbortSignal;
}

/**
 * What every provider must offer.
 *
 * `search` is allowed to throw — the service layer treats a failure as a reason
 * to try the next provider, which is exactly the recoverability this phase is
 * gated on. What it must **not** do is return an empty array on failure: "no
 * hospitals near you" and "the lookup failed" are completely different messages
 * to show someone who has just had an accident, and a provider that conflates
 * them makes it impossible for anything upstream to tell them apart.
 */
export interface NearbyPlacesProvider {
  readonly id: Exclude<NearbyPlaceSource, 'cache'>;
  /** Shown in the attribution line. */
  readonly label: string;
  /** False when the provider cannot run at all — typically a missing key. */
  isAvailable(): boolean;
  search(query: NearbyPlacesQuery): Promise<NearbyPlace[]>;
}
