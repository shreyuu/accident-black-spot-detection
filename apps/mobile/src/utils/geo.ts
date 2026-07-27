/**
 * Geospatial primitives.
 *
 * These are pure functions with no dependency on React, Expo or Firebase, which
 * is deliberate: they are the safety-critical core of the app. Every proximity
 * warning the user ever sees is ultimately a call to `haversineDistanceM`, so
 * they are kept isolated and heavily tested rather than embedded in a component.
 *
 * Phase 4 builds enter/exit hysteresis and alert cooldown on top of these.
 */

/** Mean Earth radius in metres (IUGG). */
export const EARTH_RADIUS_M = 6_371_008.8;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * Is this a usable WGS-84 coordinate?
 *
 * Rejects NaN and Infinity as well as out-of-range values. `(0, 0)` is a valid
 * point in the Gulf of Guinea, but it is also what a broken sensor or an
 * uninitialised variable produces, so callers that treat it as suspicious should
 * say so explicitly rather than relying on this function.
 */
export function isValidCoordinate(value: Partial<Coordinates> | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  const { latitude, longitude } = value;
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Great-circle distance between two points, in metres.
 *
 * Uses the haversine formula, which is numerically well-behaved for the small
 * distances this app cares about (tens of metres to a few kilometres) — the
 * simpler spherical law of cosines loses precision badly at short range because
 * of floating-point cancellation.
 *
 * Assumes a spherical Earth. The resulting error versus the WGS-84 ellipsoid is
 * up to about 0.3%, i.e. ~3 m over a 1 km alert radius. That is far smaller than
 * consumer GPS error, so a more expensive Vincenty solution would add cost
 * without adding real accuracy.
 */
export function haversineDistanceM(from: Coordinates, to: Coordinates): number {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.sin(longitudeDelta / 2) ** 2 * Math.cos(fromLatitude) * Math.cos(toLatitude);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Project a point a given distance and bearing from an origin.
 *
 * Used to place the Phase 3 sample black spots relative to wherever the user
 * actually is, so the map is meaningful on any device or simulator rather than
 * only near one hard-coded city.
 *
 * @param bearingDegrees Clockwise from true north.
 */
export function destinationPoint(
  origin: Coordinates,
  bearingDegrees: number,
  distanceM: number,
): Coordinates {
  const angularDistance = distanceM / EARTH_RADIUS_M;
  const bearing = toRadians(bearingDegrees);
  const latitude = toRadians(origin.latitude);
  const longitude = toRadians(origin.longitude);

  const sinLatitude =
    Math.sin(latitude) * Math.cos(angularDistance) +
    Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing);
  const destinationLatitude = Math.asin(sinLatitude);

  const destinationLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * sinLatitude,
    );

  return {
    latitude: toDegrees(destinationLatitude),
    // Normalise into [-180, 180] so a projection across the antimeridian does not
    // produce a longitude the map rejects.
    longitude: ((toDegrees(destinationLongitude) + 540) % 360) - 180,
  };
}

/**
 * Human-readable distance.
 *
 * Precision is deliberately coarse and decreases with distance: GPS is accurate
 * to perhaps 5–10 m in the open and far worse among buildings, so "418.72 m"
 * would imply precision the reading does not have. Rounding also keeps the label
 * stable instead of flickering on every position update.
 */
export function formatDistance(distanceM: number): string {
  if (!Number.isFinite(distanceM) || distanceM < 0) {
    return 'Unknown distance';
  }
  if (distanceM < 100) {
    return `${Math.round(distanceM / 10) * 10} m`;
  }
  if (distanceM < 1000) {
    return `${Math.round(distanceM / 50) * 50} m`;
  }
  if (distanceM < 10_000) {
    // Rounded explicitly rather than with `toFixed(1)`. `toFixed` rounds on the
    // binary representation, so 1450 m becomes "1.4 km" because 1.45 is stored
    // as slightly less than 1.45 — an inconsistency that is hard to predict and
    // impossible to test cleanly. Integer rounding of tenths is deterministic.
    const tenthsOfKm = Math.round(distanceM / 100);
    return `${(tenthsOfKm / 10).toFixed(1)} km`;
  }
  return `${Math.round(distanceM / 1000)} km`;
}

/**
 * Latitude/longitude deltas that frame a circle of `radiusM` around `centre`.
 *
 * Longitude degrees shrink towards the poles, hence the `cos(latitude)` term.
 * It is clamped because the divisor approaches zero at the poles and would
 * otherwise produce an infinite span.
 */
export function regionDeltasForRadius(
  centre: Coordinates,
  radiusM: number,
): { latitudeDelta: number; longitudeDelta: number } {
  const metresPerDegreeLatitude = 111_320;
  const latitudeDelta = (radiusM * 2) / metresPerDegreeLatitude;

  const cosLatitude = Math.max(0.01, Math.cos(toRadians(centre.latitude)));
  const longitudeDelta = latitudeDelta / cosLatitude;

  return { latitudeDelta, longitudeDelta };
}
