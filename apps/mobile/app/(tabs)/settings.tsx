import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, DisclaimerNotice, ScreenContainer } from '@/components';
import { env } from '@/config/env';
import { DRIVING_DISCLAIMER, LOCATION_ACCURACY_DISCLAIMER } from '@/constants/disclaimer';
import { useTheme, useThemePreference, type ThemePreference } from '@/theme';

const PREFERENCES: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Settings screen — partial.
 *
 * The theme switcher is real and functional in Phase 1, because it is the only
 * way to verify that light and dark render correctly across every component.
 * The remaining settings (alert radius, sound, haptics, background monitoring,
 * font scaling, privacy controls) arrive in Phase 11, and the preference is
 * persisted then — right now it lives in memory and resets on relaunch.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();

  return (
    <ScreenContainer scrollable testID="settings-screen">
      <View style={{ gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.md }}>
          <AppText variant="titleLarge">Settings</AppText>

          <View style={{ gap: theme.spacing.sm }}>
            <AppText variant="titleSmall">Appearance</AppText>
            <AppText variant="caption" color="textSubtle">
              Not saved yet — persistence arrives in Phase 11.
            </AppText>

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              {PREFERENCES.map((option) => (
                <AppButton
                  key={option.value}
                  label={option.label}
                  onPress={() => setPreference(option.value)}
                  variant={preference === option.value ? 'primary' : 'secondary'}
                  accessibilityLabel={`${option.label} theme`}
                  accessibilityHint={
                    preference === option.value ? 'Currently selected' : 'Switches the app theme'
                  }
                  style={styles.themeButton}
                />
              ))}
            </View>
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="titleSmall">Alerts</AppText>
          <AppText variant="bodySmall" color="textMuted">
            Default warning radius: {env.defaultAlertRadiusM} m
          </AppText>
          <AppText variant="caption" color="textSubtle">
            An adjustable radius, alert sound, haptics and background monitoring arrive in Phase 11.
          </AppText>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="titleSmall">About</AppText>
          <AppText variant="bodySmall" color="textMuted">
            Version {Constants.expoConfig?.version ?? 'unknown'} · {env.appEnv}
          </AppText>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="titleSmall">Safety information</AppText>
          <DisclaimerNotice />
          <AppText variant="caption" color="textSubtle">
            {DRIVING_DISCLAIMER}
          </AppText>
          <AppText variant="caption" color="textSubtle">
            {LOCATION_ACCURACY_DISCLAIMER}
          </AppText>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  themeButton: { flex: 1 },
});
