import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';

export interface EmptyStateProps {
  title: string;
  /** Explains why the list is empty and what the user can do about it. */
  description?: string;
  action?: { label: string; onPress: () => void };
  testID?: string;
}

/**
 * "Nothing here yet" state.
 *
 * Distinct from ErrorState on purpose: an empty list is a normal outcome, and
 * dressing it up as a failure teaches users to distrust the app. Copy should be
 * neutral and, where possible, point at the next useful action.
 */
export function EmptyState({ title, description, action, testID }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View testID={testID} style={[styles.container, { gap: theme.spacing.sm }]}>
      <AppText variant="titleSmall" center>
        {title}
      </AppText>

      {description !== undefined ? (
        <AppText variant="bodySmall" color="textMuted" center>
          {description}
        </AppText>
      ) : null}

      {action !== undefined ? (
        <AppButton
          label={action.label}
          onPress={action.onPress}
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
