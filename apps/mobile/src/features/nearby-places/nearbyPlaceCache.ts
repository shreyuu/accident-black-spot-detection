import AsyncStorage from '@react-native-async-storage/async-storage';

import type { NearbyPlace, NearbyPlaceCategory } from '@/features/nearby-places/nearbyPlaceTypes';
import { NEARBY_PLACE_CATEGORIES } from '@/features/nearby-places/nearbyPlaceTypes';
import { haversineDistanceM, isValidCoordinate, type Coordinates } from '@/utils/geo';
import { logger } from '@/utils/logger';

/**
 * Offline copy of the last nearby-places result.
 *
 * The reason this exists is the phase's own gate: **provider failure must be
 * recoverable**. A public map API being rate limited, or the phone having no
 * signal at the roadside, are both entirely ordinary — and both are exactly when
 * someone needs the nearest hospital. A stale list clearly labelled as stale is
 * far better than an error screen.
 *
 * Modelled on `blackSpotCache` and it stores the same shape of thing: public,
 * non-personal facility records, plus a **rounded** centre. Rounding matters for
 * the same reason it did there — the cache has to know roughly where it was
 * built so it can refuse to serve another city's hospitals, but it has no need
 * for the user's exact position, and writing one to disk would be the start of
 * the location history this project promises not to keep.
 */

const CACHE_KEY = 'nearbyPlaces.v1';

/** Bounded so a long journey cannot grow the file without limit. */
const MAX_CACHED_PLACES = 60;

/** Beyond this the cache is labelled old in the UI. Not discarded — see below. */
export const NEARBY_CACHE_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Beyond this the cached centre is too far away to be relevant, in metres.
 *
 * Wider than the black spot cache's 20 km because this data changes far more
 * slowly — a hospital is in the same place next month — and because the failure
 * mode is milder: an out-of-range hospital is visibly far away in the list,
 * whereas a missing proximity warning is silent.
 */
export const NEARBY_CACHE_MAX_DISTANCE_M = 50_000;

export interface CachedNearbyPlaces {
  places: NearbyPlace[];
  /** Epoch ms the cache was written. */
  cachedAt: number;
  centre: Coordinates;
  stale: boolean;
}

interface StoredShape {
  version: 1;
  cachedAt: number;
  centre: Coordinates;
  places: unknown[];
}

/** ~1 km. Enough to place the cache, not enough to track anyone. */
function roundCentre(centre: Coordinates): Coordinates {
  return {
    latitude: Math.round(centre.latitude * 100) / 100,
    longitude: Math.round(centre.longitude * 100) / 100,
  };
}

/**
 * Validate one record read back from disk.
 *
 * Re-checked rather than trusted: this is disk state that a schema change, a
 * partial write, or a downgrade can invalidate, and a record with a broken
 * position would corrupt the distance sort it feeds.
 */
function isCachedPlace(value: unknown): value is NearbyPlace {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return false;
  }
  if (typeof candidate.name !== 'string' || candidate.name.length === 0) {
    return false;
  }
  if (!NEARBY_PLACE_CATEGORIES.includes(candidate.category as NearbyPlaceCategory)) {
    return false;
  }
  if (typeof candidate.latitude !== 'number' || typeof candidate.longitude !== 'number') {
    return false;
  }
  return isValidCoordinate({ latitude: candidate.latitude, longitude: candidate.longitude });
}

/**
 * Rebuild a record, keeping only the known fields.
 *
 * The source is marked `cache`, not the provider that originally produced it.
 * That is the whole point of the field: the screen has to be able to say "saved
 * on this device" rather than implying it just heard this from OpenStreetMap.
 */
function toCachedPlace(raw: NearbyPlace): NearbyPlace {
  const { address, phone, alwaysOpen } = raw;
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    latitude: raw.latitude,
    longitude: raw.longitude,
    source: 'cache',
    ...(typeof address === 'string' && address.length > 0 ? { address } : {}),
    ...(typeof phone === 'string' && phone.length > 0 ? { phone } : {}),
    ...(typeof alwaysOpen === 'boolean' ? { alwaysOpen } : {}),
  };
}

export async function saveNearbyPlaces(
  places: readonly NearbyPlace[],
  centre: Coordinates,
): Promise<void> {
  try {
    const payload: StoredShape = {
      version: 1,
      cachedAt: Date.now(),
      centre: roundCentre(centre),
      places: places.slice(0, MAX_CACHED_PLACES),
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    // Caching is an optimisation. Failing to write it must never break the screen.
    logger.warn('nearbyPlaceCache', 'Could not write the nearby places cache', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Read the cache, if it is usable from `centre`.
 *
 * Returns `null` for missing, corrupt, or too-distant data. Age alone never
 * disqualifies it — a week-old hospital list is still a hospital list, and this
 * is the fallback of last resort — but `stale` is surfaced so the UI can say so.
 */
export async function loadNearbyPlaces(centre: Coordinates): Promise<CachedNearbyPlaces | null> {
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
      !Array.isArray((parsed as StoredShape).places)
    ) {
      logger.warn('nearbyPlaceCache', 'Discarding an unrecognised cache payload');
      await clearNearbyPlaces();
      return null;
    }

    const stored = parsed as StoredShape;

    if (typeof stored.cachedAt !== 'number' || !isValidCoordinate(stored.centre)) {
      await clearNearbyPlaces();
      return null;
    }

    if (haversineDistanceM(centre, stored.centre) > NEARBY_CACHE_MAX_DISTANCE_M) {
      // Another region's facilities are worse than none: they would be listed
      // with plausible-looking distances and send someone a long way wrong.
      return null;
    }

    const places = stored.places.filter(isCachedPlace).map((place) => toCachedPlace(place));

    if (places.length === 0) {
      return null;
    }

    return {
      places,
      cachedAt: stored.cachedAt,
      centre: stored.centre,
      stale: Date.now() - stored.cachedAt > NEARBY_CACHE_STALE_AFTER_MS,
    };
  } catch (error) {
    logger.warn('nearbyPlaceCache', 'Could not read the nearby places cache', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

export async function clearNearbyPlaces(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    // Nothing useful to do if even removal fails.
  }
}
