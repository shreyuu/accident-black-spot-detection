import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';

export interface AppTextInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Validation message. Its presence puts the field into an error state. */
  error?: string;
  /** Guidance shown below the field when there is no error. */
  hint?: string;
  /** Appends a visible "(optional)" marker. Required is the assumed default. */
  optional?: boolean;
  /**
   * Minimum height in points, for multiline fields.
   *
   * `numberOfLines` does not size a `multiline` TextInput on iOS, so a free-text
   * field would otherwise render one line tall and give no visual cue that a
   * longer answer is wanted — which matters where the copy asks for detail.
   */
  minHeight?: number;
}

/**
 * Labelled text field.
 *
 * Deliberate accessibility choices:
 *   - The label is a real visible label, not a placeholder. Placeholder-only
 *     fields lose their label the moment the user types.
 *   - Error state is conveyed by a border colour *and* a text message, so it is
 *     not colour-only.
 *   - The error text is linked to the field via `accessibilityLabel` on the
 *     wrapper, so a screen reader announces the problem with the field rather
 *     than as an unrelated string somewhere on screen.
 */
export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(function AppTextInput(
  { label, error, hint, optional = false, minHeight, ...rest },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const hasError = error !== undefined && error.length > 0;
  const borderColor = hasError
    ? theme.colors.danger
    : focused
      ? theme.colors.primary
      : theme.colors.border;

  const describedBy = hasError ? error : hint;

  return (
    <View style={styles.wrapper}>
      <AppText variant="label" color="textMuted" style={styles.label}>
        {optional ? `${label} (optional)` : label}
      </AppText>

      <TextInput
        ref={ref}
        accessibilityLabel={label}
        {...(describedBy === undefined ? {} : { accessibilityHint: describedBy })}
        placeholderTextColor={theme.colors.textSubtle}
        onFocus={(event) => {
          setFocused(true);
          rest.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          rest.onBlur?.(event);
        }}
        style={[
          theme.typography.body,
          styles.input,
          {
            backgroundColor: theme.colors.surface,
            borderColor,
            borderRadius: theme.radius.md,
            color: theme.colors.text,
            minHeight: minHeight ?? theme.minTouchTarget,
            paddingHorizontal: theme.spacing.md,
          },
        ]}
        {...rest}
      />

      {hasError ? (
        <AppText variant="caption" color="danger" style={styles.message}>
          {error}
        </AppText>
      ) : hint !== undefined ? (
        <AppText variant="caption" color="textSubtle" style={styles.message}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: {},
  input: {
    borderWidth: 1.5,
    paddingVertical: 10,
  },
  message: {},
});
