import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  NEARBY_CACHE_MAX_DISTANCE_M,
  NEARBY_CACHE_STALE_AFTER_MS,
  clearNearbyPlaces,
  loadNearbyPlaces,
  saveNearbyPlaces,
} from '@/features/nearby-places/nearbyPlaceCache';
import type { NearbyPlace } from '@/features/nearby-places/nearbyPlaceTypes';
import { destinationPoint, type Coordinates } from '@/utils/geo';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const storage = jest.mocked(AsyncStorage);
const LONDON: Coordinates = { latitude: 51.5074, longitude: -0.1278 };

function place(overrides: Partial<NearbyPlace> = {}): NearbyPlace {
  return {
    id: 'osm:node:1',
    name: 'General Hospital',
    category: 'hospital',
    latitude: 51.5074,
    longitude: -0.1278,
    source: 'openstreetmap',
    ...overrides,
  };
}

/** Whatever `saveNearbyPlaces` most recently wrote. */
function writtenPayload(): string {
  const call = storage.setItem.mock.calls.at(-1);
  return call?.[1] ?? '';
}

beforeEach(() => {
  jest.clearAllMocks();
  storage.setItem.mockResolvedValue();
  storage.removeItem.mockResolvedValue();
});

describe('saveNearbyPlaces', () => {
  it('rounds the stored centre so an exact position is never written to disk', async () => {
    await saveNearbyPlaces([place()], { latitude: 51.50739123, longitude: -0.12783456 });

    const stored = JSON.parse(writtenPayload()) as { centre: Coordinates };
    expect(stored.centre).toEqual({ latitude: 51.51, longitude: -0.13 });
  });

  it('caps how many records are kept', async () => {
    const many = Array.from({ length: 200 }, (_unused, index) =>
      place({ id: `osm:node:${index}` }),
    );

    await saveNearbyPlaces(many, LONDON);

    const stored = JSON.parse(writtenPayload()) as { places: unknown[] };
    expect(stored.places.length).toBeLessThanOrEqual(60);
  });

  it('never throws when storage fails', async () => {
    storage.setItem.mockRejectedValue(new Error('disk full'));

    await expect(saveNearbyPlaces([place()], LONDON)).resolves.toBeUndefined();
  });
});

describe('loadNearbyPlaces', () => {
  /** Put a payload on disk as `saveNearbyPlaces` would have written it. */
  function seed(options: {
    places?: unknown[];
    cachedAt?: number;
    centre?: Coordinates;
    version?: number;
  }): void {
    storage.getItem.mockResolvedValue(
      JSON.stringify({
        version: options.version ?? 1,
        cachedAt: options.cachedAt ?? Date.now(),
        centre: options.centre ?? LONDON,
        places: options.places ?? [place()],
      }),
    );
  }

  it('returns nothing when there is no cache', async () => {
    storage.getItem.mockResolvedValue(null);

    expect(await loadNearbyPlaces(LONDON)).toBeNull();
  });

  it('reads back what was written', async () => {
    seed({});

    const result = await loadNearbyPlaces(LONDON);

    expect(result?.places).toHaveLength(1);
    expect(result?.places[0]?.name).toBe('General Hospital');
  });

  it('re-labels every record as coming from the cache', async () => {
    // The screen has to be able to say "saved on this device" rather than
    // implying it just heard this from the provider.
    seed({ places: [place({ source: 'openstreetmap' })] });

    expect((await loadNearbyPlaces(LONDON))?.places[0]?.source).toBe('cache');
  });

  it('flags data older than the staleness window without discarding it', async () => {
    seed({ cachedAt: Date.now() - NEARBY_CACHE_STALE_AFTER_MS - 1 });

    const result = await loadNearbyPlaces(LONDON);

    // Old hospital data is still hospital data — this is the last line of
    // defence when every provider is unreachable.
    expect(result?.places).toHaveLength(1);
    expect(result?.stale).toBe(true);
  });

  it('does not flag fresh data as stale', async () => {
    seed({ cachedAt: Date.now() - 1000 });

    expect((await loadNearbyPlaces(LONDON))?.stale).toBe(false);
  });

  it('refuses a cache built too far away', async () => {
    const farAway = destinationPoint(LONDON, 90, NEARBY_CACHE_MAX_DISTANCE_M + 5000);
    seed({ centre: farAway });

    expect(await loadNearbyPlaces(LONDON)).toBeNull();
  });

  it('serves a cache built within range', async () => {
    const nearby = destinationPoint(LONDON, 90, NEARBY_CACHE_MAX_DISTANCE_M / 2);
    seed({ centre: nearby });

    expect(await loadNearbyPlaces(LONDON)).not.toBeNull();
  });

  it('skips malformed records but keeps the good ones', async () => {
    seed({
      places: [
        place({ id: 'good' }),
        { ...place(), latitude: 'not a number' },
        { ...place({ id: 'bad-category' }), category: 'restaurant' },
        { ...place({ id: 'no-name' }), name: '' },
        null,
      ],
    });

    const result = await loadNearbyPlaces(LONDON);

    expect(result?.places.map((entry) => entry.id)).toEqual(['good']);
  });

  it('returns nothing when no record survives validation', async () => {
    seed({ places: [{ nonsense: true }] });

    expect(await loadNearbyPlaces(LONDON)).toBeNull();
  });

  it('discards an unrecognised schema version', async () => {
    seed({ version: 99 });

    expect(await loadNearbyPlaces(LONDON)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalled();
  });

  it('survives an unparseable payload', async () => {
    storage.getItem.mockResolvedValue('{ not json');

    expect(await loadNearbyPlaces(LONDON)).toBeNull();
  });

  it('preserves the optional fields that are present', async () => {
    seed({ places: [place({ phone: '101', address: '1 High St', alwaysOpen: true })] });

    expect((await loadNearbyPlaces(LONDON))?.places[0]).toMatchObject({
      phone: '101',
      address: '1 High St',
      alwaysOpen: true,
    });
  });

  it('omits absent optional fields rather than storing them as undefined', async () => {
    seed({ places: [place()] });

    const restored = (await loadNearbyPlaces(LONDON))?.places[0];

    expect(Object.keys(restored ?? {})).not.toEqual(
      expect.arrayContaining(['phone', 'address', 'alwaysOpen']),
    );
  });
});

describe('clearNearbyPlaces', () => {
  it('removes the cache', async () => {
    await clearNearbyPlaces();

    expect(storage.removeItem).toHaveBeenCalled();
  });

  it('never throws', async () => {
    storage.removeItem.mockRejectedValue(new Error('nope'));

    await expect(clearNearbyPlaces()).resolves.toBeUndefined();
  });
});
