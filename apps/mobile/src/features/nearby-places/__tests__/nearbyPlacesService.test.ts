import type {
  NearbyPlace,
  NearbyPlacesProvider,
  NearbyPlacesQuery,
} from '@/features/nearby-places/nearbyPlaceTypes';
import {
  fetchNearbyPlaces,
  resolveProviderChain,
} from '@/features/nearby-places/nearbyPlacesService';
import { AppError } from '@/utils/errors';

// The real providers reach `env` and `fetch`; neither is under test here. What
// is under test is the chaining behaviour, so the providers are stubs.
jest.mock('@/features/nearby-places/googlePlacesProvider', () => ({
  googlePlacesProvider: { id: 'google-places', label: 'Google', isAvailable: () => false },
}));
jest.mock('@/features/nearby-places/overpassProvider', () => ({
  overpassProvider: { id: 'openstreetmap', label: 'OpenStreetMap', isAvailable: () => true },
}));

const QUERY: NearbyPlacesQuery = {
  centre: { latitude: 51.5074, longitude: -0.1278 },
  radiusM: 5000,
  categories: ['hospital'],
};

function place(id: string): NearbyPlace {
  return {
    id,
    name: `Place ${id}`,
    category: 'hospital',
    latitude: 51.5074,
    longitude: -0.1278,
    source: 'openstreetmap',
  };
}

function provider(
  id: NearbyPlacesProvider['id'],
  search: NearbyPlacesProvider['search'],
  isAvailable = true,
): NearbyPlacesProvider {
  return { id, label: id, isAvailable: () => isAvailable, search };
}

const succeeds = (...ids: string[]) => jest.fn(async () => ids.map(place));
const fails = (message = 'provider down') =>
  jest.fn(async () => {
    throw new AppError('network', message);
  });

describe('resolveProviderChain', () => {
  it('drops providers that are not configured', () => {
    const chain = resolveProviderChain([
      provider('google-places', succeeds(), false),
      provider('openstreetmap', succeeds(), true),
    ]);

    expect(chain.map((entry) => entry.id)).toEqual(['openstreetmap']);
  });

  it('defaults to OpenStreetMap alone when no Places key is configured', () => {
    // The shipped configuration. Google is mocked as unavailable above.
    expect(resolveProviderChain().map((entry) => entry.id)).toEqual(['openstreetmap']);
  });
});

describe('fetchNearbyPlaces', () => {
  it('returns results from the first provider that works', async () => {
    const first = succeeds('a', 'b');
    const second = succeeds('c');

    const result = await fetchNearbyPlaces(QUERY, [
      provider('google-places', first),
      provider('openstreetmap', second),
    ]);

    expect(result.places.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(result.providerId).toBe('google-places');
    expect(second).not.toHaveBeenCalled();
  });

  describe('when a provider fails', () => {
    it('falls back to the next one', async () => {
      const result = await fetchNearbyPlaces(QUERY, [
        provider('google-places', fails()),
        provider('openstreetmap', succeeds('fallback')),
      ]);

      expect(result.places.map((entry) => entry.id)).toEqual(['fallback']);
      expect(result.providerId).toBe('openstreetmap');
    });

    it('reports which providers failed, so the UI can be honest about it', async () => {
      const result = await fetchNearbyPlaces(QUERY, [
        provider('google-places', fails('rate limited')),
        provider('openstreetmap', succeeds('ok')),
      ]);

      expect(result.failures).toEqual([{ providerId: 'google-places', message: 'rate limited' }]);
    });

    it('throws the last failure when every provider fails', async () => {
      await expect(
        fetchNearbyPlaces(QUERY, [
          provider('google-places', fails('first failure')),
          provider('openstreetmap', fails('last failure')),
        ]),
      ).rejects.toMatchObject({ userMessage: 'last failure' });
    });

    it('tries every provider before giving up', async () => {
      const first = fails();
      const second = fails();

      await expect(
        fetchNearbyPlaces(QUERY, [
          provider('google-places', first),
          provider('openstreetmap', second),
        ]),
      ).rejects.toBeInstanceOf(AppError);

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });
  });

  it('treats an empty result as a real answer, not a reason to try the next provider', async () => {
    // "No hospital within 5 km" is genuine information. Falling through would
    // make an honest empty state look like a failure and cost a second request.
    const second = succeeds('unwanted');

    const result = await fetchNearbyPlaces(QUERY, [
      provider('google-places', succeeds()),
      provider('openstreetmap', second),
    ]);

    expect(result.places).toEqual([]);
    expect(result.providerId).toBe('google-places');
    expect(second).not.toHaveBeenCalled();
  });

  describe('cancellation', () => {
    it('rethrows an abort without trying the next provider', async () => {
      const controller = new AbortController();
      controller.abort();
      const second = succeeds('should-not-run');

      await expect(
        fetchNearbyPlaces({ ...QUERY, signal: controller.signal }, [
          provider('google-places', fails('aborted mid-flight')),
          provider('openstreetmap', second),
        ]),
      ).rejects.toBeDefined();

      expect(second).not.toHaveBeenCalled();
    });

    it('recognises a DOMException-style AbortError even without a signal', async () => {
      const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' });
      const second = succeeds('should-not-run');

      await expect(
        fetchNearbyPlaces(QUERY, [
          provider(
            'google-places',
            jest.fn(async () => {
              throw abortError;
            }),
          ),
          provider('openstreetmap', second),
        ]),
      ).rejects.toBe(abortError);

      expect(second).not.toHaveBeenCalled();
    });
  });

  it('does no work when no categories are requested', async () => {
    const search = succeeds('a');

    const result = await fetchNearbyPlaces({ ...QUERY, categories: [] }, [
      provider('openstreetmap', search),
    ]);

    expect(result.places).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it('fails clearly when nothing is configured at all', async () => {
    await expect(fetchNearbyPlaces(QUERY, [])).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
