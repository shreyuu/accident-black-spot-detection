import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';

/**
 * Server-side proxy for the Google Places API.
 *
 * Resolves the `TODO(phase-12)` in
 * `apps/mobile/src/features/nearby-places/googlePlacesProvider.ts`.
 *
 * ## The problem it solves
 *
 * `EXPO_PUBLIC_*` values are inlined into the JavaScript bundle at build time
 * and can be pulled out of a shipped app in minutes. A Places key set that way
 * is public configuration that happens to be **billable** — the mitigation has
 * to be restriction and quota caps, not secrecy, because secrecy is not
 * available client-side at all.
 *
 * Holding the key here removes the problem rather than mitigating it. The key is
 * a Cloud Functions secret: it never enters the bundle, and it is not in the
 * repository either.
 *
 * ## Why it returns Google's response rather than mapped places
 *
 * `mapGooglePlacesResponse` in the app is already written and already tested,
 * and it is the piece that knows how a Places record becomes a `NearbyPlace`.
 * Moving it here would duplicate it or strand it; leaving it there keeps this
 * function to the one job that has to be on a server — holding the credential.
 *
 * ## What is *not* forwarded
 *
 * The caller's identity is not sent to Google, and the coordinates are rounded
 * to five decimal places before they leave — about a metre, which is far more
 * than enough to find a hospital and much less than enough to describe where
 * somebody is standing. The app already rounds; it is done again here because a
 * proxy that trusted its caller to have rounded would not be a privacy control.
 */

/**
 * The Places key.
 *
 * A secret, not an environment variable: secrets are stored in Secret Manager,
 * are not printed by `firebase functions:config`, and are mounted only into the
 * functions that declare them. Locally the emulator reads `functions/.secret.local`,
 * which is git-ignored.
 */
const googlePlacesApiKey = defineSecret('GOOGLE_PLACES_API_KEY');

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';

/** Billed by field mask, so this asks for what `NearbyPlace` uses and nothing more. */
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.types',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
].join(',');

const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESULT_COUNT = 20;
const MAX_RADIUS_M = 50_000;

/** Place types the proxy will forward. An allow-list, so it cannot become a general Places gateway. */
const ALLOWED_TYPES = new Set(['hospital', 'police']);

export interface NearbyPlacesProxyRequest {
  latitude: number;
  longitude: number;
  radiusM: number;
  includedTypes: string[];
}

/**
 * Validate and normalise the request.
 *
 * Exported and tested separately: this is the boundary between a client and a
 * billable third-party API, and every value crossing it needs bounding. A radius
 * of a million metres or a hundred place types would be somebody using this
 * project's billing account for their own purposes.
 */
export function normaliseProxyRequest(data: unknown): NearbyPlacesProxyRequest {
  if (typeof data !== 'object' || data === null) {
    throw new HttpsError('invalid-argument', 'A search request is required.');
  }

  const raw = data as Record<string, unknown>;
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  const radiusM = Number(raw.radiusM);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new HttpsError('invalid-argument', 'A valid latitude is required.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new HttpsError('invalid-argument', 'A valid longitude is required.');
  }
  if (!Number.isFinite(radiusM) || radiusM <= 0) {
    throw new HttpsError('invalid-argument', 'A valid radius is required.');
  }

  const requestedTypes = Array.isArray(raw.includedTypes) ? raw.includedTypes : [];
  const includedTypes = requestedTypes.filter(
    (type): type is string => typeof type === 'string' && ALLOWED_TYPES.has(type),
  );

  if (includedTypes.length === 0) {
    throw new HttpsError('invalid-argument', 'At least one supported place type is required.');
  }

  return {
    // Rounded before it leaves this process. See the note above.
    latitude: Number(latitude.toFixed(5)),
    longitude: Number(longitude.toFixed(5)),
    radiusM: Math.min(Math.round(radiusM), MAX_RADIUS_M),
    includedTypes: [...new Set(includedTypes)],
  };
}

export const nearbyPlacesProxy = onCall(
  { secrets: [googlePlacesApiKey] },
  async (request: CallableRequest): Promise<unknown> => {
    // Signed in, so the proxy is not an open relay onto a billable API.
    if (request.auth?.uid === undefined) {
      throw new HttpsError('unauthenticated', 'You need to be signed in to search nearby places.');
    }

    const key = googlePlacesApiKey.value();
    if (key.length === 0) {
      // Not configured is not the same as nothing nearby. The app falls back to
      // OpenStreetMap on this error rather than showing an empty list.
      throw new HttpsError('failed-precondition', 'Google Places is not configured.');
    }

    const query = normaliseProxyRequest(request.data);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Header rather than a query parameter: a key in a URL is written to
          // every proxy log along the way.
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify({
          includedTypes: query.includedTypes,
          maxResultCount: MAX_RESULT_COUNT,
          locationRestriction: {
            circle: {
              center: { latitude: query.latitude, longitude: query.longitude },
              radius: query.radiusM,
            },
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // The upstream body can echo the key back in an error message, so it is
        // never logged and never forwarded.
        logger.warn('Google Places rejected a proxied request', { status: response.status });
        throw new HttpsError('unavailable', 'Nearby places could not be looked up right now.');
      }

      return await response.json();
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.warn('Google Places proxy failed', {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      throw new HttpsError('unavailable', 'Nearby places could not be looked up right now.');
    } finally {
      clearTimeout(timeout);
    }
  },
);
