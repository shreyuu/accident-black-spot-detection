import { getDocs } from 'firebase/firestore';

import { fetchNearbyBlackSpots } from '@/features/black-spots/blackSpotRepository';
import { AppError } from '@/utils/errors';

jest.mock('@/services/firebase/app', () => ({
  getFirebaseFirestore: () => ({}),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  startAt: jest.fn(() => ({})),
  endAt: jest.fn(() => ({})),
  getDocs: jest.fn(),
}));

const mockedGetDocs = jest.mocked(getDocs);

const CENTRE = { latitude: 51.5074, longitude: -0.1278 };

interface FakeDocument {
  id: string;
  data: () => Record<string, unknown>;
}

function validDocument(id: string, overrides: Record<string, unknown> = {}): FakeDocument {
  return {
    id,
    data: () => ({
      name: `Spot ${id}`,
      category: 'accident',
      latitude: 51.5074,
      longitude: -0.1278,
      geohash: 'gcpvj0duq5',
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
      ...overrides,
    }),
  };
}

/** Build a snapshot as `getDocs` returns one, including the cache metadata. */
function snapshot(docs: FakeDocument[], fromCache = false) {
  return { docs, metadata: { fromCache, hasPendingWrites: false } };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchNearbyBlackSpots', () => {
  it('returns spots with their exact distances, nearest first', async () => {
    mockedGetDocs.mockResolvedValue(
      snapshot([
        validDocument('far', { latitude: 51.52, longitude: -0.1278 }),
        validDocument('near'),
      ]) as never,
    );

    const result = await fetchNearbyBlackSpots(CENTRE);

    expect(result.map((entry) => entry.spot.id)).toEqual(['near', 'far']);
    expect(result[0]?.distanceM).toBeLessThan(result[1]?.distanceM ?? 0);
  });

  it('de-duplicates documents returned by more than one geohash bound', async () => {
    mockedGetDocs.mockResolvedValue(snapshot([validDocument('a'), validDocument('a')]) as never);

    const result = await fetchNearbyBlackSpots(CENTRE);

    expect(result).toHaveLength(1);
  });

  /**
   * Geohash cells are rectangles, so the query bounds overhang the requested
   * circle. Without this refinement the app would warn about places outside the
   * radius the user asked for.
   */
  it('discards results outside the requested radius', async () => {
    mockedGetDocs.mockResolvedValue(
      snapshot([validDocument('inside'), validDocument('outside', { latitude: 51.9 })]) as never,
    );

    const result = await fetchNearbyBlackSpots(CENTRE, 1000);

    expect(result.map((entry) => entry.spot.id)).toEqual(['inside']);
  });

  /**
   * Defence in depth. The security rules and the query both exclude these, but a
   * record that is not verified and active must never reach the alert engine.
   */
  it.each([
    ['unverified', { verified: false }],
    ['inactive', { active: false }],
  ])('discards a %s record even if the query somehow returned it', async (_label, overrides) => {
    const warned = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockedGetDocs.mockResolvedValue(
      snapshot([validDocument('good'), validDocument('bad', overrides)]) as never,
    );

    const result = await fetchNearbyBlackSpots(CENTRE);

    expect(result.map((entry) => entry.spot.id)).toEqual(['good']);
    warned.mockRestore();
  });

  it('skips a malformed document rather than failing the whole batch', async () => {
    const warned = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockedGetDocs.mockResolvedValue(
      snapshot([
        validDocument('good'),
        { id: 'broken', data: () => ({ name: 'missing everything else' }) },
      ]) as never,
    );

    const result = await fetchNearbyBlackSpots(CENTRE);

    // One bad record must not blank the map.
    expect(result.map((entry) => entry.spot.id)).toEqual(['good']);
    warned.mockRestore();
  });

  /**
   * The most important behaviour in this file.
   *
   * `getDocs` does not reject when the device is offline — it resolves from
   * Firestore's own local cache, which on a fresh install is empty. Without the
   * `fromCache` check the caller would receive an ordinary empty result and the
   * UI would say "No black spots recorded nearby", which reads as "this area is
   * clear". "No warnings here" and "could not check" must never look the same.
   */
  it('reports a network failure when every bound was served from the local cache', async () => {
    mockedGetDocs.mockResolvedValue(snapshot([], true) as never);

    await expect(fetchNearbyBlackSpots(CENTRE)).rejects.toMatchObject({
      kind: 'network',
      retryable: true,
    });
    await expect(fetchNearbyBlackSpots(CENTRE)).rejects.toBeInstanceOf(AppError);
  });

  it('accepts a genuinely empty result that did reach the server', async () => {
    mockedGetDocs.mockResolvedValue(snapshot([], false) as never);

    // An area with no recorded black spots is a legitimate answer, and must not
    // be mistaken for being offline.
    await expect(fetchNearbyBlackSpots(CENTRE)).resolves.toEqual([]);
  });
});
