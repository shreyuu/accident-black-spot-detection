import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';

import { AppText, EmptyState, ErrorState, LoadingIndicator, ScreenContainer } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { ReportListItem } from '@/features/reports/ReportListItem';
import { useMyReports } from '@/features/reports/useMyReports';
import { useTheme } from '@/theme';

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
 */
export default function MyReportsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const reporterId = user?.uid ?? null;
  const { reports, loading, refreshing, error, refetch } = useMyReports(reporterId);

  if (loading) {
    return (
      <ScreenContainer testID="my-reports-loading">
        <LoadingIndicator fullscreen message="Loading your reports…" />
      </ScreenContainer>
    );
  }

  if (error !== null && reports.length === 0) {
    return (
      <ScreenContainer testID="my-reports-error">
        <ErrorState error={error} title="Could not load your reports" onRetry={refetch} />
      </ScreenContainer>
    );
  }

  return (
    <FlatList
      testID="my-reports"
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
      }}
      data={reports}
      keyExtractor={(report) => report.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refetch}
          tintColor={theme.colors.primary}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.sm }}>
          <AppText variant="bodySmall" color="textMuted">
            Reports are reviewed by a moderator. A report that has not been approved is not shown to
            anyone else and does not appear as a black spot.
          </AppText>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          title="You have not submitted any reports"
          description="Reporting what you see helps moderators decide where warnings are needed."
          action={{ label: 'Report an incident', onPress: () => router.replace('/(tabs)/report') }}
          testID="my-reports-empty"
        />
      }
      renderItem={({ item }) => <ReportListItem report={item} testID={`report-${item.id}`} />}
    />
  );
}
