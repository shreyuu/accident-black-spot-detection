import { googlePlacesProvider } from '@/features/nearby-places/googlePlacesProvider';
import { isAbortError } from '@/features/nearby-places/httpJson';
import type {
  NearbyPlace,
  NearbyPlacesProvider,
  NearbyPlacesQuery,
} from '@/features/nearby-places/nearbyPlaceTypes';
import { overpassProvider } from '@/features/nearby-places/overpassProvider';
import { AppError, toAppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Choosing a provider, and surviving when it fails.
 *
 * This is where Phase 9's gate — *provider failure is recoverable* — is actually
 * met. Every provider here is a free or public service that will, sooner or
 * later, be slow, rate limited, or down, and the screen above this must not go
 * with it.
 *
 * The chain is ordered, tried in sequence, and stops at the first provider that
 * returns anything. What it deliberately does **not** do is merge results from
 * several providers by default: two sources describing the same hospital
 * slightly differently produce near-duplicates that the ranking layer can only
 * partly reconcile, and the second request costs a user on a roadside data
 * connection real time for very little.
 */

export interface NearbyPlacesResult {
  places: NearbyPlace[];
  /** The provider that produced them, for attribution. */
  providerId: NearbyPlacesProvider['id'];
  /** Providers that failed on the way, so the UI can be honest about degradation. */
  failures: { providerId: NearbyPlacesProvider['id']; message: string }[];
}

/**
 * Provider order.
 *
 * Google first **when configured**, because its coverage is more even
 * worldwide; OpenStreetMap otherwise and as the fallback, because it always
 * works and needs no credential. `isAvailable()` is what makes the default
 * configuration — no key — resolve to OpenStreetMap alone.
 */
export function resolveProviderChain(
  providers: readonly NearbyPlacesProvider[] = [googlePlacesProvider, overpassProvider],
): NearbyPlacesProvider[] {
  return providers.filter((provider) => provider.isAvailable());
}

/**
 * Query the first provider that works.
 *
 * Throws only when **every** provider failed, and the thrown error is the last
 * failure rather than a generic one, so the user sees something specific.
 *
 * An empty result from a provider that succeeded is **not** a failure and does
 * not advance the chain: "there is no hospital within 5 km" is a real answer,
 * and re-asking a second provider for it would make an honest empty state look
 * like a bug and cost a second round trip.
 *
 * A caller-initiated abort is rethrown immediately and never triggers a
 * fallback — the user navigated away or changed the filter, and hammering the
 * next provider on their way out is pure waste.
 */
export async function fetchNearbyPlaces(
  query: NearbyPlacesQuery,
  providers: readonly NearbyPlacesProvider[] = resolveProviderChain(),
): Promise<NearbyPlacesResult> {
  if (query.categories.length === 0) {
    return { places: [], providerId: 'openstreetmap', failures: [] };
  }

  if (providers.length === 0) {
    throw new AppError('unavailable', 'No place lookup service is configured.', {
      technicalMessage: 'resolveProviderChain() produced an empty chain.',
    });
  }

  const failures: NearbyPlacesResult['failures'] = [];
  let lastError: unknown;

  for (const provider of providers) {
    try {
      const places = await provider.search(query);

      if (failures.length > 0) {
        logger.info('nearbyPlacesService', 'Recovered using a fallback provider', {
          providerId: provider.id,
          failedProviders: failures.map((failure) => failure.providerId),
        });
      }

      return { places, providerId: provider.id, failures };
    } catch (error) {
      if (query.signal?.aborted === true || isAbortError(error)) {
        throw error;
      }

      lastError = error;
      const appError = toAppError(error);
      failures.push({ providerId: provider.id, message: appError.userMessage });

      logger.warn('nearbyPlacesService', 'A place provider failed; trying the next', {
        providerId: provider.id,
        // `AppError.message` carries the technical detail. It never contains the
        // API key: the providers pass a fixed label, never an interpolated URL.
        error: appError.message,
      });
    }
  }

  // Every provider failed. The cache is the next line of defence, and the hook
  // above reaches for it when this throws.
  throw toAppError(lastError);
}
