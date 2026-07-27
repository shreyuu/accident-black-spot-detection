import Constants from 'expo-constants';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  ConfirmationDialog,
  DisclaimerNotice,
  ErrorState,
  LoadingIndicator,
  ScreenContainer,
} from '@/components';
import { env } from '@/config/env';
import { DRIVING_DISCLAIMER, LOCATION_ACCURACY_DISCLAIMER } from '@/constants/disclaimer';
import { useAuth } from '@/features/auth/AuthProvider';
import { logout } from '@/features/auth/authService';
import { useTheme, useThemePreference, type ThemePreference } from '@/theme';
import { toAppError, type AppError } from '@/utils/errors';

const PREFERENCES: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Settings screen — partial.
 *
 * Phase 2 adds the account section: the signed-in identity and sign-out. The
 * theme switcher remains in-memory; persisting preferences to the profile
 * document, along with alert radius, sound, haptics and background monitoring,
 * is Phase 11.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  const { user, profile, profileError, refreshProfile } = useAuth();

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signOutError, setSignOutError] = useState<AppError | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut(): Promise<void> {
    setConfirmSignOut(false);
    setSigningOut(true);
    setSignOutError(null);
    try {
      await logout();
      // No navigation needed: AuthProvider flips the session status and the tabs
      // layout redirects to the login screen.
    } catch (error) {
      setSignOutError(toAppError(error));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <ScreenContainer scrollable testID="settings-screen">
      <View style={{ gap: theme.spacing.xl }}>
        <AppText variant="titleLarge">Settings</AppText>

        {/* ---------------------------------------------------------------- */}
        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="titleSmall">Account</AppText>

          {profileError !== null ? (
            <ErrorState
              error={profileError}
              title="Could not load your profile"
              onRetry={() => void refreshProfile()}
            />
          ) : profile === null ? (
            <LoadingIndicator message="Loading your profile…" />
          ) : (
            <View style={{ gap: theme.spacing.xxs }}>
              <AppText variant="body">{profile.name}</AppText>
              <AppText variant="bodySmall" color="textMuted">
                {profile.email}
              </AppText>
              {profile.phone !== undefined ? (
                <AppText variant="bodySmall" color="textMuted">
                  {profile.phone}
                </AppText>
              ) : null}
              <AppText variant="caption" color="textSubtle">
                Signed in since {profile.createdAt?.toDate().toLocaleDateString() ?? 'recently'}
              </AppText>
            </View>
          )}

          {signOutError !== null ? (
            <ErrorState error={signOutError} title="Sign out failed" />
          ) : null}

          <AppButton
            label="Sign out"
            onPress={() => setConfirmSignOut(true)}
            variant="secondary"
            loading={signingOut}
            fullWidth
            accessibilityHint="Signs you out and returns to the sign in screen"
          />
        </View>

        {/* ---------------------------------------------------------------- */}
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

        {/* ---------------------------------------------------------------- */}
        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="titleSmall">Alerts</AppText>
          <AppText variant="bodySmall" color="textMuted">
            Warning radius: {profile?.alertRadiusM ?? env.defaultAlertRadiusM} m
          </AppText>
          <AppText variant="caption" color="textSubtle">
            An adjustable radius, alert sound, haptics and background monitoring arrive in Phase 11.
          </AppText>
        </View>

        {/* ---------------------------------------------------------------- */}
        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="titleSmall">About</AppText>
          <AppText variant="bodySmall" color="textMuted">
            Version {Constants.expoConfig?.version ?? 'unknown'} · {env.appEnv}
            {env.useFirebaseEmulator ? ' · emulator' : ''}
          </AppText>
          {user !== null ? (
            <AppText variant="caption" color="textSubtle">
              Account ID {user.uid}
            </AppText>
          ) : null}
        </View>

        {/* ---------------------------------------------------------------- */}
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

      <ConfirmationDialog
        visible={confirmSignOut}
        title="Sign out?"
        message="You will need to sign in again to submit reports or use SOS."
        confirmLabel="Sign out"
        onConfirm={() => void handleSignOut()}
        onCancel={() => setConfirmSignOut(false)}
        testID="sign-out-dialog"
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  themeButton: { flex: 1 },
});
