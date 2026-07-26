import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';
import { toAppError } from '@/utils/errors';

export interface ErrorStateProps {
  /** Any thrown value. Normalised through `toAppError` for safe display. */
  error: unknown;
  /** Retry handler. Only rendered when the error is actually retryable. */
  onRetry?: () => void;
  /** Overrides the derived message when the screen has better context. */
  title?: string;
  testID?: string;
}

/**
 * Recoverable failure state.
 *
 * Renders `AppError.userMessage` rather than a raw exception message, so SDK
 * internals never leak into the UI. The retry button appears only when the
 * error is genuinely retryable — offering "Try again" for a permission denial
 * just wastes the user's time.
 */
export function ErrorState({ error, onRetry, title, testID }: ErrorStateProps) {
  const theme = useTheme();
  const appError = toAppError(error);
  const showRetry = onRetry !== undefined && appError.retryable;

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.container, { gap: theme.spacing.sm }]}
    >
      <AppText variant="titleSmall" color="danger" center>
        {title ?? 'Something went wrong'}
      </AppText>

      <AppText variant="bodySmall" color="textMuted" center>
        {appError.userMessage}
      </AppText>

      {showRetry ? (
        <AppButton
          label="Try again"
          onPress={onRetry}
          variant="secondary"
          style={{ marginTop: theme.spacing.sm }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
});
