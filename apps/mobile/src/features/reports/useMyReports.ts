import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { fetchMyReports } from '@/features/reports/reportRepository';
import type { IncidentReport } from '@/types/domain';
import { toAppError, type AppError } from '@/utils/errors';

/**
 * The signed-in user's own reports.
 *
 * There is deliberately no offline cache here, unlike black spots. A saved copy
 * of black spots is worth having because an out-of-date warning still helps;
 * a saved copy of report *statuses* would do the opposite, showing "awaiting
 * review" for something a moderator has since rejected. Report state is only
 * ever shown when it has actually been read from the server.
 */

/** Query key factory, so the submission flow can invalidate this precisely. */
export const myReportsQueryKey = (reporterId: string | null) =>
  ['incidentReports', 'mine', reporterId] as const;

export interface UseMyReportsResult {
  reports: IncidentReport[];
  loading: boolean;
  refreshing: boolean;
  error: AppError | null;
  refetch: () => void;
}

export function useMyReports(reporterId: string | null): UseMyReportsResult {
  const query = useQuery({
    queryKey: myReportsQueryKey(reporterId),
    enabled: reporterId !== null,
    queryFn: async () => {
      if (reporterId === null) {
        return [];
      }
      return fetchMyReports(reporterId);
    },
    /**
     * Deliberately overrides the app-wide five-minute `staleTime` (see
     * QueryProvider), which is right for black spots and wrong here.
     *
     * Found on the simulator: with the global default, a report moderated while
     * the app was open kept showing its previous status until the cache expired.
     * A reporter told "awaiting review" about something already rejected has
     * been misinformed by the app, and the whole point of this screen is to say
     * truthfully where a report stands. Black spots can be stale and labelled as
     * such; a moderation status cannot.
     */
    staleTime: 0,
    refetchOnMount: 'always',
  });

  return {
    reports: query.data ?? [],
    loading: query.isLoading,
    refreshing: query.isFetching && !query.isLoading,
    error: query.error === null ? null : toAppError(query.error),
    refetch: () => {
      void query.refetch();
    },
  };
}

/**
 * Invalidate the history list.
 *
 * Called after a successful submission so the new report is visible the moment
 * the user opens My reports, rather than after a manual pull-to-refresh that
 * they have no reason to know is needed.
 */
export function useInvalidateMyReports(): (reporterId: string | null) => void {
  const queryClient = useQueryClient();

  return useCallback(
    (reporterId: string | null) => {
      void queryClient.invalidateQueries({ queryKey: myReportsQueryKey(reporterId) });
    },
    [queryClient],
  );
}
