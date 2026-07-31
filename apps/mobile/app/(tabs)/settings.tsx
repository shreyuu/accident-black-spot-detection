import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppSwitch,
  AppText,
  ConfirmationDialog,
  DisclaimerNotice,
  ErrorState,
  LoadingIndicator,
  ScreenContainer,
} from '@/components';
import { env } from '@/config/env';
import { DRIVING_DISCLAIMER, LOCATION_ACCURACY_DISCLAIMER } from '@/constants/disclaimer';
import { BackgroundMonitoringDisclosure } from '@/features/alerts/BackgroundMonitoringDisclosure';
import { useBackgroundMonitoring } from '@/features/alerts/useBackgroundMonitoring';
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
  const router = useRouter();
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
          <AppText variant="titleSmall">Emergency contacts</AppText>
          <AppText variant="bodySmall" color="textMuted">
            The people an SOS message can be addressed to.
          </AppText>
          <AppButton
            label="Manage emergency contacts"
            variant="secondary"
            onPress={() => router.push('/emergency-contacts')}
            fullWidth
            accessibilityHint="Opens the list of people an SOS can be sent to"
          />
        </View>

        {/* ---------------------------------------------------------------- */}
        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="titleSmall">Alerts</AppText>
          <AppText variant="bodySmall" color="textMuted">
            Warning radius: {profile?.alertRadiusM ?? env.defaultAlertRadiusM} m
          </AppText>
          <AppText variant="caption" color="textSubtle">
            An adjustable radius, alert sound and haptics arrive in Phase 11.
          </AppText>
        </View>

        {/* ---------------------------------------------------------------- */}
        <BackgroundMonitoringSection />

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

/**
 * Background monitoring opt-in.
 *
 * Split into its own component so that the toggle, the disclosure and the
 * reconciliation hook live together — the invariant that matters is that the
 * disclosure is shown *before* `enable()` runs, and that is much easier to see
 * when the three are adjacent than when they are spread through the screen.
 *
 * The switch is not optimistic. It reflects the stored preference, and the
 * status line below it reports what is actually happening — because "on" while
 * the OS is refusing to grant permission would be a lie the user acts on.
 */
function BackgroundMonitoringSection() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { decision, busy, error, enable, disable, openSettings } = useBackgroundMonitoring();

  const [showDisclosure, setShowDisclosure] = useState(false);

  const optedIn = profile?.backgroundMonitoringEnabled ?? false;

  function handleToggle(next: boolean): void {
    if (next) {
      // The disclosure gates the opt-in. Nothing is requested or started until
      // it has been read and accepted.
      setShowDisclosure(true);
      return;
    }
    void disable();
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="titleSmall">Background warnings</AppText>

      <AppSwitch
        value={optedIn}
        onValueChange={handleToggle}
        label="Warn me while the app is closed"
        description="Off by default. Uses extra battery and needs background location access."
        disabled={busy || profile === null}
        testID="background-monitoring-switch"
      />

      <AppText
        variant="caption"
        color={decision.status === 'permission-blocked' ? 'danger' : 'textMuted'}
      >
        {decision.message}
      </AppText>

      {/*
        Repeated here rather than left in the disclosure alone. The disclosure is
        shown once, before opting in; this is what someone reads months later
        when they are wondering why a zone they passed did not warn them.
      */}
      {decision.status === 'active' ? (
        <AppText variant="caption" color="textSubtle">
          Covers high and critical risk areas only, from black spots already saved to this device.
          Open the map occasionally to keep that data current for where you are.
        </AppText>
      ) : null}

      {decision.status === 'permission-blocked' ? (
        <AppButton
          label="Open device settings"
          variant="secondary"
          onPress={() => void openSettings()}
          fullWidth
          accessibilityHint="Opens this app’s permissions in your device settings"
        />
      ) : null}

      {/*
        Only for the missing *background* upgrade. Re-requesting is the only way
        back for someone who dismissed the OS prompt, and on Android the request
        is a trip to Settings they may simply not have completed.

        Deliberately not offered when foreground access is what is missing: the
        request would fail, because neither platform will grant the background
        upgrade first. The message points at the map instead, which is where that
        permission is explained and asked for.
      */}
      {optedIn && decision.status === 'needs-background-permission' ? (
        <AppButton
          label="Grant background location access"
          variant="secondary"
          onPress={() => void enable()}
          loading={busy}
          fullWidth
        />
      ) : null}

      {error !== null ? <ErrorState error={error} title="Background warnings" /> : null}

      <BackgroundMonitoringDisclosure
        visible={showDisclosure}
        onAccept={() => {
          setShowDisclosure(false);
          void enable();
        }}
        onCancel={() => setShowDisclosure(false)}
        testID="background-monitoring-disclosure"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  themeButton: { flex: 1 },
});
