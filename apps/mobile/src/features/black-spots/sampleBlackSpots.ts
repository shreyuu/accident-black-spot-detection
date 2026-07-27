import type { BlackSpotCategory, RiskLevel } from '@/types/domain';
import { destinationPoint, type Coordinates } from '@/utils/geo';

/**
 * Sample black spots for Phase 3.
 *
 * **These are not real data.** They exist so the map, the marker styling, the
 * warning-radius circles and the detail view can be built and reviewed before
 * Firestore is wired up in Phase 4, which replaces this module entirely.
 *
 * They are positioned as offsets from the user's *current* location rather than
 * at fixed coordinates. Fixed coordinates would put the markers thousands of
 * kilometres away on most devices and simulators, leaving an empty map and
 * nothing to review. Offsets keep them on screen wherever the app runs.
 *
 * Every sample carries an explicit `isSample` flag so no screen can mistake one
 * for a verified record, and the UI labels them accordingly.
 */

export interface SampleBlackSpot {
  id: string;
  name: string;
  description: string;
  category: BlackSpotCategory;
  riskLevel: RiskLevel;
  /** Warning radius in metres. */
  radiusM: number;
  latitude: number;
  longitude: number;
  /** Always true here. Guards against sample data being shown as verified. */
  isSample: true;
}

interface SampleTemplate {
  id: string;
  name: string;
  description: string;
  category: BlackSpotCategory;
  riskLevel: RiskLevel;
  radiusM: number;
  /** Clockwise from true north. */
  bearingDegrees: number;
  /** Distance from the user, in metres. */
  offsetM: number;
}

/**
 * Chosen to exercise the full risk ramp and a range of radii, and spaced far
 * enough apart to be individually tappable at the default zoom.
 */
const TEMPLATES: readonly SampleTemplate[] = [
  {
    id: 'sample-junction',
    name: 'Sample junction',
    description:
      'A busy four-way junction with poor sight lines. Several rear-end collisions have been recorded on the approach.',
    category: 'accident',
    riskLevel: 'critical',
    radiusM: 300,
    bearingDegrees: 20,
    offsetM: 600,
  },
  {
    id: 'sample-underpass',
    name: 'Sample underpass',
    description:
      'Poorly lit pedestrian underpass. Reports of theft after dark; avoid travelling alone at night.',
    category: 'crime',
    riskLevel: 'high',
    radiusM: 200,
    bearingDegrees: 150,
    offsetM: 850,
  },
  {
    id: 'sample-bend',
    name: 'Sample road bend',
    description:
      'Sharp descending bend that floods after heavy rain. Surface water and worn markings reduce grip.',
    category: 'unsafe-road',
    riskLevel: 'medium',
    radiusM: 400,
    bearingDegrees: 265,
    offsetM: 1100,
  },
];

/** Place the samples around a given origin, usually the user's position. */
export function buildSampleBlackSpots(origin: Coordinates): SampleBlackSpot[] {
  return TEMPLATES.map((template) => {
    const { latitude, longitude } = destinationPoint(
      origin,
      template.bearingDegrees,
      template.offsetM,
    );

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      riskLevel: template.riskLevel,
      radiusM: template.radiusM,
      latitude,
      longitude,
      isSample: true,
    };
  });
}

/** Number of samples produced. Exposed so tests and copy stay in step. */
export const SAMPLE_BLACK_SPOT_COUNT = TEMPLATES.length;

/** Plain-language guidance per category, shown on the detail screen. */
export const CATEGORY_GUIDANCE: Record<BlackSpotCategory, string> = {
  accident: 'Reduce speed, increase your following distance and watch for stopping traffic.',
  crime:
    'Stay aware of your surroundings. Travel with others where you can, especially after dark.',
  'unsafe-road':
    'Road surface or layout may be poor. Slow down and avoid sudden steering or braking.',
  mixed: 'Both collisions and crime have been reported here. Stay alert and reduce speed.',
};

/** Human-readable category labels. */
export const CATEGORY_LABELS: Record<BlackSpotCategory, string> = {
  accident: 'Accident-prone',
  crime: 'Crime-prone',
  'unsafe-road': 'Unsafe road',
  mixed: 'Accident and crime',
};
