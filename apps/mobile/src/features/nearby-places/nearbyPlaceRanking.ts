import type { NearbyPlace, RankedNearbyPlace } from '@/features/nearby-places/nearbyPlaceTypes';
import { haversineDistanceM, isValidCoordinate, type Coordinates } from '@/utils/geo';

/**
 * Turning raw provider output into the list the user sees.
 *
 * Pure, in the same spirit as `proximityEngine`: no fetch, no storage, no React.
 * Everything that decides *which* facilities are shown and *in what order*
 * happens here, so it can be tested exhaustively with plain objects rather than
 * by pointing the app at a live map service and hoping.
 */

/**
 * How close two records must be to be considered the same facility, in metres.
 *
 * Merging matters because results can come from more than one source at once —
 * a live provider plus the offline cache — and a large hospital is frequently
 * mapped several times over: once as a node, once as the building outline, once
 * per department. Showing "St Mary's Hospital" five times pushes the genuinely
 * different options off the screen.
 *
 * 120 m is chosen to span a hospital site without swallowing a neighbouring
 * building. It is deliberately paired with a name check below; distance alone
 * would merge a police station and a hospital that share a compound.
 */
export const DUPLICATE_RADIUS_M = 120;

/** Upper bound on the rendered list, so a dense city cannot produce a thousand rows. */
export const MAX_RANKED_RESULTS = 40;

/**
 * Compare names for the duplicate check.
 *
 * Case, punctuation and the usual decorations are stripped, because the same
 * hospital is entered by different volunteers as "St Mary's Hospital",
 * "St Marys Hospital" and "ST. MARY'S HOSPITAL".
 */
export function normaliseName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      // Combining marks, so "Hôpital" and "Hopital" compare equal.
      .replace(/[\u0300-\u036f]/g, '')
      // Apostrophes are deleted rather than turned into a separator, and both the
      // typographic and the straight form are covered. Replacing them with a space
      // would leave "st mary s hospital", which no longer matches the equally
      // common "St Marys Hospital" — the exact pair this is meant to reconcile.
      .replace(/['’ʼ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
}

/**
 * Whether two records are plausibly the same facility.
 *
 * Both conditions are required. Name alone would merge the many distinct
 * branches of a chain; position alone would merge co-located but different
 * services. Requiring both errs towards showing a duplicate rather than hiding
 * a real option, which is the right way round for this screen.
 */
function isSameFacility(a: NearbyPlace, b: NearbyPlace): boolean {
  if (a.category !== b.category) {
    return false;
  }
  if (haversineDistanceM(a, b) > DUPLICATE_RADIUS_M) {
    return false;
  }

  const nameA = normaliseName(a.name);
  const nameB = normaliseName(b.name);
  if (nameA.length === 0 || nameB.length === 0) {
    // An unnamed record cannot be matched by name, and merging on position
    // alone would discard a genuinely separate facility. Keep both.
    return false;
  }

  // One containing the other covers "St Mary's" versus "St Mary's Hospital",
  // which is how the same site is commonly recorded twice.
  return nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA);
}

/**
 * Which of two duplicates to keep.
 *
 * Richness wins: a record with a phone number and an address is more useful
 * than a bare pin, and this screen exists so someone can ring ahead or set off.
 * Distance is the tie-breaker.
 */
function preferred(a: RankedNearbyPlace, b: RankedNearbyPlace): RankedNearbyPlace {
  const score = (place: RankedNearbyPlace): number =>
    (place.phone === undefined ? 0 : 2) +
    (place.address === undefined ? 0 : 1) +
    (place.alwaysOpen === undefined ? 0 : 1);

  const scoreA = score(a);
  const scoreB = score(b);
  if (scoreA !== scoreB) {
    return scoreA > scoreB ? a : b;
  }
  return a.distanceM <= b.distanceM ? a : b;
}

export interface RankNearbyPlacesInput {
  places: readonly NearbyPlace[];
  centre: Coordinates;
  /** Results beyond this are dropped. */
  radiusM: number;
  limit?: number;
}

/**
 * Annotate with distance, discard the unusable, merge duplicates, sort nearest first.
 *
 * Providers do not agree on radius semantics — some measure from a bounding box,
 * some return whatever is in a tile — so the radius is enforced here rather than
 * trusted. Records with an unusable position are dropped outright: a NaN
 * latitude reaching the distance sort silently corrupts the whole ordering, and
 * a facility shown at the wrong distance is worse than one not shown at all.
 */
export function rankNearbyPlaces(input: RankNearbyPlacesInput): RankedNearbyPlace[] {
  const { places, centre, radiusM, limit = MAX_RANKED_RESULTS } = input;

  if (!isValidCoordinate(centre)) {
    return [];
  }

  const withDistance: RankedNearbyPlace[] = [];
  for (const place of places) {
    if (!isValidCoordinate(place)) {
      continue;
    }
    const distanceM = haversineDistanceM(centre, place);
    if (distanceM > radiusM) {
      continue;
    }
    withDistance.push({ ...place, distanceM });
  }

  withDistance.sort((a, b) => a.distanceM - b.distanceM);

  // Nearest-first before merging, so the survivor of a duplicate pair is
  // compared against everything already kept rather than in arrival order.
  const kept: RankedNearbyPlace[] = [];
  for (const candidate of withDistance) {
    const existingIndex = kept.findIndex((entry) => isSameFacility(entry, candidate));
    if (existingIndex === -1) {
      kept.push(candidate);
      continue;
    }
    const existing = kept[existingIndex];
    if (existing !== undefined) {
      kept[existingIndex] = preferred(existing, candidate);
    }
  }

  return kept.slice(0, limit);
}

/** Group a ranked list by category, preserving the nearest-first order within each. */
export function groupByCategory(
  places: readonly RankedNearbyPlace[],
): Map<NearbyPlace['category'], RankedNearbyPlace[]> {
  const grouped = new Map<NearbyPlace['category'], RankedNearbyPlace[]>();
  for (const place of places) {
    const existing = grouped.get(place.category);
    if (existing === undefined) {
      grouped.set(place.category, [place]);
    } else {
      existing.push(place);
    }
  }
  return grouped;
}
