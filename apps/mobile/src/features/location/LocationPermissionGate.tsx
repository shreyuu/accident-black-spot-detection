import { View } from 'react-native';

import { AppText, ErrorState, LoadingIndicator, PermissionCard } from '@/components';
import type { LocationPermissionStatus } from '@/features/location/locationService';
import { useTheme } from '@/theme';
import type { AppError } from '@/utils/errors';

export interface LocationPermissionGateProps {
  permission: LocationPermissionStatus;
  error: AppError | null;
  initialising: boolean;
  onRequestAccess: () => void;
  onOpenSettings: () => void;
  onRetry: () => void;
}

/**
 * Explains and requests foreground location, handling each permission state.
 *
 * The four states get genuinely different treatment because the way out differs:
 *
 *   - `undetermined` — show the explanation, then the OS dialog.
 *   - `denied` — the same explanation, with copy acknowledging the refusal.
 *     Asking again is still possible (Android; iOS reaches `blocked` at once).
 *   - `blocked` — no in-app prompt can help, so offer system Settings instead of
 *     a button that would appear to do nothing.
 *   - `granted` but errored — a permission problem is not the cause, so show the
 *     error with a retry.
 *
 * Returns `null` when access is granted and working, letting the caller render
 * the map.
 */
export function LocationPermissionGate({
  permission,
  error,
  initialising,
  onRequestAccess,
  onOpenSettings,
  onRetry,
}: LocationPermissionGateProps) {
  const theme = useTheme();

  if (initialising) {
    return <LoadingIndicator fullscreen message="Checking location access…" />;
  }

  if (permission === 'granted') {
    // Permission is fine, so any error here is a device or sensor problem —
    // location services switched off, or no fix available.
    if (error !== null) {
      return (
        <View style={{ padding: theme.spacing.lg }}>
          <ErrorState error={error} title="Could not find your location" onRetry={onRetry} />
        </View>
      );
    }
    return null;
  }

  if (permission === 'blocked') {
    return (
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <PermissionCard
          title="Location access is turned off"
          reason="Without your location the app cannot tell you when you are approaching a known accident-prone or crime-prone area."
          dataUsage="Your position is used on your device to measure distance to nearby black spots. It is not uploaded and no location history is stored."
          optOut="You can turn this off again at any time in your device settings."
          primaryAction={{ label: 'Open settings', onPress: onOpenSettings }}
          testID="permission-blocked"
        />
        <AppText variant="caption" color="textSubtle">
          This app can no longer ask for permission directly — it has to be changed in your device
          settings.
        </AppText>
      </View>
    );
  }

  const wasDenied = permission === 'denied';

  return (
    <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
      <PermissionCard
        title={wasDenied ? 'Location access is needed' : 'Allow location access'}
        reason={
          wasDenied
            ? 'Without your location the app cannot warn you about nearby accident-prone or crime-prone areas. Everything else still works.'
            : 'Your location is used to warn you when you approach a place where accidents or crimes have been reported.'
        }
        dataUsage="Your position is compared with nearby black spots on your device. It is not uploaded to our servers, and no location history is kept."
        optOut="You can turn this off at any time in your device settings, and the app will keep working without warnings."
        primaryAction={{
          label: wasDenied ? 'Try again' : 'Allow location access',
          onPress: onRequestAccess,
        }}
        testID="permission-request"
      />

      <AppText variant="caption" color="textSubtle">
        You will be asked by your device next. Only foreground access is requested — background
        monitoring is a separate, optional setting.
      </AppText>
    </View>
  );
}
