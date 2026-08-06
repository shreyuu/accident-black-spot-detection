/**
 * Seed the Firestore emulator with approved incident reports.
 *
 * Input for the Phase 10 analytics service. Written through the emulator's REST
 * API with owner credentials, which bypasses security rules — deliberately,
 * because `firestore.rules` allows no client to set `status: "approved"`. In
 * production a report reaches that state only through the moderation dashboard.
 *
 * The dataset is built so the pipeline's behaviour can actually be observed
 * rather than taken on trust:
 *
 *   - **Site A** is a strong cluster: many reports, many distinct reporters,
 *     high severity, recent. It should produce the highest-scoring candidate.
 *   - **Site B** is weaker: fewer reports, only two people, much older, lower
 *     severity. It should score visibly lower — the two together are what make
 *     the scoring legible, because a single number with nothing to compare it
 *     against says nothing at all.
 *   - **Three ECLAT patterns are planted, and they are different shapes:**
 *       · Site A — `type=accident` + `time=night`. A pair.
 *       · Site C — `type=crime` + `severity=high` + `time=evening`. A triple,
 *         which a miner that only ever emits pairs would fail while still
 *         passing site A.
 *       · Site D — `time=morning-peak` + `severity=medium` with **mixed**
 *         incident types, so no `type=` item can clear the threshold. Without
 *         it the demo would imply the algorithm only rediscovers "crashes
 *         happen at junctions", when the useful finding is usually *when*.
 *     If any of the three is missing from its cluster's patterns, the mining
 *     stage has regressed.
 *   - **Scattered reports** sit far from everything. DBSCAN must label them
 *     noise; if a candidate appears for one, isolated events are being turned
 *     into hazards.
 *   - **Pending and rejected reports sit inside site A's radius.** They must
 *     never influence a candidate. They are the point of the seed as much as
 *     the approved ones: if the counts move when they are added, an
 *     unmoderated report has reached the algorithm.
 *
 * A note on `day=weekday` / `day=weekend` items: they are real and will appear
 * in some runs, because the timestamps are relative to the moment you run this.
 * They are not planted and should not be relied on. The three patterns above
 * hold whatever day you seed on.
 *
 * Usage (emulators must be running):
 *   node firebase/seed/seedIncidentReports.mjs [latitude] [longitude]
 */

import { geohashForLocation } from 'geofire-common';

const PROJECT_ID = 'demo-accident-black-spot-detection';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080';

const centreLat = Number.parseFloat(process.argv[2] ?? '51.5074');
const centreLon = Number.parseFloat(process.argv[3] ?? '-0.1278');

if (!Number.isFinite(centreLat) || !Number.isFinite(centreLon)) {
  console.error('Usage: node firebase/seed/seedIncidentReports.mjs [latitude] [longitude]');
  process.exit(1);
}

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

function destination(lat, lon, bearingDeg, distanceM) {
  const ad = distanceM / EARTH_RADIUS_M;
  const br = toRad(bearingDeg);
  const la = toRad(lat);
  const lo = toRad(lon);
  const sinLat = Math.sin(la) * Math.cos(ad) + Math.cos(la) * Math.sin(ad) * Math.cos(br);
  const destLat = Math.asin(sinLat);
  const destLon =
    lo +
    Math.atan2(Math.sin(br) * Math.sin(ad) * Math.cos(la), Math.cos(ad) - Math.sin(la) * sinLat);
  return { latitude: toDeg(destLat), longitude: ((toDeg(destLon) + 540) % 360) - 180 };
}

/** Firestore REST wants explicitly-typed values. */
function toFirestoreFields(object) {
  const fields = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === null || value === undefined) {
      fields[key] = { nullValue: null };
    } else if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (typeof value === 'number') {
      fields[key] = Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    } else if (value instanceof Date) {
      fields[key] = { timestampValue: value.toISOString() };
    } else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: { values: value.map((entry) => ({ stringValue: String(entry) })) },
      };
    } else {
      throw new Error(`Unsupported field type for ${key}`);
    }
  }
  return fields;
}

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

