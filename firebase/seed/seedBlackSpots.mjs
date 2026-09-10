/**
 * Seed the Firestore emulator with demo black spots.
 *
 * Writes through the emulator's REST API with owner credentials, which bypasses
 * security rules — deliberately, because `firestore.rules` forbids client writes
 * to `blackSpots` entirely. In production these documents are created by the
 * admin dashboard through the Admin SDK (Phase 7).
 *
 * The dataset is built so the app's guarantees can actually be observed:
 *
 *   - every risk level appears, so marker and circle styling can be compared;
 *   - radii vary, so the user's alert-radius setting visibly narrows them;
 *   - two spots deliberately overlap, to exercise the combined-warning path;
 *   - **two spots sit beyond the 1000 m default alert radius**, one of them the
 *     highest-risk record in the set. Raising the radius in Settings brings them
 *     into range and changes which risk level is the worst thing nearby — which
 *     is the only way to watch that control do anything without travelling;
 *   - **one record is unverified and one is inactive.** Neither must ever appear
 *     in the app. They are the point of the seed as much as the visible ones:
 *     if they show up, the rules or the query have regressed.
 *
 * Twelve records, ten of them visible. The count is not arbitrary: a handful of
 * pins makes a map look sparse enough that a reader assumes something is broken,
 * and the offsets are spread from 400 m to 1600 m so the set is legible at more
 * than one zoom level.
 *
 * Usage (emulators must be running):
 *   node firebase/seed/seedBlackSpots.mjs [latitude] [longitude]
 *
 * Defaults to central London, matching the coordinates used when testing on the
 * simulators.
 */

import { geohashForLocation } from 'geofire-common';

import { writeDocument } from './lib/firestoreRest.mjs';
import { destination } from './lib/geo.mjs';
import { resolveSeedTarget } from './lib/seedTarget.mjs';

const {
  host: FIRESTORE_HOST,
  projectId: PROJECT_ID,
  centreLat,
  centreLon,
} = resolveSeedTarget('firebase/seed/seedBlackSpots.mjs');

/**
 * `bearing` / `offsetM` place each spot relative to the seed centre, so the
 * dataset is usable wherever the app is being tested rather than only in London.
 */
