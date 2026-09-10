/**
 * Where a seed script writes, and around what centre.
 *
 * Both scripts take the same two positional arguments and validate them the same
 * way. Sharing the parse means the two cannot drift into accepting different
 * inputs — which matters because `seedAll.mjs` passes one pair of coordinates to
 * both, and a difference in what they accept would show up as one dataset
 * positioned around London and the other around NaN.
 */

export const PROJECT_ID = 'demo-accident-black-spot-detection';

/** Central London, matching the coordinates used when testing on the simulators. */
const DEFAULT_CENTRE = { latitude: '51.5074', longitude: '-0.1278' };

/**
 * Resolve the emulator host and seed centre from `process.argv`.
 *
 * Exits with usage on a non-finite coordinate rather than seeding NaN, which
 * Firestore accepts as a double and which then renders as an empty map with no
 * indication of why.
 *
 * @param {string} scriptPath Path shown in the usage message.
 * @returns {{ host: string, projectId: string, centreLat: number, centreLon: number }}
 */
export function resolveSeedTarget(scriptPath) {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080';

  const centreLat = Number.parseFloat(process.argv[2] ?? DEFAULT_CENTRE.latitude);
  const centreLon = Number.parseFloat(process.argv[3] ?? DEFAULT_CENTRE.longitude);

  if (!Number.isFinite(centreLat) || !Number.isFinite(centreLon)) {
    console.error(`Usage: node ${scriptPath} [latitude] [longitude]`);
    process.exit(1);
  }

  return { host, projectId: PROJECT_ID, centreLat, centreLon };
}
