import {
  DUPLICATE_RADIUS_M,
  MAX_RANKED_RESULTS,
  groupByCategory,
  normaliseName,
  rankNearbyPlaces,
} from '@/features/nearby-places/nearbyPlaceRanking';
import type { NearbyPlace } from '@/features/nearby-places/nearbyPlaceTypes';
import { destinationPoint, type Coordinates } from '@/utils/geo';

const CENTRE: Coordinates = { latitude: 51.5074, longitude: -0.1278 };

/** A place `distanceM` due north of the centre, so distances are exact by construction. */
function placeAt(id: string, distanceM: number, overrides: Partial<NearbyPlace> = {}): NearbyPlace {
  // Due north (bearing 0), so the reported distance is exactly `distanceM`.
  const point = destinationPoint(CENTRE, 0, distanceM);
  return {
    id,
    name: `Place ${id}`,
    category: 'hospital',
    latitude: point.latitude,
    longitude: point.longitude,
    source: 'openstreetmap',
    ...overrides,
  };
}

describe('normaliseName', () => {
  it.each([
    ["St Mary's Hospital", 'st marys hospital'],
    ['ST. MARY’S HOSPITAL', 'st marys hospital'],
    ['  Royal   London  ', 'royal london'],
  ])('normalises %s', (input, expected) => {
    expect(normaliseName(input)).toBe(expected);
  });

  it('collapses every apostrophe spelling onto the same name', () => {
    // The three forms volunteers actually type. If these diverged, the same
    // hospital entered twice would survive de-duplication as two rows.
    const forms = ["St Mary's Hospital", 'St Mary’s Hospital', 'St Marys Hospital'];

    expect(new Set(forms.map(normaliseName)).size).toBe(1);
  });

  it('strips accents so the same name spelled either way matches', () => {
    expect(normaliseName('Hôpital Saint-Louis')).toBe(normaliseName('Hopital Saint Louis'));
  });

  it('reduces a name with no letters or digits to nothing', () => {
    expect(normaliseName('---')).toBe('');
  });
});

