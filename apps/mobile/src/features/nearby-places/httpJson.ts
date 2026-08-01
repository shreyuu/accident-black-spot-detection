import { AppError } from '@/utils/errors';

/**
 * A bounded JSON request, shared by the place providers.
 *
 * This is the first code in the project to talk to a third-party HTTP API
 * directly rather than through the Firebase SDK, and the SDK was quietly doing
 * three things this has to do for itself.
 *
 * **Timeouts.** `fetch` has none. A request to a server that accepts the
 * connection and then never answers hangs indefinitely, which on this screen
 * would be a spinner that never resolves for someone who may have just had an
 * accident. Phase 5 hit the same class of bug with Storage uploads sitting at 0%
 * for eight minutes.
 *
 * **Failure that is distinguishable.** A provider failure has to be tellable
 * apart from "there is nothing near you" — see the note on `NearbyPlacesProvider`
 * — so everything here throws rather than returning an empty result.
 *
 * **Not trusting the body.** A 200 with an HTML error page is a normal thing for
 * an overloaded public API to return, and `response.json()` throws a
 * `SyntaxError` on it that says nothing useful.
 */

export interface JsonRequestOptions {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  /** Caller's own cancellation, combined with the timeout. */
  signal?: AbortSignal;
  /** Used in error messages and logs. Never include a key here. */
  providerLabel: string;
}

/**
 * Combine the caller's abort signal with an internal timeout.
 *
 * `AbortSignal.any` exists in modern runtimes but is not reliably present in
 * React Native's Hermes environment across the versions this app supports, so
 * the linking is done by hand.
 */
function withTimeout(timeoutMs: number, external?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (external !== undefined) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener('abort', onExternalAbort);
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}

/** True when the failure was the caller cancelling rather than the provider failing. */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'AbortError'
  );
}

/**
 * Perform a request and parse the JSON body.
 *
 * Always throws an `AppError` on failure, so callers can show `userMessage`
 * without translating platform errors themselves.
 */
export async function requestJson(options: JsonRequestOptions): Promise<unknown> {
  const { url, method = 'GET', headers, body, timeoutMs, signal, providerLabel } = options;

  const { signal: combined, cleanup } = withTimeout(timeoutMs, signal);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      ...(headers === undefined ? {} : { headers }),
      ...(body === undefined ? {} : { body }),
      signal: combined,
    });
  } catch (error) {
    // A caller-driven cancellation is propagated as-is: it is not a provider
    // failure and must not trigger the fallback chain or an error message.
    if (signal?.aborted === true) {
      throw error;
    }
    throw new AppError('network', 'Could not reach the place lookup service.', {
      retryable: true,
      cause: error,
      technicalMessage: isAbortError(error)
        ? `${providerLabel} did not respond within ${timeoutMs}ms.`
        : `${providerLabel} request failed: ${error instanceof Error ? error.message : 'unknown'}`,
    });
  } finally {
    cleanup();
  }

  if (!response.ok) {
    // 429 is worth its own message: public endpoints rate-limit, and telling
    // the user to wait is actionable where "something went wrong" is not.
    const rateLimited = response.status === 429;
    throw new AppError(
      'network',
      rateLimited
        ? 'The place lookup service is busy. Try again in a moment.'
        : 'The place lookup service returned an error.',
      {
        retryable: true,
        technicalMessage: `${providerLabel} responded ${response.status}.`,
      },
    );
  }

  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new AppError('unknown', 'The place lookup service returned something unreadable.', {
      retryable: true,
      cause: error,
      technicalMessage: `${providerLabel} returned a body that is not JSON.`,
    });
  }
}
