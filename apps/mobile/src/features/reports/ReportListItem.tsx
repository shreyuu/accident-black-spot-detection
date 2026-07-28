import { Image, StyleSheet, View } from 'react-native';

import { AppText } from '@/components';
import {
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_TYPE_LABELS,
  REPORT_STATUS_DESCRIPTIONS,
} from '@/features/reports/reportCopy';
import { ReportStatusBadge } from '@/features/reports/ReportStatusBadge';
import { useTheme } from '@/theme';
import type { IncidentReport } from '@/types/domain';

export interface ReportListItemProps {
  report: IncidentReport;
  testID?: string;
}

/**
 * Format a Firestore timestamp for display.
 *
 * A `null` timestamp is not an error and must not render as one: a
 * `serverTimestamp()` sentinel reads back as `null` from the local echo of a
 * write until the server confirms it, which is a real state a user can see
 * within a second of submitting.
 */
function formatTimestamp(timestamp: IncidentReport['createdAt']): string | null {
  if (timestamp === null || timestamp === undefined) {
    return null;
  }
  return timestamp.toDate().toLocaleString();
}

/**
 * One report in the history list.
 *
 * Always states what the status means, not just what it is. "Awaiting review"
 * alone invites the assumption that the report is already warning other people;
 * the description under it says plainly that it is not.
 */
export function ReportListItem({ report, testID }: ReportListItemProps) {
  const theme = useTheme();

  const submittedAt = formatTimestamp(report.createdAt);
  const occurredAt = formatTimestamp(report.occurredAt ?? null);

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
        },
      ]}
    >
      <View style={styles.header}>
        <AppText variant="titleSmall" style={styles.title}>
          {INCIDENT_TYPE_LABELS[report.type]}
        </AppText>
        <ReportStatusBadge status={report.status} testID={`${testID ?? 'report'}-status`} />
      </View>

      <AppText variant="bodySmall" color="textMuted">
        {report.description}
      </AppText>

      {report.imageUrls.length > 0 ? (
        <View style={styles.thumbnails}>
          {report.imageUrls.map((url, index) => (
            <Image
              key={url}
              source={{ uri: url }}
              style={[styles.thumbnail, { borderRadius: theme.radius.sm }]}
              accessibilityIgnoresInvertColors
              accessible
              accessibilityLabel={`Photo ${index + 1} attached to this report`}
            />
          ))}
        </View>
      ) : null}

      <View style={{ gap: theme.spacing.xxs }}>
        <AppText variant="caption" color="textSubtle">
          {`Severity you reported: ${INCIDENT_SEVERITY_LABELS[report.severity]}`}
        </AppText>
        <AppText variant="caption" color="textSubtle">
          {submittedAt === null ? 'Sending…' : `Submitted ${submittedAt}`}
        </AppText>
        {occurredAt !== null ? (
          <AppText variant="caption" color="textSubtle">
            {`Happened ${occurredAt}`}
          </AppText>
        ) : null}
      </View>

      <View
        style={{
          backgroundColor: theme.colors.surfaceMuted,
          borderRadius: theme.radius.sm,
          gap: theme.spacing.xxs,
          padding: theme.spacing.md,
        }}
      >
        <AppText variant="caption" color="textMuted">
          {REPORT_STATUS_DESCRIPTIONS[report.status]}
        </AppText>

        {report.moderationNotes !== undefined ? (
          <AppText variant="caption" color="textMuted">
            {`Moderator's note: ${report.moderationNotes}`}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  title: { flexShrink: 1 },
  thumbnails: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbnail: { height: 72, width: 72 },
});
