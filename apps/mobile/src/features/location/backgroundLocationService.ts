import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { BACKGROUND_LOCATION_TASK } from '@/features/alerts/backgroundLocationTask';
import type { LocationPermissionStatus } from '@/features/location/locationService';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Starting and stopping the opt-in background location task.
 *
 * Kept apart from `locationService`, which is foreground-only and is used on
 * every launch. Nothing in this file is reached unless the user has explicitly
 * switched background monitoring on, so an import of it is a reliable signal
 * that background behaviour is in play.
 *
 * Whether it *should* be running is not decided here — that is
 * `backgroundMonitoringPolicy`, which is pure and tested. This module only
 * carries out the decision.
 */

/** Web has no background location, and no task manager to run one. */
export function isBackgroundMonitoringSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function toPermissionStatus(
  response: Location.LocationPermissionResponse,
): LocationPermissionStatus {
  if (response.granted) {
    return 'granted';
  }
  if (response.status === Location.PermissionStatus.UNDETERMINED) {
    return 'undetermined';
  }
  return response.canAskAgain ? 'denied' : 'blocked';
}

/** Current background ("Always" / "Allow all the time") permission, without prompting. */
export async function getBackgroundPermissionStatus(): Promise<LocationPermissionStatus> {
  if (!isBackgroundMonitoringSupported()) {
    return 'blocked';
  }
  try {
    return toPermissionStatus(await Location.getBackgroundPermissionsAsync());
  } catch (error) {
    logger.warn('backgroundLocationService', 'Could not read background permission', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return 'blocked';
  }
}

/**
 * Ask for background location authorisation.
 *
 * Call this only after the user has read the disclosure and switched the toggle
 * on. Both platforms treat it as an escalation and neither gives a second
 * chance cheaply:
 *
 *   - iOS shows the "Always Allow" upgrade prompt once, and only if foreground
 *     access already exists. After that the user must go to Settings.
 *   - Android 11+ does not show a dialog at all. `requestBackgroundPermissionsAsync`
 *     sends the user to the app's Settings page to pick "Allow all the time",
 *     so the app may be backgrounded during the call and the result arrives when
 *     they come back.
 */
export async function requestBackgroundPermission(): Promise<LocationPermissionStatus> {
  if (!isBackgroundMonitoringSupported()) {
    return 'blocked';
  }

  // Requesting the background upgrade before foreground access exists fails on
  // both platforms — iOS silently, Android with an outright rejection — so the
  // precondition is checked rather than discovered.
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) {
    throw new AppError(
      'permission',
      'Allow location access while using the app first, then turn on background warnings.',
      { technicalMessage: 'Background permission requested without foreground permission.' },
    );
  }

  const response = await Location.requestBackgroundPermissionsAsync();
  const status = toPermissionStatus(response);
  logger.info('backgroundLocationService', 'Background permission resolved', { status });
  return status;
}

/** Whether the OS currently has our task registered for location updates. */
export async function isBackgroundMonitoringRunning(): Promise<boolean> {
  if (!isBackgroundMonitoringSupported()) {
    return false;
  }
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch (error) {
    // Thrown under Expo Go, where the task never registers. Treating it as "not
    // running" is correct: there is nothing to stop.
    logger.warn('backgroundLocationService', 'Could not read task registration', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}

/**
 * Update thresholds for the background stream, in metres and milliseconds.
 *
 * Much coarser than the foreground watcher, and deliberately so. This may run
 * for a whole journey on a phone the user also needs for navigation, and the
 * proximity engine compares against radii of 100 m and up — a 250 m / 2 minute
 * granularity still cannot let a zone be crossed unnoticed at road speeds, while
 * costing a fraction of the battery.
 *
 * `deferredUpdates*` are the iOS-only lever that actually saves power: they let
 * the OS batch fixes and hand them over together rather than waking the app for
 * each one. `handleBackgroundLocations` reads the newest of the batch for this
 * reason.
 */
const BACKGROUND_DISTANCE_INTERVAL_M = 250;
const BACKGROUND_TIME_INTERVAL_MS = 120_000;
const DEFERRED_DISTANCE_M = 500;
const DEFERRED_INTERVAL_MS = 300_000;

/**
 * Start background location updates.
 *
 * The Android foreground service is not optional. Without it the OS stops
 * delivering updates within minutes, and on Android 14+ a location foreground
 * service must show a persistent notification — which is also the honest
 * outcome, because a phone tracking its own position should say so.
 */
export async function startBackgroundMonitoring(): Promise<void> {
  if (!isBackgroundMonitoringSupported()) {
    throw new AppError('unavailable', 'Background warnings are not available on this platform.', {
      technicalMessage: `Unsupported platform: ${Platform.OS}`,
    });
  }

  if (await isBackgroundMonitoringRunning()) {
    return;
  }

  try {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      // Balanced, matching the foreground watcher. High accuracy would drain the
      // battery for precision the radii do not need.
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: BACKGROUND_DISTANCE_INTERVAL_M,
      timeInterval: BACKGROUND_TIME_INTERVAL_MS,
      deferredUpdatesDistance: DEFERRED_DISTANCE_M,
      deferredUpdatesInterval: DEFERRED_INTERVAL_MS,
      // Left on: iOS suspends updates when it decides the user has stopped
      // moving and resumes them on significant movement, which is precisely the
      // behaviour wanted — a parked car needs no proximity checks.
      pausesUpdatesAutomatically: true,
      activityType: Location.ActivityType.AutomotiveNavigation,
      // The blue status-bar pill on iOS. Deliberately shown: the user should be
      // able to see, at a glance and without opening the app, that their
      // location is being read.
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Watching for nearby black spots',
        // States what is happening and what it costs, in the one place an
        // Android user will actually see while it runs.
        notificationBody: 'Uses your location in the background and extra battery. Tap to manage.',
        notificationColor: '#0B1F3A',
        // Dismissing the notification stops the service. Android allows the
        // notification to be made non-dismissible; making it so would mean the
        // user cannot stop background tracking from outside the app, which is
        // not a trade this feature is entitled to make.
        killServiceOnDestroy: true,
      },
    });

    logger.info('backgroundLocationService', 'Started background monitoring');
  } catch (error) {
    logger.error('backgroundLocationService', 'Could not start background monitoring', error);
    throw new AppError(
      'unavailable',
      'Background warnings could not be started on this device. They need a development or release build, not Expo Go.',
      {
        retryable: true,
        cause: error,
        technicalMessage: error instanceof Error ? error.message : 'Unknown start failure.',
      },
    );
  }
}

/**
 * Stop background location updates.
 *
 * Never throws. This is called on opt-out, on sign-out and whenever a
 * precondition disappears, and in every one of those cases failing loudly would
 * leave the caller unable to complete an action the user asked for.
 */
export async function stopBackgroundMonitoring(): Promise<void> {
  if (!isBackgroundMonitoringSupported()) {
    return;
  }
  try {
    if (await isBackgroundMonitoringRunning()) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      logger.info('backgroundLocationService', 'Stopped background monitoring');
    }
  } catch (error) {
    logger.warn('backgroundLocationService', 'Could not stop background monitoring', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}
