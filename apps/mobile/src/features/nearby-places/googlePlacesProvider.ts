import { httpsCallable } from 'firebase/functions';

import { env } from '@/config/env';
import {
  includedTypesFor,
  mapGooglePlacesResponse,
} from '@/features/nearby-places/googlePlacesMapping';
import type {
  NearbyPlace,
  NearbyPlacesProvider,
  NearbyPlacesQuery,
} from '@/features/nearby-places/nearbyPlaceTypes';
import { getFirebaseFunctions } from '@/services/firebase/app';
import { AppError } from '@/utils/errors';

/**
 * Nearby facilities from the Google Places API, **through a server-side proxy**.
 *
 * **Optional, and off unless enabled.** It exists to prove the provider
 * abstraction is real rather than decorative, and to give better coverage in
 * regions where OpenStreetMap is thin. With `EXPO_PUBLIC_GOOGLE_PLACES_PROXY_ENABLED`
 * unset, `isAvailable()` returns false and the app uses OpenStreetMap alone —
 * which is the default configuration and the one the repository ships.
 *
 * ## What Phase 12 changed, and why it mattered
 *
 * Until Phase 12 this file called `places.googleapis.com` directly with
 * `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY`. Every `EXPO_PUBLIC_*` value is inlined
 * into the JavaScript bundle at build time and can be extracted from a shipped
 * app in minutes, so that key was **public, billable configuration** — the best
 * available mitigation was restricting it by bundle id and capping the daily
 * quota, because secrecy is simply not achievable client-side.
 *
 * The call now goes to the `nearbyPlacesProxy` Cloud Function, which holds the
 * key in Secret Manager. No billable credential is in the bundle at all, which
 * is a different thing from a well-restricted one. The function also bounds the
 * radius and the place types, so the proxy cannot be turned into a general
 * Places gateway on this project's billing account.
 *
 * ## What is unchanged
 *
 * `mapGooglePlacesResponse` still runs here, on the raw Places response the
 * proxy forwards. It is the piece that knows how a Places record becomes a
 * `NearbyPlace`, it is already tested, and moving it to the server would either
 * duplicate it or strand it — so the function stays as thin as the one job it
 * exists for: holding the credential.
 *
 * The coordinates sent are rounded to five decimal places, and the proxy rounds
 * them again. A third party does not need the user's position to five decimal
 * places to find a hospital, and a proxy that trusted its caller to have rounded
 * would not be a privacy control.
 */

/** Callable name. Must match the export in `functions/src/index.ts`. */
const PROXY_FUNCTION = 'nearbyPlacesProxy';

/** The field mask and result cap now live in the function, alongside the key. */
const MAX_RADIUS_M = 50_000;

/**
 * Whether to attempt the proxy.
 *
 * The app cannot know whether the *server* has a key, so this only reports
 * whether the proxy should be tried. A server with no key answers
 * `failed-precondition`, the provider throws, and `nearbyPlacesService` moves on
 * to OpenStreetMap — which is exactly the degradation the chain exists for.
 */
export function isGooglePlacesConfigured(): boolean {
  return env.googlePlacesProxyEnabled;
}

export const googlePlacesProvider: NearbyPlacesProvider = {
  id: 'google-places',
  label: 'Google',

  isAvailable: isGooglePlacesConfigured,

  async search(query: NearbyPlacesQuery): Promise<NearbyPlace[]> {
    if (!env.googlePlacesProxyEnabled) {
      // Should be unreachable — the service checks `isAvailable` first — but a
      // provider that silently returned [] here would look like "nothing
      // nearby" rather than "not configured".
      throw new AppError('unavailable', 'Nearby places are not available right now.', {
        retryable: false,
        technicalMessage: 'googlePlacesProvider.search called while the proxy is disabled.',
      });
    }

    if (query.categories.length === 0) {
      return [];
    }

    const callProxy = httpsCallable<Record<string, unknown>, unknown>(
      getFirebaseFunctions(),
      PROXY_FUNCTION,
    );

    try {
      const result = await callProxy({
        // Rounded like the Overpass query. The proxy rounds again — see the
        // module note on why both.
        latitude: Number(query.centre.latitude.toFixed(5)),
        longitude: Number(query.centre.longitude.toFixed(5)),
        radiusM: Math.min(Math.round(query.radiusM), MAX_RADIUS_M),
        includedTypes: includedTypesFor(query.categories),
      });

      return mapGooglePlacesResponse(result.data);
    } catch (error) {
      // Thrown, never swallowed. `nearbyPlacesService` treats a throw as
      // "this provider failed, try the next one", and an empty array as the
      // honest answer "there is nothing nearby". Confusing the two would make a
      // misconfiguration look like an empty neighbourhood.
      throw new AppError('unavailable', 'Nearby places could not be looked up right now.', {
        retryable: true,
        cause: error,
        technicalMessage: `${PROXY_FUNCTION} failed.`,
      });
    }
  },
};
