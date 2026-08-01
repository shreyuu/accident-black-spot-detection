import { requestJson } from '@/features/nearby-places/httpJson';
import type {
  NearbyPlace,
  NearbyPlacesProvider,
  NearbyPlacesQuery,
} from '@/features/nearby-places/nearbyPlaceTypes';
import { categoryTagFilters, mapOverpassResponse } from '@/features/nearby-places/overpassMapping';

/**
 * Nearby facilities from OpenStreetMap, via the Overpass API.
 *
 * **This is the default provider, and it needs no API key.** That is the direct
 * answer to this phase's "no secrets committed" gate rather than a convenience:
 * a mobile app cannot hold a secret at all. Every `EXPO_PUBLIC_*` value is
 * inlined into the shipped bundle by Metro and can be read out of the binary in
 * minutes, which `src/config/env.ts` already says in as many words. A provider
 * that needs no credential removes the problem instead of managing it.
 *
 * The trade-off is honest and is stated in the UI: OpenStreetMap coverage varies
 * enormously by region. It is excellent in much of Europe and patchy elsewhere.
 * A commercial provider can be enabled alongside it — see `googlePlacesProvider`
 * — and the app falls back between them.
 *
 * Data is © OpenStreetMap contributors under the ODbL. Attribution is a licence
 * condition, not a courtesy, and is rendered by the screen.
 */

/**
 * Public Overpass instance.
 *
 * `overpass-api.de` is the reference deployment. It is free, heavily used, and
 * will rate-limit or refuse under load — which is precisely why the service
 * layer treats a provider failure as recoverable rather than fatal.
 *
 * TODO(phase-14): for anything beyond demonstration this should point at an
 * instance the project runs or pays for. A public endpoint is not something to
 * build a road-safety feature's availability on.
 */
export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

/**
 * Overpass's usage policy asks for an identifying User-Agent so operators can
 * contact whoever is generating traffic. Sending a generic one is the kind of
 * thing that gets an entire app's traffic blocked.
 */
const USER_AGENT = 'AccidentBlackSpotDetection/0.1 (road-safety app; contact via repository)';

/**
 * Request timeout, in milliseconds.
 *
 * Generous, because Overpass genuinely is slow under load, but bounded well
 * inside a user's patience on a screen they may have opened in an emergency.
 */
const REQUEST_TIMEOUT_MS = 12_000;

/** Overpass's own server-side limit, in seconds. Kept below the client timeout. */
const OVERPASS_SERVER_TIMEOUT_S = 10;

/**
 * Cap on elements returned.
 *
 * A dense city centre can otherwise return thousands, all of which would be
 * parsed and then thrown away by the ranking layer's own cap. Bounding it here
 * saves the bandwidth and the parse.
 */
const MAX_ELEMENTS = 120;

/**
 * Build the Overpass QL query.
 *
 * Exported so it can be asserted in tests — a malformed query returns HTTP 400
 * with an HTML body, which is a confusing failure to debug from the app.
 *
 * Notes on the shape:
 *   - `nwr` matches nodes, ways and relations in one statement. Hospitals are
 *     usually mapped as an area rather than a point, so a node-only query would
 *     miss most of them.
 *   - `out center` asks Overpass to compute a representative point for each
 *     area, which is what `overpassMapping` reads.
 *   - `[out:json]` because the default is XML.
 */
export function buildOverpassQuery(query: NearbyPlacesQuery): string {
  const { centre, radiusM, categories } = query;
  const filters = categoryTagFilters(categories);

  // Rounded to ~1 m. Full float precision leaks a more exact position than the
  // query needs into a third party's logs, and changes the query string on
  // every GPS jitter, defeating any caching along the way.
  const latitude = centre.latitude.toFixed(5);
  const longitude = centre.longitude.toFixed(5);
  const radius = Math.round(radiusM);

  const statements = filters
    .map(
      (filter) =>
        `  nwr["${filter.key}"="${filter.value}"](around:${radius},${latitude},${longitude});`,
    )
    .join('\n');

  return `[out:json][timeout:${OVERPASS_SERVER_TIMEOUT_S}];\n(\n${statements}\n);\nout center tags ${MAX_ELEMENTS};`;
}

export const overpassProvider: NearbyPlacesProvider = {
  id: 'openstreetmap',
  label: 'OpenStreetMap',

  /** Always. No key, no configuration, nothing to be missing. */
  isAvailable: () => true,

  async search(query: NearbyPlacesQuery): Promise<NearbyPlace[]> {
    if (query.categories.length === 0) {
      return [];
    }

    const body = buildOverpassQuery(query);

    const response = await requestJson({
      url: OVERPASS_ENDPOINT,
      method: 'POST',
      // POST rather than GET: Overpass accepts both, but a long query in a URL
      // runs into length limits and is logged in full by every intermediary.
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: `data=${encodeURIComponent(body)}`,
      timeoutMs: REQUEST_TIMEOUT_MS,
      ...(query.signal === undefined ? {} : { signal: query.signal }),
      providerLabel: 'Overpass',
    });

    return mapOverpassResponse(response);
  },
};
