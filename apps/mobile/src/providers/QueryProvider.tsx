import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { toAppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * TanStack Query configuration.
 *
 * Defaults are tuned for a mobile app that is frequently offline or on a poor
 * connection while travelling — which is precisely when this app matters most:
 *
 *   - `staleTime` of 5 minutes stops the map refetching black spots on every
 *     screen focus, which would waste both Firestore reads and battery.
 *   - Permission, auth and validation failures are never retried, because
 *     retrying them cannot succeed and only delays the error the user needs to
 *     see.
 *   - `gcTime` of 24 hours keeps cached data available across app restarts
 *     within a session, supporting the offline behaviour required from Phase 4.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: (failureCount, error) => {
          const appError = toAppError(error);
          if (!appError.retryable) {
            return false;
          }
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        // React Native has no window focus event; refetching on focus is
        // handled explicitly by screens that need it.
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Mutations in this app create reports and send SOS messages. Silent
        // automatic retries risk duplicate side effects, so retries are the
        // caller's explicit decision.
        retry: false,
        onError: (error) => {
          const appError = toAppError(error);
          logger.error('mutation', appError.message, appError.cause);
        },
      },
    },
  });
}

/**
 * Holds the QueryClient in state so it is created exactly once per mount.
 * Constructing it at module scope would share a cache across Fast Refresh
 * reloads and leak state between tests.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
