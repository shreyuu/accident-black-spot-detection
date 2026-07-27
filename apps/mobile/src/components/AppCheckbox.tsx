import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';

export interface AppCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Validation message. Its presence puts the control into an error state. */
  error?: string;
  testID?: string;
}

/**
 * Labelled checkbox.
 *
 * React Native has no built-in checkbox, and the community ones pull in native
 * dependencies for what is a small amount of markup.
 *
 * Accessibility details that matter here: the role is `checkbox` with
 * `accessibilityState.checked`, so a screen reader announces the state rather
 * than just the label; the whole row is the touch target, not only the box; and
 * the error is conveyed as text as well as colour.
 */
export function AppCheckbox({ checked, onChange, label, error, testID }: AppCheckboxProps) {
  const theme = useTheme();
  const hasError = error !== undefined && error.length > 0;

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Pressable
        testID={testID}
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        hitSlop={8}
        style={[styles.row, { gap: theme.spacing.md, minHeight: theme.minTouchTarget }]}
      >
        <View
          style={[
            styles.box,
            {
              backgroundColor: checked ? theme.colors.primary : 'transparent',
              borderColor: hasError
                ? theme.colors.danger
                : checked
                  ? theme.colors.primary
                  : theme.colors.borderStrong,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          {checked ? (
            <Ionicons name="checkmark" size={16} color={theme.colors.textOnPrimary} />
          ) : null}
        </View>

        <AppText variant="bodySmall" color="textMuted" style={styles.label}>
          {label}
        </AppText>
      </Pressable>

      {hasError ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  box: {
    alignItems: 'center',
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  label: { flex: 1 },
});
