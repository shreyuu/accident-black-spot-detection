/**
 * Spherical geometry for the seed scripts.
 *
 * Both datasets place their records by bearing and offset from a seed centre
 * rather than at fixed coordinates, so the demo is usable wherever the app is
 * being tested rather than only in London. That needs one function, and both
 * scripts used to carry their own byte-identical copy of it.
 *
 * `EARTH_RADIUS_M` matches `apps/mobile/src/utils/geo.ts` and
 * `services/analytics/app/algorithms/geo.py`. Those two are a deliberate
 * cross-language pair — TypeScript and Python cannot share a module — and each
 * has tests pinning the value. This file is a third *JavaScript* copy of the
 * constant, which is why it lives here rather than being duplicated again: the
 * seed scripts are plain `.mjs` run by node, so they can simply import it.
 */

export const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (degrees) => (degrees * Math.PI) / 180;
const toDeg = (radians) => (radians * 180) / Math.PI;

/**
 * Project a point `distanceM` from an origin along `bearingDeg`.
 *
 * @param {number} lat        Origin latitude in degrees.
 * @param {number} lon        Origin longitude in degrees.
 * @param {number} bearingDeg Initial bearing, degrees clockwise from north.
 * @param {number} distanceM  Great-circle distance in metres.
 * @returns {{ latitude: number, longitude: number }}
 */
export function destination(lat, lon, bearingDeg, distanceM) {
  const angularDistance = distanceM / EARTH_RADIUS_M;
  const bearing = toRad(bearingDeg);
  const latitude = toRad(lat);
  const longitude = toRad(lon);

  const sinLat =
    Math.sin(latitude) * Math.cos(angularDistance) +
    Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing);

  const destLat = Math.asin(sinLat);
  const destLon =
    longitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * sinLat,
    );

  // Normalised to (-180, 180]; a seed centre near the antimeridian would
  // otherwise produce longitudes outside the range Firestore accepts.
  return { latitude: toDeg(destLat), longitude: ((toDeg(destLon) + 540) % 360) - 180 };
}
