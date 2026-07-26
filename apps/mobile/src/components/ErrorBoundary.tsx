import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';
import { toAppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Identifies where the boundary sits, for log correlation. */
  scope?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Global render-error boundary.
 *
 * React unmounts the whole tree when a render throws, which without a boundary
 * means a blank white screen and no way forward. That is a bad outcome for any
 * app and a particularly bad one here, where the user may be relying on the app
 * while travelling — so the fallback always offers a way back in.
 *
 * Limits worth being explicit about: an error boundary catches errors thrown
 * during *render*, in lifecycle methods, and in constructors below it. It does
 * not catch rejected promises, errors inside event handlers, or errors thrown in
 * async callbacks. Those paths are handled with `toAppError` plus `ErrorState`
 * at the call site.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error(this.props.scope ?? 'ErrorBoundary', 'Unhandled render error', error, {
      componentStack: info.componentStack,
    });
  }

  private readonly handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    return <ErrorFallback error={error} onReset={this.handleReset} />;
  }
}

/**
 * Fallback UI.
 *
 * A function component so it can use `useTheme` — class components cannot call
 * hooks. It renders inside ThemeProvider because the boundary is mounted below
 * the provider in the root layout.
 */
function ErrorFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const theme = useTheme();
  const appError = toAppError(error);

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.container,
        { backgroundColor: theme.colors.background, gap: theme.spacing.md },
      ]}
    >
      <AppText variant="titleLarge" center>
        The app hit an unexpected problem
      </AppText>

      <AppText variant="body" color="textMuted" center>
        {appError.userMessage}
      </AppText>

      <AppButton label="Reload the app" onPress={onReset} style={{ marginTop: theme.spacing.md }} />

      {/*
        The technical message is shown in development only. In production it
        would be noise to users and could disclose internals.
      */}
      {__DEV__ ? (
        <AppText variant="caption" color="textSubtle" center style={styles.devDetail}>
          {error.message}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  devDetail: { marginTop: 16 },
});
