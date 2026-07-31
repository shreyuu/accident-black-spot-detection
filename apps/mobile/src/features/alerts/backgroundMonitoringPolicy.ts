import type { ProximityAlert } from '@/features/alerts/proximityEngine';
import { INTERRUPTING_RISK_LEVELS } from '@/features/alerts/proximityEngine';
import type { LocationPermissionStatus } from '@/features/location/locationService';
import type { RiskLevel } from '@/types/domain';

/**
 * Whether background monitoring should be running, and what to tell the user.
 *
 * Pure, for the same reason `proximityEngine` is: this is where an opt-in
 * promise either holds or quietly breaks. "Turning the toggle off stops the
 * location updates" is a claim about privacy and battery that has to be
 * demonstrable, and demonstrating it with a table of inputs is a great deal more
 * convincing than driving a phone around.
 *
 * The decision is deliberately split from the side effects. `useBackgroundMonitoring`
 * asks this function what should happen and then does exactly that, so there is
 * no path where the service starts for a reason this file does not describe.
 */

/** What the caller must do to reconcile reality with the user's choice. */
export type BackgroundMonitoringAction = 'start' | 'stop' | 'none';

export type BackgroundMonitoringStatus =
  /** Running, or about to be. */
  | 'active'
  /** The user has not opted in. The resting state. */
  | 'off'
  /** Opted in, but all alerts are switched off, so there is nothing to deliver. */
  | 'alerts-disabled'
  /** Opted in, but the app does not have foreground location access yet. */
  | 'needs-location-permission'
  /** Opted in and has foreground access, but not the "always"/background upgrade. */
  | 'needs-background-permission'
  /** Opted in, but permission was refused permanently — only Settings can fix it. */
  | 'permission-blocked'
  /** The platform has no background location at all (web). */
  | 'unsupported';

export interface BackgroundMonitoringInputs {
  /** `UserProfile.backgroundMonitoringEnabled`. Off unless the user opted in. */
  preferenceEnabled: boolean;
  /** `UserProfile.alertsEnabled`. */
  alertsEnabled: boolean;
  foregroundPermission: LocationPermissionStatus;
  /** iOS "Always", Android "Allow all the time". */
  backgroundPermission: LocationPermissionStatus;
  /** Whether the OS currently has our location task registered. */
  taskRunning: boolean;
  /** False where the platform cannot do this at all. */
  platformSupported: boolean;
}

export interface BackgroundMonitoringDecision {
  action: BackgroundMonitoringAction;
  status: BackgroundMonitoringStatus;
  /**
   * One sentence for the Settings screen.
   *
   * Never says monitoring is continuous, guaranteed, or reliable — because it is
   * none of those things on either platform. See docs/background-monitoring.md.
   */
  message: string;
  /** Whether a "Grant permission" affordance should be offered. */
  canRequestPermission: boolean;
}

const MESSAGES: Record<BackgroundMonitoringStatus, string> = {
  active:
    'Background warnings are on. The system decides when to update your location, so warnings may be delayed or missed.',
  off: 'Background warnings are off. You will only be warned while the app is open.',
  'alerts-disabled':
    'Background warnings cannot run while all alerts are switched off. Turn alerts on first.',
  'needs-location-permission':
    'Location access is needed before background warnings can run. Open the map to grant it.',
  'needs-background-permission':
    'Background warnings need location access set to “Always”. Grant it to continue.',
  'permission-blocked':
    'Location access was refused. Change it in your device settings to use background warnings.',
  unsupported: 'Background warnings are not available on this platform.',
};

/**
 * Decide the desired background-monitoring state.
 *
 * Every path that is not fully permitted and fully opted in resolves to `stop`
 * when the task is running. That direction is deliberate: an opt-in that is only
 * honoured on the way *in* is not an opt-in. If any precondition disappears —
 * the user revokes "Always" in Settings, switches alerts off, or flips the
 * toggle — the location updates stop, rather than continuing until something
 * happens to restart the app.
 */
export function decideBackgroundMonitoring(
  input: BackgroundMonitoringInputs,
): BackgroundMonitoringDecision {
  const stopIfRunning = (
    status: BackgroundMonitoringStatus,
    canRequestPermission = false,
  ): BackgroundMonitoringDecision => ({
    action: input.taskRunning ? 'stop' : 'none',
    status,
    message: MESSAGES[status],
    canRequestPermission,
  });

  if (!input.platformSupported) {
    return stopIfRunning('unsupported');
  }

  if (!input.preferenceEnabled) {
    return stopIfRunning('off');
  }

  // Checked before permissions so that a user who has switched every alert off
  // is told the useful thing rather than being sent to a permission prompt for a
  // feature that would deliver nothing.
  if (!input.alertsEnabled) {
    return stopIfRunning('alerts-disabled');
  }

  if (input.foregroundPermission === 'blocked' || input.backgroundPermission === 'blocked') {
    return stopIfRunning('permission-blocked');
  }

  // Background authorisation cannot be requested before foreground access
  // exists: iOS will not show the "Always" upgrade prompt, and Android 11+
  // rejects a combined request outright.
  if (input.foregroundPermission !== 'granted') {
    return stopIfRunning(
      'needs-location-permission',
      input.foregroundPermission === 'undetermined',
    );
  }

  if (input.backgroundPermission !== 'granted') {
    return stopIfRunning('needs-background-permission', true);
  }

  return {
    action: input.taskRunning ? 'none' : 'start',
    status: 'active',
    message: MESSAGES.active,
    canRequestPermission: false,
  };
}

/** Whether the status represents monitoring that is actually meant to be running. */
export function isMonitoringActive(status: BackgroundMonitoringStatus): boolean {
  return status === 'active';
}

// -----------------------------------------------------------------------------
// Which alerts justify a background interruption
// -----------------------------------------------------------------------------

export interface PartitionedBackgroundAlerts {
  /** Alerts that will be delivered as a notification. */
  deliver: ProximityAlert[];
  /** Alerts the user was inside but will not be interrupted for. */
  withheld: ProximityAlert[];
}

/**
 * Split background alerts into those worth interrupting for and those not.
 *
 * In the foreground an alert costs a glance at a screen the user is already
 * looking at. In the background it is a notification that buzzes a phone in a
 * pocket, possibly while the user is driving. That is a materially heavier
 * interruption, so it is reserved for the risk levels Phase 4 identified as
 * justifying one — `INTERRUPTING_RISK_LEVELS`.
 *
 * Withheld alerts are **not** hidden. Zone state advances either way, the spots
 * are on the map, and the Settings copy states plainly which risk levels
 * background warnings cover — because a user who believes they will be warned
 * about everything and is not has been misled, which is exactly what this
 * project's rules forbid.
 */
export function partitionBackgroundAlerts(
  alerts: readonly ProximityAlert[],
  interruptingRiskLevels: readonly RiskLevel[] = INTERRUPTING_RISK_LEVELS,
): PartitionedBackgroundAlerts {
  const deliver: ProximityAlert[] = [];
  const withheld: ProximityAlert[] = [];

  for (const alert of alerts) {
    if (interruptingRiskLevels.includes(alert.blackSpot.riskLevel)) {
      deliver.push(alert);
    } else {
      withheld.push(alert);
    }
  }

  return { deliver, withheld };
}
