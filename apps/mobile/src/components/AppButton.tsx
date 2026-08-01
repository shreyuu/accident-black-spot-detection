import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type AppButtonSize = 'medium' | 'large';

export interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Screen-reader label. Defaults to `label`; set when more context helps. */
  accessibilityLabel?: string;
  /** Screen-reader hint describing the outcome, e.g. "Opens your messaging app". */
  accessibilityHint?: string;
  /**
   * Marks the button as the chosen one in a set.
   *
   * Needed wherever a button group signals its selection by fill colour —
   * the theme picker, the category filters. Without it the selection is
   * carried by colour alone, which is exactly what this project forbids, and
   * a screen-reader user hears three identical buttons.
   */
  selected?: boolean;
  testID?: string;
  style?: ViewStyle;
}

/**
 * Primary interactive control.
 *
 * Guarantees three things every pressable in this app needs:
 *   - a touch target of at least 44pt, met via `minHeight` and hit slop;
 *   - `disabled` state communicated to assistive tech, not just visually;
 *   - presses blocked while `loading`, which prevents the double-submit that
 *     would otherwise create duplicate reports or duplicate SOS messages.
 */
export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  selected,
  testID,
  style,
}: AppButtonProps) {
  const theme = useTheme();
  const isInteractive = !disabled && !loading;

  const surfaceFor = (pressed: boolean): ViewStyle => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: pressed ? theme.colors.primaryPressed : theme.colors.primary,
        };
      case 'danger':
        return {
          backgroundColor: pressed ? theme.colors.dangerPressed : theme.colors.danger,
        };
      case 'secondary':
        return {
          backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: theme.colors.border,
        };
      case 'ghost':
        return {
          backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
        };
    }
  };

  const labelColor = variant === 'primary' || variant === 'danger' ? 'textOnPrimary' : 'primary';

  return (
    <Pressable
      onPress={onPress}
      disabled={!isInteractive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      accessibilityState={{
        disabled: !isInteractive,
        busy: loading,
        ...(selected === undefined ? {} : { selected }),
      }}
      testID={testID}
      // Extends the touchable area without growing the visual bounds.
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: size === 'large' ? 56 : theme.minTouchTarget,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.md,
        },
        surfaceFor(pressed),
        fullWidth && styles.fullWidth,
        !isInteractive && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={
              variant === 'primary' || variant === 'danger'
                ? theme.colors.textOnPrimary
                : theme.colors.primary
            }
          />
        ) : (
          <AppText variant={size === 'large' ? 'titleSmall' : 'label'} color={labelColor}>
            {label}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  // Opacity alone would be a colour-only signal, so `accessibilityState`
  // above carries the same information for screen readers.
  disabled: { opacity: 0.45 },
});
