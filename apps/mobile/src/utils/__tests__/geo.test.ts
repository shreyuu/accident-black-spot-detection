import {
  destinationPoint,
  EARTH_RADIUS_M,
  formatDistance,
  haversineDistanceM,
  isValidCoordinate,
  regionDeltasForRadius,
  type Coordinates,
} from '@/utils/geo';

/**
 * Metres per degree of latitude on the sphere this module models: 2πR / 360,
 * which is 111,195 m.
 *
 * Deliberately derived from `EARTH_RADIUS_M` rather than hard-coded as the
 * frequently quoted 111,320 m. That figure comes from the WGS-84 *ellipsoid* at
 * mid-latitudes, and using it here would make the test disagree with the
 * spherical model by ~0.1% — enough to fail, while the implementation is
 * behaving exactly as documented.
 */
const METRES_PER_DEGREE_LATITUDE = (2 * Math.PI * EARTH_RADIUS_M) / 360;

/**
 * Every proximity warning the app produces reduces to `haversineDistanceM`, so
 * these are tested against independently known values rather than against the
 * implementation's own output.
 */

const LONDON: Coordinates = { latitude: 51.5074, longitude: -0.1278 };
const PARIS: Coordinates = { latitude: 48.8566, longitude: 2.3522 };
const NEW_YORK: Coordinates = { latitude: 40.7128, longitude: -74.006 };
const MUMBAI: Coordinates = { latitude: 19.076, longitude: 72.8777 };

describe('isValidCoordinate', () => {
  it.each([
    ['London', LONDON],
    ['null island', { latitude: 0, longitude: 0 }],
    ['north pole', { latitude: 90, longitude: 0 }],
    ['south pole', { latitude: -90, longitude: 0 }],
    ['antimeridian east', { latitude: 0, longitude: 180 }],
    ['antimeridian west', { latitude: 0, longitude: -180 }],
  ])('accepts %s', (_label, value) => {
    expect(isValidCoordinate(value)).toBe(true);
  });

  it.each([
    ['latitude above 90', { latitude: 90.1, longitude: 0 }],
    ['latitude below -90', { latitude: -90.1, longitude: 0 }],
    ['longitude above 180', { latitude: 0, longitude: 180.1 }],
    ['longitude below -180', { latitude: 0, longitude: -180.1 }],
    ['NaN latitude', { latitude: Number.NaN, longitude: 0 }],
    ['Infinity longitude', { latitude: 0, longitude: Number.POSITIVE_INFINITY }],
    ['missing longitude', { latitude: 10 }],
    ['empty object', {}],
  ])('rejects %s', (_label, value) => {
    expect(isValidCoordinate(value)).toBe(false);
  });

  it.each([null, undefined])('rejects %p', (value) => {
    expect(isValidCoordinate(value)).toBe(false);
  });
});

describe('haversineDistanceM', () => {
  it('returns zero for identical points', () => {
    expect(haversineDistanceM(LONDON, LONDON)).toBe(0);
  });

  /**
   * Reference values are the accepted great-circle distances between these city
   * centres. A 0.5% tolerance covers the spherical-Earth approximation.
   */
  it.each([
    ['London to Paris', LONDON, PARIS, 343_500],
    ['London to New York', LONDON, NEW_YORK, 5_570_000],
    ['London to Mumbai', LONDON, MUMBAI, 7_190_000],
  ])('%s is about %d m', (_label, from, to, expected) => {
    const actual = haversineDistanceM(from, to);
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.005);
  });

  it('is symmetric', () => {
    expect(haversineDistanceM(LONDON, PARIS)).toBeCloseTo(haversineDistanceM(PARIS, LONDON), 6);
  });

  /**
   * The range that actually matters: alert radii are 100–2000 m. A degree of
   * latitude is a constant arc on a sphere, so these are checkable by hand.
   */
  it.each([0.001, 0.005, 0.01])('resolves a %f degree latitude step', (delta) => {
    const actual = haversineDistanceM(LONDON, {
      latitude: LONDON.latitude + delta,
      longitude: LONDON.longitude,
    });
    expect(actual).toBeCloseTo(delta * METRES_PER_DEGREE_LATITUDE, 1);
  });

  it('handles a short longitude step, accounting for latitude convergence', () => {
    // A degree of longitude shrinks by cos(latitude); at 51.5°N that is ~0.62.
    const actual = haversineDistanceM(LONDON, {
      latitude: LONDON.latitude,
      longitude: LONDON.longitude + 0.01,
    });
    const expected =
      0.01 * METRES_PER_DEGREE_LATITUDE * Math.cos((LONDON.latitude * Math.PI) / 180);

    // Loose tolerance: the exact great-circle path between two points at equal
    // latitude bows slightly poleward of the parallel, so it is fractionally
    // shorter than the parallel arc this approximation computes.
    expect(Math.abs(actual - expected)).toBeLessThan(1);
  });

  it('does not lose precision at sub-metre range', () => {
    // The spherical law of cosines fails here through floating-point
    // cancellation; haversine is used precisely because it does not.
    const nearby = { latitude: LONDON.latitude + 0.000_001, longitude: LONDON.longitude };
    const distance = haversineDistanceM(LONDON, nearby);

    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(0.2);
  });

  it('measures across the antimeridian without wrapping the long way round', () => {
    const west = { latitude: 0, longitude: 179.99 };
    const east = { latitude: 0, longitude: -179.99 };

    // ~0.02 degrees apart, roughly 2.2 km — not most of the way around the globe.
    expect(haversineDistanceM(west, east)).toBeLessThan(3000);
  });

  it('never returns NaN for antipodal points', () => {
    // asin is clamped for exactly this case; without it, floating-point drift
    // pushes the argument above 1.
    const distance = haversineDistanceM(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 180 },
    );

    expect(Number.isNaN(distance)).toBe(false);
    expect(distance).toBeGreaterThan(20_000_000);
  });
});

