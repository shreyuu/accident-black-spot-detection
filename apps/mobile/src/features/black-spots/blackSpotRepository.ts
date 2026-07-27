import { geohashQueryBounds } from 'geofire-common';
import {
  collection,
  endAt,
  getDocs,
  orderBy,
  query,
  startAt,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';

import { blackSpotSchema } from '@/features/black-spots/blackSpotSchema';
import { getFirebaseFirestore } from '@/services/firebase/app';
import type { BlackSpot, NearbyBlackSpot } from '@/types/domain';
import { AppError } from '@/utils/errors';
import { haversineDistanceM, type Coordinates } from '@/utils/geo';
import { logger } from '@/utils/logger';

/**
 * Reads for the `blackSpots` collection.
 *
 * ## Why geohash bounding boxes
 *
 * Firestore cannot answer "everything within N metres of here". The naive
 * alternative — download the collection and filter on the device — would break
 * the project's performance rules and become unusable as the dataset grows.
 *
 * Instead each document stores a geohash of its coordinates. `geohashQueryBounds`
 * returns a small set of string ranges covering the requested circle, each of
 * which is an ordinary Firestore range query. The union of those ranges is a
 * superset of the circle — geohash cells are rectangles, so the corners overhang
 * — which is why every result is re-checked with an exact Haversine distance
 * before being returned.
 *
 * ## Why the query filters mirror the security rules exactly
 *
 * `firestore.rules` allows reads of `blackSpots` only where `verified == true`
 * and `active == true`. Firestore evaluates rules per returned document, so a
 * query that *could* match an unverified document is rejected outright rather
 * than filtered. The `where` clauses below therefore are not merely an
 * optimisation — without them the query fails. That is deliberate: it makes it
 * impossible for a client to request unverified data at all.
 */

export const BLACK_SPOTS_COLLECTION = 'blackSpots';

/**
 * How far around the user to fetch, in metres.
 *
 * Wider than any supported alert radius (max 2000 m) so that a user moving
 * through an area has upcoming spots already loaded, but bounded so a single
 * query cannot pull an unreasonable slice of the collection.
 */
export const NEARBY_QUERY_RADIUS_M = 5000;

/** Parse one snapshot, returning `null` rather than throwing on a bad record. */
function parseSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): BlackSpot | null {
  const raw = snapshot.data();
  const result = blackSpotSchema.safeParse({ ...raw, id: snapshot.id });

  if (!result.success) {
    // One malformed document must not blank the whole map, so it is skipped and
    // logged rather than allowed to reject the batch.
    logger.warn('blackSpotRepository', 'Skipping a black spot that failed validation', {
      blackSpotId: snapshot.id,
      issues: result.error.issues.map((issue) => issue.path.join('.')),
    });
    return null;
  }

  const { description, ...rest } = result.data;

  return {
    ...rest,
    // Omitted rather than set to undefined — see the note in userProfileRepository.
    ...(description === undefined || description.length === 0 ? {} : { description }),
    createdAt: (raw.createdAt as Timestamp | undefined) ?? null,
    updatedAt: (raw.updatedAt as Timestamp | undefined) ?? null,
  };
}

/**
 * Fetch verified, active black spots near a point, nearest first.
 *
 * Returns exact distances alongside each spot so callers do not recompute them.
 */
export async function fetchNearbyBlackSpots(
  centre: Coordinates,
  radiusM: number = NEARBY_QUERY_RADIUS_M,
): Promise<NearbyBlackSpot[]> {
  const firestore = getFirebaseFirestore();
  const spotsRef = collection(firestore, BLACK_SPOTS_COLLECTION);

  const bounds = geohashQueryBounds([centre.latitude, centre.longitude], radiusM);

  // Each bound is an independent range query; Firestore cannot OR them, so they
  // run in parallel and are merged here.
  const snapshots = await Promise.all(
    bounds.map((bound) =>
      getDocs(
        query(
          spotsRef,
          where('verified', '==', true),
          where('active', '==', true),
          orderBy('geohash'),
          startAt(bound[0]),
          endAt(bound[1]),
        ),
      ),
    ),
  );

  /**
   * Detect a result that never reached the server.
   *
   * `getDocs` does **not** reject when the device is offline — it resolves from
   * Firestore's own local cache, which for a fresh install is empty. The caller
   * would then see a perfectly ordinary empty result and conclude there are no
   * black spots nearby, which is both wrong and dangerous: "no warnings here"
   * and "could not check" must never look the same.
   *
   * `metadata.fromCache` is the signal that distinguishes them. If every bound
   * came from cache, the query is reported as a network failure so callers can
   * fall back to our own offline cache and label the data as saved.
   */
  const servedEntirelyFromCache =
    snapshots.length > 0 && snapshots.every((snapshot) => snapshot.metadata.fromCache);

  if (servedEntirelyFromCache) {
    throw new AppError('network', 'Could not check for black spots — you appear to be offline.', {
      retryable: true,
      technicalMessage: 'Every geohash bound resolved from the Firestore local cache.',
    });
  }

  // Overlapping bounds can return the same document more than once.
  const seen = new Set<string>();
  const nearby: NearbyBlackSpot[] = [];

  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) {
      if (seen.has(document.id)) {
        continue;
      }
      seen.add(document.id);

      const spot = parseSnapshot(document);
      if (spot === null) {
        continue;
      }

      // Defence in depth. The rules and the query both exclude these, but a
      // record that is not verified and active must never reach the alert
      // engine, so it is checked once more here.
      if (!spot.verified || !spot.active) {
        logger.warn('blackSpotRepository', 'Discarded an unverified or inactive record', {
          blackSpotId: spot.id,
        });
        continue;
      }

      // Geohash cells are rectangles, so the bounds overhang the requested
      // circle. This is the step that turns a superset into an answer.
      const distanceM = haversineDistanceM(centre, spot);
      if (distanceM <= radiusM) {
        nearby.push({ spot, distanceM });
      }
    }
  }

  nearby.sort((a, b) => a.distanceM - b.distanceM);

  logger.debug('blackSpotRepository', 'Fetched nearby black spots', {
    bounds: bounds.length,
    matched: nearby.length,
    radiusM,
  });

  return nearby;
}

/**
 * Fetch a single black spot by id.
 *
 * Implemented as a bounded query rather than a direct `getDoc` because the
 * security rules require `verified` and `active` to be true, and a `get` on a
 * document failing that condition is denied rather than returning null — which
 * would surface to the user as an error instead of "not found".
 */
export async function fetchBlackSpotById(
  id: string,
  centre: Coordinates,
): Promise<BlackSpot | null> {
  const nearby = await fetchNearbyBlackSpots(centre);
  return nearby.find((entry) => entry.spot.id === id)?.spot ?? null;
}
