import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  CACHE_STALE_AFTER_MS,
  loadNearbyBlackSpots,
  saveNearbyBlackSpots,
} from '@/features/black-spots/blackSpotCache';
import {
  fetchNearbyBlackSpots,
  NEARBY_QUERY_RADIUS_M,
} from '@/features/black-spots/blackSpotRepository';
import type { BlackSpot } from '@/types/domain';
import { toAppError, type AppError } from '@/utils/errors';
import type { Coordinates } from '@/utils/geo';

/**
 * Verified, active black spots near the user, with an offline fallback.
 *
 * The query key is rounded to roughly 1 km so that ordinary GPS jitter does not
 * trigger a refetch on every position update — that would spend Firestore reads
 * and battery for results that are identical.
 *
 * Two sources are combined:
 *   - the network result, which is authoritative;
 *   - the cache, used only when the network has produced nothing this session.
 *
 * `isFromCache` and `cachedAt` are surfaced so the UI can say the data is old
 * rather than presenting stale warnings as current — a warning the user believes
 * is live but is a day out of date is worse than an honestly-labelled one.
 */

export interface UseNearbyBlackSpotsResult {
  spots: BlackSpot[];
  loading: boolean;
  error: AppError | null;
  /** True when showing cached data because the network is unavailable. */
  isFromCache: boolean;
  /** Epoch ms the cache was written, when serving from cache. */
  cachedAt: number | null;
  /** True when the cached data is older than the staleness threshold. */
  isStale: boolean;
  refetch: () => void;
}

/** ~1 km, matching the granularity at which results meaningfully change. */
function roundForKey(value: number): number {
  return Math.round(value * 100) / 100;
}

export function useNearbyBlackSpots(centre: Coordinates | null): UseNearbyBlackSpotsResult {
  const [cached, setCached] = useState<{
    spots: BlackSpot[];
    cachedAt: number;
    stale: boolean;
  } | null>(null);

  const key =
    centre === null
      ? null
      : ([roundForKey(centre.latitude), roundForKey(centre.longitude)] as const);

  const query = useQuery({
    queryKey: ['blackSpots', 'nearby', key],
    enabled: centre !== null,
    queryFn: async () => {
      if (centre === null) {
        return [];
      }
      const nearby = await fetchNearbyBlackSpots(centre, NEARBY_QUERY_RADIUS_M);
      const spots = nearby.map((entry) => entry.spot);

      // Written on every successful fetch so the offline copy tracks reality.
      void saveNearbyBlackSpots(spots, centre);

      return spots;
    },
  });

  // Load the cache once a centre is known, so something can be shown while the
  // first network request is still in flight or if it fails outright.
  useEffect(() => {
    if (centre === null) {
      return;
    }
    let cancelled = false;

    void (async () => {
      const result = await loadNearbyBlackSpots(centre);
      if (!cancelled && result !== null) {
        setCached({ spots: result.spots, cachedAt: result.cachedAt, stale: result.stale });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [centre]);

  const networkSpots = query.data;
  const hasNetworkData = networkSpots !== undefined;

  const spots = hasNetworkData ? networkSpots : (cached?.spots ?? []);
  const isFromCache = !hasNetworkData && cached !== null;

  return {
    spots,
    // Not "loading" while cached data is on screen — the user has something to
    // look at, and a spinner over real content is just noise.
    loading: query.isLoading && !isFromCache,
    error: query.error === null ? null : toAppError(query.error),
    isFromCache,
    cachedAt: isFromCache ? (cached?.cachedAt ?? null) : null,
    isStale: isFromCache && (cached?.stale ?? false),
    refetch: () => {
      void query.refetch();
    },
  };
}

export { CACHE_STALE_AFTER_MS };
