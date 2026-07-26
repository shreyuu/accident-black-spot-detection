import { View } from 'react-native';

import { AppText, EmptyState, ScreenContainer } from '@/components';
import { useTheme } from '@/theme';

/**
 * Incident report screen — placeholder.
 *
 * Phase 5 adds the report form (type, description, severity, location with
 * optional manual adjustment, optional occurrence time, optional photo), Firebase
 * Storage upload with progress and retry, and the "My Reports" history view.
 *
 * Submitted reports are stored with status `pending`. They are never converted
 * into public black spots automatically — an administrator must approve them
 * first, which is what stops the reporting flow from being a way to publish
 * unverified warnings.
 */
export default function ReportScreen() {
  const theme = useTheme();

  return (
    <ScreenContainer scrollable testID="report-screen">
      <View style={{ gap: theme.spacing.lg }}>
        <AppText variant="titleLarge">Report an incident</AppText>
        <AppText variant="bodySmall" color="textMuted">
          Reports are reviewed by a moderator before they can appear as a black spot.
        </AppText>

        <EmptyState
          title="Reporting arrives in Phase 5"
          description="The form, photo upload and report history are added there."
        />
      </View>
    </ScreenContainer>
  );
}
