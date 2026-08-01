import { env } from '@/config/env';
import {
  includedTypesFor,
  mapGooglePlacesResponse,
} from '@/features/nearby-places/googlePlacesMapping';
import { requestJson } from '@/features/nearby-places/httpJson';
import type {
  NearbyPlace,
  NearbyPlacesProvider,
  NearbyPlacesQuery,
} from '@/features/nearby-places/nearbyPlaceTypes';

/**
 * Nearby facilities from the Google Places API (New).
 *
 * **Optional, and off unless a key is configured.** It exists to prove the
 * provider abstraction is real rather than decorative, and to give better
 * coverage in regions where OpenStreetMap is thin. Without
 * `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY`, `isAvailable()` returns false and the app
 * uses OpenStreetMap alone — which is the default configuration and the one the
 * repository ships.
 *
 * ## About the key — read this before setting one
 *
 * `EXPO_PUBLIC_*` values are inlined into the JavaScript bundle at build time
 * and are trivially recoverable from a shipped app. **This key is not a secret
 * and cannot be made one by any client-side means.** It is public configuration
 * that happens to be billable, so the protection has to come from restrictions
 * on the key itself, not from hiding it:
 *
 *   - restrict it by application (iOS bundle id / Android package name and
 *     signing certificate) in the Google Cloud console;
 *   - restrict it to the Places API alone;
 *   - set a daily quota cap, so a leak is bounded in cost rather than open-ended.
 *
 * The genuinely private alternative is to proxy the call through a server that
 * holds the key. The analytics service arriving in Phase 10 is the natural home
 * for that, and it is the right answer for a production deployment.
 *
 * TODO(phase-12): move this behind a server-side proxy as part of the security
 * review, so no billable credential ships in the client at all.
 */

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';

/**
 * Requested fields.
 *
 * Google bills by field mask, so this asks for exactly what `NearbyPlace` uses
 * and nothing else. Requesting `places.*` is both expensive and a request for
 * more personal-adjacent data than the feature needs.
 */
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

/** Google's own cap for this endpoint. */
const MAX_RESULT_COUNT = 20;

/** The maximum radius the endpoint accepts, in metres. */
const MAX_RADIUS_M = 50_000;

export function isGooglePlacesConfigured(): boolean {
  const key = env.googlePlacesApiKey;
  return key !== undefined && key.length > 0;
}

export const googlePlacesProvider: NearbyPlacesProvider = {
  id: 'google-places',
  label: 'Google',

  isAvailable: isGooglePlacesConfigured,

  async search(query: NearbyPlacesQuery): Promise<NearbyPlace[]> {
    const key = env.googlePlacesApiKey;
    if (key === undefined || key.length === 0) {
      // Should be unreachable — the service checks `isAvailable` first — but a
      // provider that silently returned [] here would look like "nothing
      // nearby" rather than "not configured".
      throw new Error('Google Places is not configured.');
    }

    if (query.categories.length === 0) {
      return [];
    }

    const body = JSON.stringify({
      includedTypes: includedTypesFor(query.categories),
      maxResultCount: MAX_RESULT_COUNT,
      locationRestriction: {
        circle: {
          center: {
            // Rounded like the Overpass query: a third party does not need the
            // user's position to five decimal places to find a hospital.
            latitude: Number(query.centre.latitude.toFixed(5)),
            longitude: Number(query.centre.longitude.toFixed(5)),
          },
          radius: Math.min(Math.round(query.radiusM), MAX_RADIUS_M),
        },
      },
    });

    const response = await requestJson({
      url: ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Header rather than a query parameter, deliberately: a key in a URL is
        // written to every proxy log and analytics trace along the way.
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body,
      timeoutMs: REQUEST_TIMEOUT_MS,
      ...(query.signal === undefined ? {} : { signal: query.signal }),
      // Never interpolate the key into a label; these reach the logs.
      providerLabel: 'Google Places',
    });

    return mapGooglePlacesResponse(response);
  },
};