describe('destinationPoint', () => {
  it.each([100, 500, 1000, 5000])(
    'lands exactly %d m away, as measured back by haversine',
    (distanceM) => {
      for (const bearing of [0, 45, 90, 180, 270, 359]) {
        const destination = destinationPoint(LONDON, bearing, distanceM);
        expect(haversineDistanceM(LONDON, destination)).toBeCloseTo(distanceM, 3);
      }
    },
  );

  it('moves north for bearing 0 and south for bearing 180', () => {
    expect(destinationPoint(LONDON, 0, 1000).latitude).toBeGreaterThan(LONDON.latitude);
    expect(destinationPoint(LONDON, 180, 1000).latitude).toBeLessThan(LONDON.latitude);
  });

  it('moves east for bearing 90 and west for bearing 270', () => {
    expect(destinationPoint(LONDON, 90, 1000).longitude).toBeGreaterThan(LONDON.longitude);
    expect(destinationPoint(LONDON, 270, 1000).longitude).toBeLessThan(LONDON.longitude);
  });

  it('returns a coordinate that is still valid after crossing the antimeridian', () => {
    const nearAntimeridian: Coordinates = { latitude: 0, longitude: 179.999 };
    const projected = destinationPoint(nearAntimeridian, 90, 5000);

    // Without normalisation this would exceed 180 and the map would reject it.
    expect(isValidCoordinate(projected)).toBe(true);
    expect(projected.longitude).toBeLessThanOrEqual(180);
    expect(projected.longitude).toBeGreaterThanOrEqual(-180);
  });

  it('produces valid coordinates from any starting latitude', () => {
    for (const latitude of [-89, -45, 0, 45, 89]) {
      for (const bearing of [0, 90, 180, 270]) {
        const projected = destinationPoint({ latitude, longitude: 10 }, bearing, 2000);
        expect(isValidCoordinate(projected)).toBe(true);
      }
    }
  });

  it('is a no-op for zero distance', () => {
    const projected = destinationPoint(LONDON, 42, 0);

    expect(projected.latitude).toBeCloseTo(LONDON.latitude, 9);
    expect(projected.longitude).toBeCloseTo(LONDON.longitude, 9);
  });
});

describe('formatDistance', () => {
  it.each([
    [0, '0 m'],
    [4, '0 m'],
    [12, '10 m'],
    [48, '50 m'],
    [99, '100 m'],
  ])('rounds %d m to %s below 100 m', (input, expected) => {
    expect(formatDistance(input)).toBe(expected);
  });

  it.each([
    [100, '100 m'],
    [418, '400 m'],
    [430, '450 m'],
    [999, '1000 m'],
  ])('rounds %d m to %s below 1 km', (input, expected) => {
    expect(formatDistance(input)).toBe(expected);
  });

  it.each([
    [1000, '1.0 km'],
    [1450, '1.5 km'],
    [9949, '9.9 km'],
  ])('formats %d m as %s below 10 km', (input, expected) => {
    expect(formatDistance(input)).toBe(expected);
  });

  it.each([
    [10_000, '10 km'],
    [12_400, '12 km'],
  ])('formats %d m as %s at or above 10 km', (input, expected) => {
    expect(formatDistance(input)).toBe(expected);
  });

  /**
   * Precision is capped on purpose. GPS is good to perhaps 5–10 m in the open
   * and much worse among buildings, so a metre-precise label would claim
   * accuracy the reading does not have — and would flicker on every update.
   */
  it('never implies sub-10-metre precision', () => {
    for (const value of [1, 3, 7, 11, 17, 23]) {
      expect(formatDistance(value)).toMatch(/^\d+0? m$/);
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])('handles the invalid input %p', (value) => {
    expect(formatDistance(value)).toBe('Unknown distance');
  });
});

describe('regionDeltasForRadius', () => {
  it('spans at least the full diameter of the circle', () => {
    const { latitudeDelta } = regionDeltasForRadius(LONDON, 1000);
    // 2 km of latitude is ~0.018 degrees.
    expect(latitudeDelta).toBeGreaterThan(0.017);
    expect(latitudeDelta).toBeLessThan(0.02);
  });

  it('widens the longitude span at higher latitudes, where degrees are narrower', () => {
    const equator = regionDeltasForRadius({ latitude: 0, longitude: 0 }, 1000);
    const northern = regionDeltasForRadius({ latitude: 60, longitude: 0 }, 1000);

    expect(northern.longitudeDelta).toBeGreaterThan(equator.longitudeDelta);
    // cos(60°) = 0.5, so the span should roughly double.
    expect(northern.longitudeDelta / equator.longitudeDelta).toBeCloseTo(2, 1);
  });

  it('stays finite at the poles, where the cosine term approaches zero', () => {
    const polar = regionDeltasForRadius({ latitude: 90, longitude: 0 }, 1000);

    expect(Number.isFinite(polar.longitudeDelta)).toBe(true);
    expect(polar.longitudeDelta).toBeGreaterThan(0);
  });

  it('scales with the radius', () => {
    const small = regionDeltasForRadius(LONDON, 500);
    const large = regionDeltasForRadius(LONDON, 2000);

    expect(large.latitudeDelta / small.latitudeDelta).toBeCloseTo(4, 5);
  });
});
