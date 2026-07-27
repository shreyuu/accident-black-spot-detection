import AsyncStorage from '@react-native-async-storage/async-storage';

import { blackSpotSchema } from '@/features/black-spots/blackSpotSchema';
import type { BlackSpot } from '@/types/domain';
import { haversineDistanceM, type Coordinates } from '@/utils/geo';
import { logger } from '@/utils/logger';

/**
 * Offline cache of the nearest black spots.
 *
 * Stored in AsyncStorage rather than SecureStore: black spot records are public
 * data with no personal content, so the project's rule is that they belong in
 * ordinary cache storage. The cached *centre* is the coarsest thing here, and it
 * is rounded before being written — see `roundCentre`.
 *
 * The cache exists so that a user who loses signal mid-journey keeps the
 * warnings they already had. It is explicitly allowed to be stale, and callers
 * are given `cachedAt` so the UI can say so rather than presenting old data as
 * current.
 */

const CACHE_KEY = 'blackSpots.nearby.v1';

/** How many spots to keep. Bounded so the cache cannot grow without limit. */
const MAX_CACHED_SPOTS = 200;

/**
 * Age beyond which the cache is treated as stale, in milliseconds.
 *
 * Stale does not mean discarded — out-of-date warnings are better than none —
 * but the UI must label them.
 */
export const CACHE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Distance beyond which the cached centre is too far away to be useful.
 *
 * Serving warnings cached in another city would be worse than serving none.
 */
export const CACHE_MAX_DISTANCE_M = 20_000;

export interface CachedBlackSpots {
  spots: BlackSpot[];
  /** Epoch ms when the cache was written. */
  cachedAt: number;
  /** Coarse centre the cache was built around. */
  centre: Coordinates;
  /** True once older than `CACHE_STALE_AFTER_MS`. */
  stale: boolean;
}

/**
 * Round a position to roughly 1 km before storing it.
 *
 * The cache has to remember where it was built so it can refuse to serve
 * warnings for the wrong city, but it does not need the user's precise position
 * to do that — and writing an exact coordinate to disk would be the beginning of
 * exactly the location history this project promised not to keep.
 */
function roundCentre(centre: Coordinates): Coordinates {
  return {
    latitude: Math.round(centre.latitude * 100) / 100,
    longitude: Math.round(centre.longitude * 100) / 100,
  };
}

interface StoredShape {
  version: 1;
  cachedAt: number;
  centre: Coordinates;
  spots: unknown[];
}

export async function saveNearbyBlackSpots(
  spots: readonly BlackSpot[],
  centre: Coordinates,
): Promise<void> {
  try {
    const payload: StoredShape = {
      version: 1,
      cachedAt: Date.now(),
      centre: roundCentre(centre),
      // Timestamps are dropped: Firestore `Timestamp` instances do not survive
      // JSON, and nothing offline needs them.
      spots: spots
        .slice(0, MAX_CACHED_SPOTS)
        .map(({ createdAt: _c, updatedAt: _u, ...rest }) => rest),
    };

    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    // Caching is an optimisation; failing to write it must never break the app.
    logger.warn('blackSpotCache', 'Could not write the offline cache', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Read the cache, if it is usable from `centre`.
 *
 * Returns `null` for a missing, corrupt, or too-distant cache. Every failure
 * degrades to "no cache" rather than throwing, because this runs on the path
 * that renders the map.
 */
export async function loadNearbyBlackSpots(centre: Coordinates): Promise<CachedBlackSpots | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw === null) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as StoredShape).version !== 1 ||
      !Array.isArray((parsed as StoredShape).spots)
    ) {
      logger.warn('blackSpotCache', 'Discarding an unrecognised cache payload');
      await clearNearbyBlackSpots();
      return null;
    }

    const stored = parsed as StoredShape;

    const distanceFromCache = haversineDistanceM(centre, stored.centre);
    if (distanceFromCache > CACHE_MAX_DISTANCE_M) {
      logger.debug('blackSpotCache', 'Cache is for a different area; ignoring', {
        distanceM: Math.round(distanceFromCache),
      });
      return null;
    }

    // Re-validated on read: the cache is disk state that a schema change, or a
    // partial write, can invalidate.
    const spots: BlackSpot[] = [];
    for (const candidate of stored.spots) {
      const result = blackSpotSchema.safeParse(candidate);
      if (result.success) {
        const { description, ...rest } = result.data;
        spots.push({
          ...rest,
          ...(description === undefined || description.length === 0 ? {} : { description }),
          createdAt: null,
          updatedAt: null,
        });
      }
    }

    if (spots.length === 0) {
      return null;
    }

    return {
      spots,
      cachedAt: stored.cachedAt,
      centre: stored.centre,
      stale: Date.now() - stored.cachedAt > CACHE_STALE_AFTER_MS,
    };
  } catch (error) {
    logger.warn('blackSpotCache', 'Could not read the offline cache', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

export async function clearNearbyBlackSpots(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    // Nothing useful to do if even removal fails.
  }
}
