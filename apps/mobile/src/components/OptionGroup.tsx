import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';

export interface OptionGroupItem<T extends string> {
  value: T;
  label: string;
  /** Short explanation shown under the label. Keep it to one line. */
  hint?: string;
}

export interface OptionGroupProps<T extends string> {
  label: string;
  options: readonly OptionGroupItem<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Validation message. Its presence puts the group into an error state. */
  error?: string;
  disabled?: boolean;
  testID?: string;
}

/**
 * Single-choice list of options.
 *
 * Used instead of a native picker wheel or a dropdown because every choice stays
 * visible: a reporter at the roadside should be able to see the whole set at a
 * glance rather than scrolling a spinner, and each option can carry a hint
 * explaining what it means.
 *
 * Selection is never signalled by colour alone. The chosen row gets a filled
 * radio mark, a heavier border and `accessibilityState.checked`, so it reads
 * correctly in greyscale, in glare and with a screen reader.
 */
export function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  disabled = false,
  testID,
}: OptionGroupProps<T>) {
  const theme = useTheme();
  const hasError = error !== undefined && error.length > 0;

  return (
    <View style={styles.wrapper} testID={testID}>
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ gap: theme.spacing.sm }}
      >
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              accessibilityLabel={
                option.hint === undefined ? option.label : `${option.label}. ${option.hint}`
              }
              testID={testID === undefined ? undefined : `${testID}-${option.value}`}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: selected
                    ? theme.colors.primaryMuted
                    : pressed
                      ? theme.colors.surfaceMuted
                      : theme.colors.surface,
                  borderColor: selected
                    ? theme.colors.primary
                    : hasError
                      ? theme.colors.danger
                      : theme.colors.border,
                  borderRadius: theme.radius.md,
                  borderWidth: selected ? 2 : 1.5,
                  gap: theme.spacing.md,
                  minHeight: theme.minTouchTarget,
                  padding: theme.spacing.md,
                },
                disabled && styles.disabled,
              ]}
            >
              {/* The mark carries the selected state without relying on colour. */}
              <View
                style={[
                  styles.mark,
                  {
                    borderColor: selected ? theme.colors.primary : theme.colors.borderStrong,
                    borderRadius: theme.radius.pill,
                  },
                ]}
              >
                {selected ? (
                  <View
                    style={[
                      styles.markInner,
                      {
                        backgroundColor: theme.colors.primary,
                        borderRadius: theme.radius.pill,
                      },
                    ]}
                  />
                ) : null}
              </View>

              <View style={styles.optionText}>
                <AppText variant="body">{option.label}</AppText>
                {option.hint !== undefined ? (
                  <AppText variant="caption" color="textSubtle">
                    {option.hint}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {hasError ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  option: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  optionText: { flex: 1, gap: 2 },
  mark: {
    alignItems: 'center',
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  markInner: { height: 11, width: 11 },
  disabled: { opacity: 0.45 },
});
