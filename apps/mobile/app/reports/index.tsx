import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import {
  AppText,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  LoadingIndicator,
  ScreenContainer,
} from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { DraftListItem } from '@/features/reports/DraftListItem';
import type { StoredDraft } from '@/features/reports/draftStore';
import { ReportListItem } from '@/features/reports/ReportListItem';
import { useDraftQueue } from '@/features/reports/useDraftQueue';
import { useMyReports } from '@/features/reports/useMyReports';
import type { IncidentReport } from '@/types/domain';
import { useTheme } from '@/theme';
import { useNow } from '@/utils/useNow';

/**
 * The reports this user has submitted, and what became of them.
 *
 * Only ever the user's own: the query filters on `reporterId` and the security
 * rules refuse anything wider, so there is no route through this screen to
 * somebody else's report.
 *
 * The header text is deliberate rather than decorative. Someone checking back on
 * a report they filed days ago is asking whether it is doing any good, and the
 * answer for a pending report is "not yet, and it will not until a moderator
 * approves it". Saying that plainly is better than letting the list imply
 * otherwise.
 *
 * ## Drafts sit above submitted reports
 *
 * Phase 11 added unsent drafts to the top of this list. They are the ones that
 * need the user's attention — a submitted report is somebody else's move now,
 * while a draft is still theirs. They are rendered as a visibly different kind
 * of row and are never counted among the submitted reports.
 */

/** Discriminated so one FlatList can render both kinds without a cast. */
type Row =
  | { kind: 'draft'; key: string; draft: StoredDraft }
  | { kind: 'report'; key: string; report: IncidentReport };

export default function MyReportsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const reporterId = user?.uid ?? null;
  const { reports, loading, refreshing, error, refetch } = useMyReports(reporterId);
  const { drafts, sendingIds, retry, discard, refresh, expiredCount } = useDraftQueue();

  const [pendingDiscard, setPendingDiscard] = useState<StoredDraft | null>(null);

  // Via `useNow`, not `Date.now()`: reading the clock during render is impure
  // and the React Compiler rules reject it. A minute is coarse enough — the
  // backoff windows this feeds are measured in tens of seconds upwards, and a
  // faster tick would re-render the whole list for no visible change.
  const now = useNow(60_000);
  const retryContext = { now, isOnline: true, currentUserId: reporterId };

  const rows: Row[] = [
    ...drafts.map((draft): Row => ({ kind: 'draft', key: draft.record.id, draft })),
    ...reports.map((report): Row => ({ kind: 'report', key: report.id, report })),
  ];

  if (loading && drafts.length === 0) {
    return (
      <ScreenContainer testID="my-reports-loading">
        <LoadingIndicator fullscreen message="Loading your reports…" />
      </ScreenContainer>
    );
  }

  // Only fatal when there is nothing at all to show. Drafts are local, so they
  // are still worth rendering when the network read failed.
  if (error !== null && rows.length === 0) {
    return (
      <ScreenContainer testID="my-reports-error">
        <ErrorState error={error} title="Could not load your reports" onRetry={refetch} />
      </ScreenContainer>
    );
  }

  return (
    <>
      <FlatList
        testID="my-reports"
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
        data={rows}
        keyExtractor={(row) => row.key}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              refetch();
              void refresh();
            }}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.sm }}>
            <AppText variant="bodySmall" color="textMuted">
              Reports are reviewed by a moderator. A report that has not been approved is not shown
              to anyone else and does not appear as a black spot.
            </AppText>

            {drafts.length > 0 ? (
              <AppText variant="caption" color="textMuted">
                {drafts.length === 1
                  ? '1 report is saved on this device and has not been sent yet.'
                  : `${drafts.length} reports are saved on this device and have not been sent yet.`}{' '}
                They are sent automatically next time you open the app with a connection.
              </AppText>
            ) : null}

            {/*
              Said explicitly. Work vanishing without explanation is the exact
              experience drafts exist to prevent, so their removal is announced
              too.
            */}
            {expiredCount > 0 ? (
              <AppText variant="caption" color="danger">
                {expiredCount === 1
                  ? '1 unsent report was removed because it was more than two weeks old.'
                  : `${expiredCount} unsent reports were removed because they were more than two weeks old.`}
              </AppText>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="You have not submitted any reports"
            description="Reporting what you see helps moderators decide where warnings are needed."
            action={{
              label: 'Report an incident',
              onPress: () => router.replace('/(tabs)/report'),
            }}
            testID="my-reports-empty"
          />
        }
        renderItem={({ item }) =>
          item.kind === 'draft' ? (
            <DraftListItem
              draft={item.draft}
              context={retryContext}
              sending={sendingIds.includes(item.draft.record.id)}
              onRetry={(draftId) => void retry(draftId)}
              onDiscard={setPendingDiscard}
            />
          ) : (
            <ReportListItem report={item.report} testID={`report-${item.report.id}`} />
          )
        }
      />

      {/*
        Confirmed, because this is the user's own account of something that
        happened and it cannot be reconstructed once deleted.
      */}
      <ConfirmationDialog
        visible={pendingDiscard !== null}
        title="Discard this report?"
        message="It has never been sent, and deleting it here removes it permanently. Nobody else has seen it."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          const draft = pendingDiscard;
          setPendingDiscard(null);
          if (draft !== null) {
            void discard(draft.record.id);
          }
        }}
        onCancel={() => setPendingDiscard(null)}
        testID="discard-draft-dialog"
      />
    </>
  );
}