/** A timestamp `daysAgo` in the past, at `hour` local-to-UTC. */
function when(daysAgo, hour) {
  const date = new Date(NOW - daysAgo * DAY_MS);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

const reports = [];

/** Site A — strong, recent, high severity, and deliberately night-time. */
for (let index = 0; index < 12; index += 1) {
  const { latitude, longitude } = destination(
    centreLat,
    centreLon,
    20 + index * 6,
    600 + index * 6,
  );
  reports.push({
    id: `seed-site-a-${index}`,
    reporterId: `seed-reporter-${index}`, // twelve distinct people: strong corroboration
    type: 'accident',
    description: 'Vehicle left the carriageway on the bend; poor lighting and worn markings.',
    latitude,
    longitude,
    severity: index % 4 === 0 ? 'medium' : 'high',
    // 02:00 for all but two, so type=accident + time=night is well above the
    // 0.5 support threshold and must be found.
    occurredAt: when(3 + index * 2, index === 8 || index === 11 ? 14 : 2),
    status: 'approved',
  });
}

/**
 * Site B — weaker: fewer people, older, lower severity.
 *
 * The bearing step is small on purpose. At a 1800 m offset, one degree of
 * bearing is ~31 m, so a 6-degree step would put consecutive reports ~188 m
 * apart — outside DBSCAN's 150 m neighbourhood, and the site would silently
 * fail to cluster. That is exactly what the first version of this file did.
 */
for (let index = 0; index < 5; index += 1) {
  const { latitude, longitude } = destination(
    centreLat,
    centreLon,
    200 + index * 1.2,
    1800 + index * 15,
  );
  reports.push({
    id: `seed-site-b-${index}`,
    reporterId: `seed-reporter-b-${index % 2}`, // only two distinct people
    type: 'pothole',
    description: 'Deep pothole in the nearside lane, worsening after rain.',
    latitude,
    longitude,
    severity: 'low',
    occurredAt: when(300 + index * 20, 13),
    status: 'approved',
  });
}

/**
 * Site C — a **three-item** pattern, and a crime one.
 *
 * Site A proves a pair can be found. This proves ECLAT climbs past pairs:
 * `type=crime` + `severity=high` + `time=evening` all hold for seven of eight
 * reports, so the 3-itemset clears the 0.5 support threshold and every subset of
 * it does too. A miner that only ever emitted pairs would still look correct
 * against site A alone.
 *
 * It is also a crime cluster rather than a traffic one, which matters for the
 * demo: this app claims to cover both, and a dataset where every pattern is a
 * collision quietly demonstrates only half of it.
 *
 * The bearing step is 3 degrees at a 1200 m offset — about 63 m between
 * consecutive reports, comfortably inside DBSCAN's 150 m neighbourhood. See the
 * note on site B for what happens when that arithmetic is skipped.
 */
for (let index = 0; index < 8; index += 1) {
  const { latitude, longitude } = destination(
    centreLat,
    centreLon,
    130 + index * 3,
    1200 + index * 10,
  );
  reports.push({
    id: `seed-site-c-${index}`,
    reporterId: `seed-reporter-c-${index}`, // eight distinct people
    type: 'crime',
    description: 'Bag snatched near the unlit steps; two others reported the same week.',
    latitude,
    longitude,
    // One low-severity outlier, so support is 7/8 rather than a suspiciously
    // perfect 1.0 — a pattern at exactly 100% reads like a bug in the fixture.
    severity: index === 5 ? 'low' : 'high',
    occurredAt: when(6 + index * 3, index === 5 ? 11 : 21),
    status: 'approved',
  });
}

/**
 * Site D — a pattern that is **not** about the incident type.
 *
 * Deliberately mixed types, so `type=` cannot clear the threshold at all, while
 * `time=morning-peak` and `severity=medium` both do. Without this the demo would
 * suggest ECLAT only ever rediscovers "this is a junction where crashes happen",
 * which is the least interesting thing it can tell you. What is worth surfacing
 * to a moderator is that somewhere is dangerous *at a particular time*, and this
 * is the site that shows it.
 */
const SITE_D_TYPES = ['accident', 'unsafe-road', 'pothole', 'accident', 'other', 'unsafe-road'];
for (let index = 0; index < SITE_D_TYPES.length; index += 1) {
  const { latitude, longitude } = destination(
    centreLat,
    centreLon,
    320 + index * 4,
    1000 + index * 12,
  );
  reports.push({
    id: `seed-site-d-${index}`,
    reporterId: `seed-reporter-d-${index}`,
    type: SITE_D_TYPES[index],
    description: 'Queueing traffic and pedestrians crossing between stationary vehicles.',
    latitude,
    longitude,
    severity: index === 4 ? 'low' : 'medium',
    occurredAt: when(9 + index * 4, index === 4 ? 15 : 8),
    status: 'approved',
  });
}

/** Scattered — must be labelled noise, never a candidate. */
for (let index = 0; index < 5; index += 1) {
  const { latitude, longitude } = destination(centreLat, centreLon, index * 71, 9000 + index * 900);
  reports.push({
    id: `seed-scattered-${index}`,
    reporterId: `seed-lonely-${index}`,
    type: 'unsafe-road',
    description: 'Isolated report with nothing else nearby.',
    latitude,
    longitude,
    severity: 'medium',
    occurredAt: when(20 + index, 10),
    status: 'approved',
  });
}

/**
 * Unmoderated reports, planted inside site A.
 *
 * These must never reach a candidate. If site A's report count changes when
 * these are present, an unapproved report has influenced the algorithm — the
 * exact failure the whole moderation flow exists to prevent.
 */
for (let index = 0; index < 6; index += 1) {
  const { latitude, longitude } = destination(
    centreLat,
    centreLon,
    24 + index * 6,
    604 + index * 6,
  );
  reports.push({
    id: `seed-unmoderated-${index}`,
    reporterId: `seed-unmoderated-reporter-${index}`,
    type: 'accident',
    description: 'Submitted but not reviewed. Must be invisible to the analytics service.',
    latitude,
    longitude,
    severity: 'high',
    occurredAt: when(1 + index, 2),
    status: index % 2 === 0 ? 'pending' : 'rejected',
  });
}

async function writeReport(report) {
  const { id, ...rest } = report;
  const document = {
    ...rest,
    geohash: geohashForLocation([rest.latitude, rest.longitude]),
    imageUrls: [],
    createdAt: rest.occurredAt,
    updatedAt: rest.occurredAt,
  };

  const url = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/incidentReports/${id}`;

  // PATCH so re-running around a different centre repositions rather than fails.
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: toFirestoreFields(document) }),
  });

  if (!response.ok) {
    throw new Error(`Failed to write ${id}: ${response.status} ${await response.text()}`);
  }
}

console.log(`Seeding incident reports around ${centreLat}, ${centreLon}`);
console.log(`Firestore emulator: ${FIRESTORE_HOST}\n`);

for (const report of reports) {
  await writeReport(report);
}

const approved = reports.filter((r) => r.status === 'approved').length;
const unmoderated = reports.length - approved;

const countOf = (prefix) => reports.filter((r) => r.id.startsWith(prefix)).length;

console.log(
  `  + site A       ${countOf('seed-site-a')} approved  accident    mostly 02:00, all distinct reporters`,
);
console.log(
  `  + site B       ${countOf('seed-site-b')} approved  pothole     older, low severity, 2 reporters`,
);
console.log(
  `  + site C       ${countOf('seed-site-c')} approved  crime       mostly 21:00 and high severity`,
);
console.log(
  `  + site D       ${countOf('seed-site-d')} approved  mixed       mostly 08:00 and medium severity`,
);
console.log(
  `  + scattered    ${countOf('seed-scattered')} approved  isolated    must be discarded as noise`,
);
console.log(`  + unmoderated  ${unmoderated} pending/rejected inside site A — must be ignored`);
console.log(`\nDone. ${approved} approved of ${reports.length} total.`);
console.log('Expect the analytics service to find 4 clusters and 4 candidates, with');
console.log('site A scoring highest and site B lowest. See docs/demo.md.');