describe('rankNearbyPlaces', () => {
  it('sorts nearest first', () => {
    const ranked = rankNearbyPlaces({
      places: [placeAt('far', 900), placeAt('near', 100), placeAt('mid', 500)],
      centre: CENTRE,
      radiusM: 5000,
    });

    expect(ranked.map((place) => place.id)).toEqual(['near', 'mid', 'far']);
  });

  it('annotates each result with its distance', () => {
    const [ranked] = rankNearbyPlaces({
      places: [placeAt('a', 250)],
      centre: CENTRE,
      radiusM: 5000,
    });

    expect(ranked?.distanceM).toBeCloseTo(250, 0);
  });

  it('drops anything beyond the radius, whatever the provider returned', () => {
    const ranked = rankNearbyPlaces({
      places: [placeAt('inside', 900), placeAt('outside', 1100)],
      centre: CENTRE,
      radiusM: 1000,
    });

    expect(ranked.map((place) => place.id)).toEqual(['inside']);
  });

  it('drops a record with an unusable position rather than sorting on NaN', () => {
    const ranked = rankNearbyPlaces({
      places: [
        placeAt('good', 100),
        { ...placeAt('nan', 200), latitude: Number.NaN },
        { ...placeAt('out-of-range', 300), latitude: 120 },
      ],
      centre: CENTRE,
      radiusM: 5000,
    });

    expect(ranked.map((place) => place.id)).toEqual(['good']);
  });

  it('returns nothing when the centre itself is unusable', () => {
    expect(
      rankNearbyPlaces({
        places: [placeAt('a', 100)],
        centre: { latitude: Number.NaN, longitude: 0 },
        radiusM: 5000,
      }),
    ).toEqual([]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: MAX_RANKED_RESULTS + 15 }, (_unused, index) =>
      placeAt(`spot-${index}`, 100 + index * 10, { name: `Distinct name ${index}` }),
    );

    expect(rankNearbyPlaces({ places: many, centre: CENTRE, radiusM: 50_000 })).toHaveLength(
      MAX_RANKED_RESULTS,
    );
  });

  it('honours an explicit limit', () => {
    const ranked = rankNearbyPlaces({
      places: [placeAt('a', 100), placeAt('b', 200, { name: 'Other' })],
      centre: CENTRE,
      radiusM: 5000,
      limit: 1,
    });

    expect(ranked).toHaveLength(1);
  });

  describe('duplicate merging', () => {
    it('merges the same facility mapped twice at almost the same point', () => {
      const ranked = rankNearbyPlaces({
        places: [
          placeAt('node', 300, { name: "St Mary's Hospital" }),
          placeAt('way', 340, { name: "ST MARY'S HOSPITAL" }),
        ],
        centre: CENTRE,
        radiusM: 5000,
      });

      expect(ranked).toHaveLength(1);
    });

    it('merges when one name contains the other', () => {
      const ranked = rankNearbyPlaces({
        places: [
          placeAt('short', 300, { name: "St Mary's" }),
          placeAt('long', 320, { name: "St Mary's Hospital" }),
        ],
        centre: CENTRE,
        radiusM: 5000,
      });

      expect(ranked).toHaveLength(1);
    });

    it('keeps two facilities with the same name that are genuinely far apart', () => {
      const ranked = rankNearbyPlaces({
        places: [
          placeAt('branch-a', 300, { name: 'City Police' }),
          placeAt('branch-b', 300 + DUPLICATE_RADIUS_M * 4, { name: 'City Police' }),
        ],
        centre: CENTRE,
        radiusM: 5000,
      });

      expect(ranked).toHaveLength(2);
    });

    it('never merges across categories, even at the same address', () => {
      const ranked = rankNearbyPlaces({
        places: [
          placeAt('h', 300, { name: 'Civic Centre', category: 'hospital' }),
          placeAt('p', 305, { name: 'Civic Centre', category: 'police' }),
        ],
        centre: CENTRE,
        radiusM: 5000,
      });

      expect(ranked).toHaveLength(2);
    });

    it('keeps the richer record when merging', () => {
      const ranked = rankNearbyPlaces({
        places: [
          placeAt('bare', 300, { name: 'General Hospital' }),
          placeAt('rich', 320, {
            name: 'General Hospital',
            phone: '+44 20 7188 7188',
            address: '1 High Street',
          }),
        ],
        centre: CENTRE,
        radiusM: 5000,
      });

      expect(ranked).toHaveLength(1);
      expect(ranked[0]?.id).toBe('rich');
    });

    it('falls back to the nearer record when both are equally detailed', () => {
      const ranked = rankNearbyPlaces({
        places: [
          placeAt('further', 340, { name: 'General Hospital' }),
          placeAt('nearer', 300, { name: 'General Hospital' }),
        ],
        centre: CENTRE,
        radiusM: 5000,
      });

      expect(ranked[0]?.id).toBe('nearer');
    });

    it('does not merge unnamed records, which cannot be compared by name', () => {
      const ranked = rankNearbyPlaces({
        places: [placeAt('a', 300, { name: '' }), placeAt('b', 310, { name: '' })],
        centre: CENTRE,
        radiusM: 5000,
      });

      expect(ranked).toHaveLength(2);
    });

    it('merges a cached copy with a freshly fetched one', () => {
      const ranked = rankNearbyPlaces({
        places: [
          placeAt('live', 300, { name: 'General Hospital', source: 'openstreetmap' }),
          placeAt('cached', 300, { name: 'General Hospital', source: 'cache' }),
        ],
        centre: CENTRE,
        radiusM: 5000,
      });

      expect(ranked).toHaveLength(1);
    });
  });

  it('returns an empty list for no input', () => {
    expect(rankNearbyPlaces({ places: [], centre: CENTRE, radiusM: 5000 })).toEqual([]);
  });
});

describe('groupByCategory', () => {
  it('groups while preserving nearest-first order', () => {
    const ranked = rankNearbyPlaces({
      places: [
        placeAt('h2', 400, { name: 'Hospital Two', category: 'hospital' }),
        placeAt('p1', 200, { name: 'Police One', category: 'police' }),
        placeAt('h1', 100, { name: 'Hospital One', category: 'hospital' }),
      ],
      centre: CENTRE,
      radiusM: 5000,
    });

    const grouped = groupByCategory(ranked);

    expect(grouped.get('hospital')?.map((place) => place.id)).toEqual(['h1', 'h2']);
    expect(grouped.get('police')?.map((place) => place.id)).toEqual(['p1']);
  });

  it('omits categories with no results rather than adding empty entries', () => {
    expect(groupByCategory([]).size).toBe(0);
  });
});
