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
import { AlertRadiusPicker } from '@/features/settings/AlertRadiusPicker';
import { usePreferences } from '@/features/settings/usePreferences';
import { useTheme, useThemePreference, type ThemePreference } from '@/theme';
import { toAppError, type AppError } from '@/utils/errors';

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Settings screen.
 *
 * Phase 11 made every preference here persistent — saved to the account and
 * mirrored locally, so a choice survives a restart and applies with no signal.
 * Each section is its own component so the hook that owns its state sits next
 * to the controls that change it.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
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
        <AppearanceSection />

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
        <AlertsSection />

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
 * Theme choice, now persisted.
 *
 * Two stores are written, not one. `usePreferences` records the choice on the
 * account and in the local mirror; `setPreference` applies it to the live theme
 * immediately. The theme provider sits *above* `AuthProvider` — it has to, so
 * the app is themed before there is a session — so it cannot read preferences
 * through this hook, and hydrates from the same local store on launch instead.
 */
function AppearanceSection() {
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  const { preferences, update, saving } = usePreferences();

  // The live theme is what the user sees, so it wins if the two ever disagree —
  // which happens for a frame after launch, before hydration completes.
  const selected = preference;

  function choose(next: ThemePreference): void {
    setPreference(next);
    void update({ darkModePreference: next });
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="titleSmall">Appearance</AppText>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {THEME_OPTIONS.map((option) => {
          const isSelected = selected === option.value;
          return (
            <AppButton
              key={option.value}
              label={option.label}
              onPress={() => choose(option.value)}
              variant={isSelected ? 'primary' : 'secondary'}
              disabled={saving}
              accessibilityLabel={`${option.label} theme`}
              selected={isSelected}
              accessibilityHint={
                isSelected ? 'Currently selected' : 'Switches the app theme and saves it'
              }
              style={styles.themeButton}
            />
          );
        })}
      </View>

      {preferences.darkModePreference !== selected ? (
        <AppText variant="caption" color="textSubtle">
          Saving your choice…
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * Alert behaviour: how far ahead, and through which channels.
 *
 * Every control here changes whether or how the user is warned, so each one
 * says what switching it off actually costs rather than being a bare toggle.
 * The in-app banner is deliberately not switchable: it is the one channel that
 * always works, and an app whose warnings can be turned off entirely while
 * still appearing to run would be worse than one that says so.
 */
function AlertsSection() {
  const theme = useTheme();
  const { preferences, update, saving, syncError, ready } = usePreferences();

  return (
    <View style={{ gap: theme.spacing.md }}>
      <AppText variant="titleSmall">Alerts</AppText>

      <View style={{ gap: theme.spacing.xs }}>
        <AppText variant="label" color="textMuted">
          Warn me this far ahead
        </AppText>
        <AlertRadiusPicker
          value={preferences.alertRadiusM}
          onChange={(metres) => void update({ alertRadiusM: metres })}
          disabled={!ready || saving}
        />
      </View>

      <AppSwitch
        value={preferences.alertsEnabled}
        onValueChange={(next) => void update({ alertsEnabled: next })}
        label="Warn me about black spots"
        description="Turning this off stops all proximity warnings, including background ones."
        disabled={!ready || saving}
        testID="alerts-enabled-switch"
      />

      <AppSwitch
        value={preferences.soundEnabled}
        onValueChange={(next) => void update({ soundEnabled: next })}
        label="Play a sound"
        description="Only affects the notification. Your phone's silent switch still applies."
        disabled={!ready || saving || !preferences.alertsEnabled}
        testID="sound-enabled-switch"
      />

      <AppSwitch
        value={preferences.hapticsEnabled}
        onValueChange={(next) => void update({ hapticsEnabled: next })}
        label="Vibrate"
        description="Not every device has a vibration motor."
        disabled={!ready || saving || !preferences.alertsEnabled}
        testID="haptics-enabled-switch"
      />

      <AppText variant="caption" color="textSubtle">
        The on-screen warning cannot be switched off. It is the only channel that always works.
      </AppText>

      {/*
        A sync failure does not revert the setting — it is applied locally and
        the user keeps it. What they must not be left believing is that it
        reached their account, so it is said plainly.
      */}
      {syncError !== null ? (
        <AppText variant="caption" color="danger">
          Saved on this device, but not to your account yet. It will sync when you are back online.
        </AppText>
      ) : null}
    </View>
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
