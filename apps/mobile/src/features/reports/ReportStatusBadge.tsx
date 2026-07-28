import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components';
import { REPORT_STATUS_LABELS } from '@/features/reports/reportCopy';
import { useTheme } from '@/theme';
import type { ReportStatus } from '@/types/domain';

export interface ReportStatusBadgeProps {
  status: ReportStatus;
  testID?: string;
}

/** Ionicons glyph per status, so the state survives a greyscale screenshot. */
const ICONS: Record<ReportStatus, keyof typeof Ionicons.glyphMap> = {
  draft: 'create-outline',
  pending: 'time-outline',
  approved: 'checkmark-circle-outline',
  rejected: 'close-circle-outline',
};

/**
 * Moderation state of a report.
 *
 * Text, icon and colour together — the same rule the risk badge follows, for the
 * same reason. "Awaiting review" and "Approved" differing only by hue would be
 * unreadable to a colour-blind user, and this is the piece of the screen that
 * tells someone whether their report is doing anything yet.
 */
export function ReportStatusBadge({ status, testID }: ReportStatusBadgeProps) {
  const theme = useTheme();

  const colours: Record<ReportStatus, string> = {
    draft: theme.colors.textSubtle,
    pending: theme.colors.warning,
    approved: theme.colors.success,
    rejected: theme.colors.danger,
  };

  const colour = colours[status];
  const label = REPORT_STATUS_LABELS[status];

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
      style={[
        styles.badge,
        {
          borderColor: colour,
          borderRadius: theme.radius.pill,
          gap: theme.spacing.xs,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xxs,
        },
      ]}
    >
      <Ionicons name={ICONS[status]} size={14} color={colour} />
      <AppText variant="caption" style={{ color: colour }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    flexDirection: 'row',
  },
});
