import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';

export interface ProgressBarProps {
  /** 0–1. Values outside the range are clamped rather than overflowing. */
  fraction: number;
  /** Describes what is progressing, e.g. "Uploading photo 1 of 2". */
  label: string;
  testID?: string;
}

/**
 * Determinate progress indicator.
 *
 * The percentage is written out as text next to the bar, not conveyed by the
 * fill alone: a bar that appears stuck is the most common reason a user force
 * quits mid-upload, and a number that is still climbing is the only reassurance
 * that anything is happening. `accessibilityValue` carries the same figure to a
 * screen reader.
 */
export function ProgressBar({ fraction, label, testID }: ProgressBarProps) {
  const theme = useTheme();

  const safeFraction = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const percent = Math.round(safeFraction * 100);

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={{ gap: theme.spacing.xs }}
    >
      <View style={styles.row}>
        <AppText variant="caption" color="textMuted" style={styles.label}>
          {label}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {percent}%
        </AppText>
      </View>

      <View
        style={[
          styles.track,
          { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill },
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              backgroundColor: theme.colors.primary,
              borderRadius: theme.radius.pill,
              width: `${percent}%`,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  label: { flexShrink: 1 },
  track: { height: 8, overflow: 'hidden', width: '100%' },
  fill: { height: '100%' },
});
