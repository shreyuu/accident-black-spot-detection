import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { loadNearbyPlaces, saveNearbyPlaces } from '@/features/nearby-places/nearbyPlaceCache';
import { rankNearbyPlaces } from '@/features/nearby-places/nearbyPlaceRanking';
import type {
  NearbyPlaceCategory,
  NearbyPlacesProvider,
  RankedNearbyPlace,
} from '@/features/nearby-places/nearbyPlaceTypes';
import { fetchNearbyPlaces } from '@/features/nearby-places/nearbyPlacesService';
import { toAppError, type AppError } from '@/utils/errors';
import type { Coordinates } from '@/utils/geo';

/**
 * Nearby facilities, with an offline fallback.
 *
 * Follows the shape `useNearbyBlackSpots` established in Phase 4 — network
 * result authoritative, cache used only when the network has produced nothing —
 * because the two screens make the same promise to the user and should degrade
 * the same way.
 *
 * The staleness policy is the opposite of the app-wide default, and
 * deliberately: the provider list changes on a scale of months, a request costs
 * a public API's goodwill and possibly money, and this screen may be opened
 * repeatedly in a short space of time by someone who is stressed. So results are
 * cached hard rather than refetched on every mount.
 */

/** One hour. Hospitals do not move; re-asking every mount is pure waste. */
const STALE_TIME_MS = 60 * 60 * 1000;

/** Search radius. Wide enough to find something rural, bounded for the providers' sake. */
export const NEARBY_SEARCH_RADIUS_M = 15_000;

export interface UseNearbyPlacesResult {
  places: RankedNearbyPlace[];
  loading: boolean;
  error: AppError | null;
  /** True when everything on screen came from disk because the lookup failed. */
  isFromCache: boolean;
  /** Epoch ms the cache was written, when serving from cache. */
  cachedAt: number | null;
  /** True when cached data is older than the staleness window. */
  isStale: boolean;
  /** Which provider produced the live results, for attribution. */
  providerId: NearbyPlacesProvider['id'] | null;
  /** Providers that failed, so the UI can say the results are degraded. */
  failures: { providerId: NearbyPlacesProvider['id']; message: string }[];
  refetch: () => void;
}

/**
 * ~1 km, so ordinary GPS jitter does not re-run the query.
 *
 * Matches the rounding the providers apply to the outgoing request, so the key
 * changes exactly when the request would.
 */
function roundForKey(value: number): number {
  return Math.round(value * 100) / 100;
}

export function useNearbyPlaces(
  centre: Coordinates | null,
  categories: readonly NearbyPlaceCategory[],
): UseNearbyPlacesResult {
  const [cached, setCached] = useState<{
    places: RankedNearbyPlace[];
    cachedAt: number;
    stale: boolean;
  } | null>(null);

  // Sorted so that ['hospital','police'] and ['police','hospital'] are one key
  // rather than two identical requests.
  const categoryKey = useMemo(() => [...categories].sort().join(','), [categories]);

  const key =
    centre === null
      ? null
      : ([roundForKey(centre.latitude), roundForKey(centre.longitude), categoryKey] as const);

  const query = useQuery({
    queryKey: ['nearbyPlaces', key],
    enabled: centre !== null && categories.length > 0,
    staleTime: STALE_TIME_MS,
    // Public endpoints rate-limit, and hammering one after a failure is how an
    // app's whole traffic gets blocked. One retry, then fall back to the cache.
    retry: 1,
    queryFn: async ({ signal }) => {
      if (centre === null) {
        return { places: [], providerId: null, failures: [] };
      }

      const result = await fetchNearbyPlaces({
        centre,
        radiusM: NEARBY_SEARCH_RADIUS_M,
        categories,
        signal,
      });

      // Written on every success, so the offline copy tracks what was last seen.
      // Not awaited: a disk write must not delay the list appearing.
      if (result.places.length > 0) {
        void saveNearbyPlaces(result.places, centre);
      }

      return result;
    },
  });

  // Read the cache alongside the request rather than only after it fails, so a
  // user on a dead connection sees something immediately instead of watching a
  // spinner run to its timeout first.
  useEffect(() => {
    if (centre === null) {
      return;
    }
    let cancelled = false;

    void (async () => {
      const result = await loadNearbyPlaces(centre);
      if (cancelled || result === null) {
        return;
      }
      setCached({
        places: rankNearbyPlaces({
          places: result.places,
          centre,
          radiusM: NEARBY_SEARCH_RADIUS_M,
        }),
        cachedAt: result.cachedAt,
        stale: result.stale,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [centre]);

  const networkPlaces = query.data?.places;

  const cachedPlaces = cached?.places;

  /**
   * The list to render.
   *
   * Ranking and category filtering are one memo rather than two. Splitting them
   * meant the intermediate array was rebuilt on every render and the filter memo
   * never hit — which the React Compiler lint rule correctly flagged. Filtering
   * here rather than in the query is deliberate: switching category then reuses
   * a result set that already covers it instead of discarding it and refetching.
   */
  const { places, isFromCache } = useMemo(() => {
    if (centre === null) {
      return { places: [] as RankedNearbyPlace[], isFromCache: false };
    }

    // Branched rather than sharing one variable: the network list is unranked
    // and the cached one was ranked by the effect that loaded it, so they are
    // genuinely different types at this point.
    const ranked =
      networkPlaces !== undefined
        ? rankNearbyPlaces({ places: networkPlaces, centre, radiusM: NEARBY_SEARCH_RADIUS_M })
        : cachedPlaces;

    if (ranked === undefined) {
      return { places: [] as RankedNearbyPlace[], isFromCache: false };
    }

    return {
      places: ranked.filter((place) => categories.includes(place.category)),
      isFromCache: networkPlaces === undefined,
    };
  }, [cachedPlaces, categories, centre, networkPlaces]);

  return {
    places,
    // Not "loading" while cached results are on screen — a spinner over real
    // content is noise, and this screen may be read in a hurry.
    loading: query.isLoading && !isFromCache,
    error: query.error === null ? null : toAppError(query.error),
    isFromCache,
    cachedAt: isFromCache ? (cached?.cachedAt ?? null) : null,
    isStale: isFromCache && (cached?.stale ?? false),
    providerId: query.data?.providerId ?? null,
    failures: query.data?.failures ?? [],
    refetch: () => {
      void query.refetch();
    },
  };
}
