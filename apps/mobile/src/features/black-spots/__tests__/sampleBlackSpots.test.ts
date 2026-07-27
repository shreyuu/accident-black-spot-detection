import {
  buildSampleBlackSpots,
  CATEGORY_GUIDANCE,
  CATEGORY_LABELS,
  SAMPLE_BLACK_SPOT_COUNT,
} from '@/features/black-spots/sampleBlackSpots';
import { BLACK_SPOT_CATEGORIES, RISK_LEVELS } from '@/types/domain';
import { haversineDistanceM, isValidCoordinate, type Coordinates } from '@/utils/geo';

const LONDON: Coordinates = { latitude: 51.5074, longitude: -0.1278 };

describe('buildSampleBlackSpots', () => {
  it('produces the advertised number of spots', () => {
    expect(buildSampleBlackSpots(LONDON)).toHaveLength(SAMPLE_BLACK_SPOT_COUNT);
  });

  it('gives every spot a valid coordinate', () => {
    for (const spot of buildSampleBlackSpots(LONDON)) {
      expect(isValidCoordinate(spot)).toBe(true);
    }
  });

  it('uses unique ids, so React keys and map lookups stay correct', () => {
    const ids = buildSampleBlackSpots(LONDON).map((spot) => spot.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * The whole reason samples are projected rather than hard-coded: on a device
   * anywhere in the world they must land close enough to appear on screen.
   */
  it('places every spot within about 1.5 km of the origin', () => {
    for (const spot of buildSampleBlackSpots(LONDON)) {
      const distance = haversineDistanceM(LONDON, spot);
      expect(distance).toBeGreaterThan(100);
      expect(distance).toBeLessThan(1500);
    }
  });

  it.each([
    ['London', LONDON],
    ['equator', { latitude: 0, longitude: 0 }],
    ['high north', { latitude: 71, longitude: 25 }],
    ['deep south', { latitude: -54, longitude: -68 }],
    ['near the antimeridian', { latitude: -17, longitude: 179.99 }],
  ])('produces valid coordinates from an origin at %s', (_label, origin) => {
    const spots = buildSampleBlackSpots(origin);

    expect(spots).toHaveLength(SAMPLE_BLACK_SPOT_COUNT);
    for (const spot of spots) {
      expect(isValidCoordinate(spot)).toBe(true);
    }
  });

  it('is deterministic for the same origin', () => {
    expect(buildSampleBlackSpots(LONDON)).toEqual(buildSampleBlackSpots(LONDON));
  });

  it('moves the spots when the origin moves', () => {
    const elsewhere = { latitude: 48.8566, longitude: 2.3522 };
    const [first] = buildSampleBlackSpots(LONDON);
    const [moved] = buildSampleBlackSpots(elsewhere);

    expect(first?.latitude).not.toBeCloseTo(moved?.latitude ?? 0, 3);
  });

  it('separates the spots enough to be individually tappable', () => {
    const spots = buildSampleBlackSpots(LONDON);

    for (let i = 0; i < spots.length; i += 1) {
      for (let j = i + 1; j < spots.length; j += 1) {
        const a = spots[i];
        const b = spots[j];
        if (a === undefined || b === undefined) {
          continue;
        }
        expect(haversineDistanceM(a, b)).toBeGreaterThan(300);
      }
    }
  });

  it('uses a warning radius inside the range the app supports', () => {
    for (const spot of buildSampleBlackSpots(LONDON)) {
      expect(spot.radiusM).toBeGreaterThanOrEqual(100);
      expect(spot.radiusM).toBeLessThanOrEqual(2000);
    }
  });

  it('exercises more than one risk level, so the map styling can be reviewed', () => {
    const levels = new Set(buildSampleBlackSpots(LONDON).map((spot) => spot.riskLevel));
    expect(levels.size).toBeGreaterThan(1);
  });

  it('uses only known risk levels and categories', () => {
    for (const spot of buildSampleBlackSpots(LONDON)) {
      expect(RISK_LEVELS).toContain(spot.riskLevel);
      expect(BLACK_SPOT_CATEGORIES).toContain(spot.category);
    }
  });

  /**
   * Guards the rule that sample data must never be presentable as verified. If
   * this flag were dropped, a placeholder could be shown to a user as a real
   * reported hazard.
   */
  it('marks every spot as sample data', () => {
    for (const spot of buildSampleBlackSpots(LONDON)) {
      expect(spot.isSample).toBe(true);
    }
  });

  it('gives every spot a name and a description worth reading', () => {
    for (const spot of buildSampleBlackSpots(LONDON)) {
      expect(spot.name.length).toBeGreaterThan(3);
      expect(spot.description.length).toBeGreaterThan(30);
    }
  });
});

describe('category copy', () => {
  it('covers every category, so no lookup can come back undefined', () => {
    for (const category of BLACK_SPOT_CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
      expect(CATEGORY_GUIDANCE[category]).toBeTruthy();
    }
  });

  /**
   * Guidance appears while someone may be about to drive through the area, so it
   * has to be an actionable instruction rather than a restatement of the risk.
   */
  it('gives actionable guidance rather than a bare warning', () => {
    for (const category of BLACK_SPOT_CATEGORIES) {
      const guidance = CATEGORY_GUIDANCE[category];
      expect(guidance.length).toBeGreaterThan(40);
      expect(guidance).toMatch(/[.!]$/);
    }
  });

  it('never promises safety or prevention', () => {
    // The app must not imply it prevents anything — see the safety rules in the
    // project brief and src/constants/disclaimer.ts.
    for (const guidance of Object.values(CATEGORY_GUIDANCE)) {
      expect(guidance.toLowerCase()).not.toMatch(/\b(prevent|guarantee|safe from|will avoid)\b/);
    }
  });
});
