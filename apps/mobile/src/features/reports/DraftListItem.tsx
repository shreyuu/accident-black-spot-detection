import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText } from '@/components';
import { describeDraftStatus, type RetryContext } from '@/features/reports/draftQueue';
import type { StoredDraft } from '@/features/reports/draftStore';
import { INCIDENT_TYPE_LABELS } from '@/features/reports/reportCopy';
import { useTheme } from '@/theme';

export interface DraftListItemProps {
  draft: StoredDraft;
  context: RetryContext;
  sending: boolean;
  onRetry: (draftId: string) => void;
  onDiscard: (draft: StoredDraft) => void;
}

/**
 * One unsent report.
 *
 * The thing this row must never do is look like a submitted report. It carries
 * a distinct label ("Not sent yet"), its own icon, and a status line that says
 * what is actually happening — because a user who believes they have reported a
 * hazard and has not is worse off than one who knows it is still waiting.
 *
 * Discard is offered but is guarded by a confirmation upstream: this is the
 * user's own observation of something that happened, and it cannot be
 * reconstructed once it is gone.
 */
export function DraftListItem({ draft, context, sending, onRetry, onDiscard }: DraftListItemProps) {
  const theme = useTheme();
  const { record, values, images } = draft;

  const status = sending ? 'Sending…' : describeDraftStatus(record, context);
  const created = new Date(record.createdAt).toLocaleString();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          // A dashed border, not just a colour: this row is visibly a different
          // kind of thing from a submitted report even in greyscale.
          borderColor: theme.colors.borderStrong,
          borderRadius: theme.radius.md,
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
        },
      ]}
      testID={`draft-${record.id}`}
    >
      <View style={[styles.header, { gap: theme.spacing.sm }]}>
        <Ionicons
          name="cloud-offline-outline"
          size={20}
          color={theme.colors.textMuted}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View style={styles.headerText}>
          <AppText variant="titleSmall">{INCIDENT_TYPE_LABELS[values.type]}</AppText>
          {/* Stated in words, never left to the icon or the border style. */}
          <AppText variant="caption" color="textMuted">
            Not sent yet · saved {created}
          </AppText>
        </View>
      </View>

      <AppText variant="bodySmall" color="textMuted" numberOfLines={2}>
        {values.description}
      </AppText>

      {images.length > 0 ? (
        <AppText variant="caption" color="textSubtle">
          {images.length === 1 ? '1 photo attached' : `${images.length} photos attached`}
        </AppText>
      ) : null}

      <AppText variant="bodySmall" accessibilityLiveRegion="polite">
        {status}
      </AppText>

      <View style={[styles.actions, { gap: theme.spacing.sm }]}>
        <AppButton
          label="Try now"
          variant="secondary"
          onPress={() => onRetry(record.id)}
          loading={sending}
          style={styles.action}
          accessibilityLabel={`Try sending this ${INCIDENT_TYPE_LABELS[values.type].toLowerCase()} report now`}
        />
        <AppButton
          label="Discard"
          variant="ghost"
          onPress={() => onDiscard(draft)}
          disabled={sending}
          style={styles.action}
          accessibilityHint="Deletes this report without sending it"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderStyle: 'dashed', borderWidth: 2 },
  header: { alignItems: 'center', flexDirection: 'row' },
  headerText: { flex: 1 },
  actions: { flexDirection: 'row' },
  action: { flex: 1 },
});
