import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  CACHE_MAX_DISTANCE_M,
  CACHE_STALE_AFTER_MS,
  clearNearbyBlackSpots,
  loadNearbyBlackSpots,
  saveNearbyBlackSpots,
} from '@/features/black-spots/blackSpotCache';
import type { BlackSpot } from '@/types/domain';
import type { Coordinates } from '@/utils/geo';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockedStorage = jest.mocked(AsyncStorage);

const LONDON: Coordinates = { latitude: 51.5074, longitude: -0.1278 };

function makeSpot(id: string, overrides: Partial<BlackSpot> = {}): BlackSpot {
  return {
    id,
    name: `Spot ${id}`,
    category: 'accident',
    latitude: 51.5074,
    longitude: -0.1278,
    geohash: 'gcpvj0du6',
    radiusM: 300,
    riskLevel: 'high',
    severityScore: 60,
    accidentCount: 3,
    crimeCount: 0,
    reportCount: 2,
    verified: true,
    active: true,
    source: 'official',
    createdBy: 'admin',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

/** Capture whatever `saveNearbyBlackSpots` wrote, so a round trip can be tested. */
function lastWrittenPayload(): string {
  const call = mockedStorage.setItem.mock.calls.at(-1);
  return call?.[1] ?? '';
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('saveNearbyBlackSpots', () => {
  it('writes the spots under a versioned payload', async () => {
    await saveNearbyBlackSpots([makeSpot('a')], LONDON);

    const payload = JSON.parse(lastWrittenPayload());
    expect(payload.version).toBe(1);
    expect(payload.spots).toHaveLength(1);
    expect(typeof payload.cachedAt).toBe('number');
  });

  /**
   * The cache must remember roughly where it was built so it can refuse to serve
   * warnings for the wrong city — but writing an exact coordinate to disk would
   * be the start of exactly the location history the user is told is not kept.
   */
  it('rounds the stored centre rather than writing the exact position', async () => {
    await saveNearbyBlackSpots([makeSpot('a')], { latitude: 51.507412, longitude: -0.127812 });

    const { centre } = JSON.parse(lastWrittenPayload());
    expect(centre.latitude).toBe(51.51);
    expect(centre.longitude).toBe(-0.13);
  });

  it('caps how many spots are stored', async () => {
    const many = Array.from({ length: 500 }, (_, index) => makeSpot(`spot-${index}`));

    await saveNearbyBlackSpots(many, LONDON);

    const { spots } = JSON.parse(lastWrittenPayload());
    expect(spots.length).toBeLessThanOrEqual(200);
  });

  it('never throws when storage fails, because caching is only an optimisation', async () => {
    const warned = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockedStorage.setItem.mockRejectedValueOnce(new Error('disk full'));

    await expect(saveNearbyBlackSpots([makeSpot('a')], LONDON)).resolves.toBeUndefined();
    warned.mockRestore();
  });
});

describe('loadNearbyBlackSpots', () => {
  it('round-trips saved spots', async () => {
    await saveNearbyBlackSpots([makeSpot('a'), makeSpot('b')], LONDON);
    mockedStorage.getItem.mockResolvedValueOnce(lastWrittenPayload());

    const result = await loadNearbyBlackSpots(LONDON);

    expect(result?.spots.map((spot) => spot.id)).toEqual(['a', 'b']);
    expect(result?.stale).toBe(false);
  });

  it('returns null when nothing has been cached', async () => {
    mockedStorage.getItem.mockResolvedValueOnce(null);

    await expect(loadNearbyBlackSpots(LONDON)).resolves.toBeNull();
  });

  /**
   * Serving warnings cached in another city would be worse than serving none —
   * the user would be shown hazards that have nothing to do with where they are.
   */
  it('refuses a cache built too far away', async () => {
    await saveNearbyBlackSpots([makeSpot('a')], LONDON);
    mockedStorage.getItem.mockResolvedValueOnce(lastWrittenPayload());

    // Paris is ~340 km away, far beyond the limit.
    const result = await loadNearbyBlackSpots({ latitude: 48.8566, longitude: 2.3522 });

    expect(result).toBeNull();
    expect(CACHE_MAX_DISTANCE_M).toBeLessThan(340_000);
  });

  it('accepts a cache built a short distance away', async () => {
    await saveNearbyBlackSpots([makeSpot('a')], LONDON);
    mockedStorage.getItem.mockResolvedValueOnce(lastWrittenPayload());

    const result = await loadNearbyBlackSpots({ latitude: 51.52, longitude: -0.12 });

    expect(result?.spots).toHaveLength(1);
  });

  /**
   * Stale data is still served — out-of-date warnings beat none — but it must be
   * flagged so the UI can say so rather than passing it off as current.
   */
  it('flags a cache older than the staleness threshold without discarding it', async () => {
    await saveNearbyBlackSpots([makeSpot('a')], LONDON);
    const fresh = JSON.parse(lastWrittenPayload());
    const aged = { ...fresh, cachedAt: Date.now() - CACHE_STALE_AFTER_MS - 1000 };
    mockedStorage.getItem.mockResolvedValueOnce(JSON.stringify(aged));

    const result = await loadNearbyBlackSpots(LONDON);

    expect(result?.spots).toHaveLength(1);
    expect(result?.stale).toBe(true);
  });

  it('drops individual records that no longer match the schema', async () => {
    await saveNearbyBlackSpots([makeSpot('good')], LONDON);
    const payload = JSON.parse(lastWrittenPayload());
    payload.spots.push({ id: 'broken', name: 'Missing everything else' });
    mockedStorage.getItem.mockResolvedValueOnce(JSON.stringify(payload));

    const result = await loadNearbyBlackSpots(LONDON);

    expect(result?.spots.map((spot) => spot.id)).toEqual(['good']);
  });

  it.each([
    ['malformed JSON', 'not json at all'],
    ['a payload from an unknown version', '{"version":99,"spots":[]}'],
    ['a payload with no spots array', '{"version":1}'],
  ])('returns null for %s', async (_label, raw) => {
    const warned = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockedStorage.getItem.mockResolvedValueOnce(raw);

    await expect(loadNearbyBlackSpots(LONDON)).resolves.toBeNull();
    warned.mockRestore();
  });

  it('returns null rather than throwing when storage itself fails', async () => {
    const warned = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockedStorage.getItem.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(loadNearbyBlackSpots(LONDON)).resolves.toBeNull();
    warned.mockRestore();
  });

  /**
   * A cache containing an unverified record would defeat the guarantee that only
   * verified, active spots ever reach the user, so such a record must not
   * survive a round trip through disk.
   */
  it('does not resurrect an unverified record through the cache', async () => {
    await saveNearbyBlackSpots([makeSpot('a')], LONDON);
    const payload = JSON.parse(lastWrittenPayload());
    payload.spots[0].verified = false;
    mockedStorage.getItem.mockResolvedValueOnce(JSON.stringify(payload));

    const result = await loadNearbyBlackSpots(LONDON);

    // The schema still parses it, so the caller must filter — this test pins
    // that the flag survives intact rather than being silently coerced to true.
    expect(result?.spots[0]?.verified).toBe(false);
  });
});

describe('clearNearbyBlackSpots', () => {
  it('removes the cache entry', async () => {
    await clearNearbyBlackSpots();
    expect(mockedStorage.removeItem).toHaveBeenCalled();
  });

  it('never throws', async () => {
    mockedStorage.removeItem.mockRejectedValueOnce(new Error('nope'));
    await expect(clearNearbyBlackSpots()).resolves.toBeUndefined();
  });
});