const TEMPLATES = [
  {
    id: 'demo-kings-junction',
    name: 'Kings Road junction',
    description:
      'Four-way junction with poor sight lines on the western approach. Several rear-end collisions recorded in the last two years.',
    category: 'accident',
    riskLevel: 'critical',
    radiusM: 300,
    severityScore: 88,
    accidentCount: 14,
    crimeCount: 0,
    reportCount: 9,
    source: 'official',
    bearing: 20,
    offsetM: 600,
    verified: true,
    active: true,
  },
  {
    id: 'demo-station-underpass',
    name: 'Station underpass',
    description:
      'Poorly lit pedestrian underpass. Repeated reports of theft after dark; avoid travelling alone at night.',
    category: 'crime',
    riskLevel: 'high',
    radiusM: 200,
    severityScore: 71,
    accidentCount: 0,
    crimeCount: 22,
    reportCount: 17,
    source: 'reports',
    bearing: 150,
    offsetM: 850,
    verified: true,
    active: true,
  },
  {
    id: 'demo-riverside-bend',
    name: 'Riverside bend',
    description:
      'Sharp descending bend that floods after heavy rain. Surface water and worn markings reduce grip.',
    category: 'unsafe-road',
    riskLevel: 'medium',
    radiusM: 400,
    severityScore: 52,
    accidentCount: 6,
    crimeCount: 1,
    reportCount: 5,
    source: 'algorithm',
    bearing: 265,
    offsetM: 1100,
    verified: true,
    active: true,
  },
  {
    id: 'demo-market-street',
    name: 'Market Street crossing',
    description: 'Busy crossing with frequent near-misses reported at school closing time.',
    category: 'mixed',
    riskLevel: 'low',
    radiusM: 150,
    severityScore: 28,
    accidentCount: 2,
    crimeCount: 3,
    reportCount: 4,
    source: 'reports',
    bearing: 320,
    offsetM: 500,
    verified: true,
    active: true,
  },
  {
    // Overlaps demo-kings-junction on purpose, to exercise the combined warning.
    id: 'demo-overlap-approach',
    name: 'Kings Road approach',
    description: 'Queueing traffic on the approach to the junction. Sudden stops are common.',
    category: 'accident',
    riskLevel: 'high',
    radiusM: 250,
    severityScore: 64,
    accidentCount: 5,
    crimeCount: 0,
    reportCount: 3,
    source: 'reports',
    bearing: 25,
    offsetM: 700,
    verified: true,
    active: true,
  },
  {
    id: 'demo-college-roundabout',
    name: 'College roundabout',
    description:
      'Multi-lane roundabout beside a sixth-form college. Lane discipline breaks down at the start and end of the college day.',
    category: 'accident',
    riskLevel: 'medium',
    radiusM: 250,
    severityScore: 47,
    accidentCount: 7,
    crimeCount: 0,
    reportCount: 6,
    source: 'official',
    bearing: 75,
    offsetM: 950,
    verified: true,
    active: true,
  },
  {
    id: 'demo-canal-towpath',
    name: 'Canal towpath steps',
    description:
      'Unlit steps between the towpath and the road. Bicycle thefts and snatch thefts reported after dusk.',
    category: 'crime',
    riskLevel: 'medium',
    radiusM: 180,
    severityScore: 44,
    accidentCount: 0,
    crimeCount: 11,
    reportCount: 8,
    source: 'reports',
    bearing: 195,
    offsetM: 750,
    verified: true,
    active: true,
  },
  {
    // Deliberately outside the 1000 m default alert radius. Turning the radius
    // up in Settings brings it into range, which is the only way to see that
    // control do anything without driving somewhere.
    id: 'demo-hill-descent',
    name: 'Beacon Hill descent',
    description:
      'Long descent with a blind left-hand bend at the bottom. Heavy vehicles have run wide in the wet.',
    category: 'unsafe-road',
    riskLevel: 'high',
    radiusM: 350,
    severityScore: 69,
    accidentCount: 9,
    crimeCount: 0,
    reportCount: 7,
    source: 'official',
    bearing: 300,
    offsetM: 1450,
    verified: true,
    active: true,
  },
  {
    id: 'demo-retail-park-exit',
    name: 'Retail park exit',
    description:
      'Exit onto a 40 mph road with a short slip. Most incidents here are low-speed shunts while waiting to join.',
    category: 'accident',
    riskLevel: 'low',
    radiusM: 150,
    severityScore: 24,
    accidentCount: 4,
    crimeCount: 0,
    reportCount: 3,
    source: 'reports',
    bearing: 110,
    offsetM: 1250,
    verified: true,
    active: true,
  },
  {
    // Also outside the default radius, and critical — so the pair with
    // demo-hill-descent shows the radius setting changing *which* risk level is
    // the highest thing in range, not merely how many pins there are.
    id: 'demo-night-market',
    name: 'Night market approach',
    description:
      'Crowded pedestrian route on market nights. Repeated reports of pickpocketing and one assault.',
    category: 'crime',
    riskLevel: 'critical',
    radiusM: 220,
    severityScore: 83,
    accidentCount: 1,
    crimeCount: 19,
    reportCount: 14,
    source: 'reports',
    bearing: 240,
    offsetM: 1600,
    verified: true,
    active: true,
  },
  {
    // MUST NOT APPEAR. An algorithm candidate awaiting review.
    id: 'demo-unverified-candidate',
    name: 'UNVERIFIED — should never be visible',
    description:
      'Algorithm candidate awaiting moderator review. If this appears in the app, the security rules or the repository query have regressed.',
    category: 'accident',
    riskLevel: 'critical',
    radiusM: 400,
    severityScore: 90,
    accidentCount: 3,
    crimeCount: 0,
    reportCount: 3,
    source: 'algorithm',
    bearing: 90,
    offsetM: 450,
    verified: false,
    active: true,
  },
  {
    // MUST NOT APPEAR. Verified once, since deactivated.
    id: 'demo-inactive-spot',
    name: 'INACTIVE — should never be visible',
    description:
      'Previously verified but deactivated after the junction was redesigned. If this appears, the active filter has regressed.',
    category: 'accident',
    riskLevel: 'high',
    radiusM: 300,
    severityScore: 60,
    accidentCount: 8,
    crimeCount: 0,
    reportCount: 6,
    source: 'official',
    bearing: 200,
    offsetM: 400,
    verified: true,
    active: false,
  },
];

async function writeSpot(template) {
  const { latitude, longitude } = destination(
    centreLat,
    centreLon,
    template.bearing,
    template.offsetM,
  );

  const document = {
    name: template.name,
    description: template.description,
    category: template.category,
    latitude,
    longitude,
    // Written here because Firestore cannot compute it. The repository range-
    // queries this field; a wrong or missing geohash makes a spot invisible.
    geohash: geohashForLocation([latitude, longitude]),
    radiusM: template.radiusM,
    riskLevel: template.riskLevel,
    severityScore: template.severityScore,
    accidentCount: template.accidentCount,
    crimeCount: template.crimeCount,
    reportCount: template.reportCount,
    verified: template.verified,
    active: template.active,
    source: template.source,
    createdBy: 'seed-script',
  };

  await writeDocument({
    host: FIRESTORE_HOST,
    projectId: PROJECT_ID,
    collection: 'blackSpots',
    id: template.id,
    document,
  });

  const visibility = template.verified && template.active ? 'visible' : 'HIDDEN (expected)';
  console.log(`  + ${template.id.padEnd(28)} ${template.riskLevel.padEnd(8)} ${visibility}`);
}

console.log(`Seeding black spots around ${centreLat}, ${centreLon}`);
console.log(`Firestore emulator: ${FIRESTORE_HOST}\n`);

for (const template of TEMPLATES) {
  await writeSpot(template);
}

const visible = TEMPLATES.filter((t) => t.verified && t.active).length;
console.log(
  `\nDone. ${visible} of ${TEMPLATES.length} should be visible in the app; ` +
    `${TEMPLATES.length - visible} are deliberately excluded (one unverified, one inactive).`,
);
