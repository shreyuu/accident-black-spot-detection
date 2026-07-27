import * as Location from 'expo-location';

import type { Coordinates } from '@/utils/geo';
import { isValidCoordinate } from '@/utils/geo';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Foreground location access.
 *
 * Phase 3 covers foreground only. Background tracking is Phase 8 and is a
 * separate, explicitly opted-in permission — bundling the two would mean asking
 * for "Always" access before there is any feature that needs it.
 *
 * The three permission states are kept distinct because they need different
 * responses: `undetermined` can be resolved by asking, `denied` can be asked
 * again on Android but not on iOS, and `blocked` can only be changed in system
 * Settings. Collapsing them into a boolean would leave the user stuck with a
 * "Grant access" button that silently does nothing.
 */

export type LocationPermissionStatus =
  /** Never asked. The OS dialog can still be shown. */
  | 'undetermined'
  /** Granted for foreground use. */
  | 'granted'
  /** Refused, but asking again is still possible. */
  | 'denied'
  /** Refused permanently. Only system Settings can change this. */
  | 'blocked';

/** Accuracy profile, chosen per use case rather than always maximised. */
export type LocationAccuracyMode =
  /** Active map viewing or an SOS — worth the battery. */
  | 'high'
  /** Passive proximity checks — good enough against a 100 m+ radius. */
  | 'balanced';

export interface UserLocation extends Coordinates {
  /** Horizontal accuracy in metres, when the platform reports it. */
  accuracyM: number | null;
  /** Device clock at fix time, in epoch milliseconds. */
  timestamp: number;
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
  // `canAskAgain` is the only signal distinguishing a recoverable refusal from a
  // permanent one. On iOS it goes false after the single system prompt; on
  // Android after the user selects "Don't allow" twice.
  return response.canAskAgain ? 'denied' : 'blocked';
}

/** Current permission state without prompting. */
export async function getPermissionStatus(): Promise<LocationPermissionStatus> {
  const response = await Location.getForegroundPermissionsAsync();
  return toPermissionStatus(response);
}

/**
 * Show the OS permission dialog.
 *
 * Call this only after the user has seen the in-app explanation. The system
 * dialog appears once per install on iOS, so spending it before the user
 * understands the request is effectively unrecoverable.
 */
export async function requestPermission(): Promise<LocationPermissionStatus> {
  const response = await Location.requestForegroundPermissionsAsync();
  const status = toPermissionStatus(response);
  logger.info('locationService', 'Foreground permission resolved', { status });
  return status;
}

const ACCURACY_BY_MODE: Record<LocationAccuracyMode, Location.LocationAccuracy> = {
  high: Location.Accuracy.High,
  // Deliberately not Accuracy.High. Proximity checks compare against radii of
  // 100 m and up, where ~100 m accuracy is sufficient, and the lower setting
  // uses appreciably less battery on a device that may be running all day.
  balanced: Location.Accuracy.Balanced,
};

/**
 * How long to wait for a fix before giving up, in milliseconds.
 *
 * `getCurrentPositionAsync` takes no timeout option and will wait indefinitely
 * where no fix is obtainable — indoors, in a tunnel, or with a failing sensor.
 * Left unbounded that presents to the user as a spinner that never stops, with
 * no error and no way to retry. Fifteen seconds is generous for a cold GPS fix
 * while still failing in a bounded, reportable way.
 */
const FIX_TIMEOUT_MS = 15_000;

/** Reject with an `AppError` if `operation` has not settled within `timeoutMs`. */
async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new AppError(
          'unavailable',
          'Your location is taking too long to find. Move somewhere with a clearer view of the sky and try again.',
          { retryable: true, technicalMessage: `Location fix exceeded ${timeoutMs}ms.` },
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    // Always cleared: a stray timer would keep the JS context awake and, worse,
    // could reject after the caller has moved on.
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Android reports this when the requested accuracy exceeds what the device's
 * current location settings allow — typically because Google's "Location
 * Accuracy" (wifi/network positioning) is switched off.
 */
const SETTINGS_UNSATISFIED_CODE = 'ERR_LOCATION_SETTINGS_UNSATISFIED';

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === code
  );
}

/**
 * Request a position, dropping to a lower accuracy if the device's settings will
 * not satisfy the requested one.
 *
 * Two deliberate choices here:
 *
 * 1. `mayShowUserSettingsDialog: false` suppresses Android's Play Services
 *    "Location Accuracy" dialog. It reappears on *every* request, so declining
 *    it produces an interruption loop — and it asks the user to opt into
 *    Google's wifi crowdsourcing, which is a data-collection request this app
 *    has no business making on Google's behalf.
 *
 * 2. Because suppressing the dialog does not make a high-accuracy request
 *    succeed — it fails with ERR_LOCATION_SETTINGS_UNSATISFIED instead — a
 *    high-accuracy failure retries once at low accuracy. GPS alone is ample
 *    against warning radii of 100 m and up, so a coarser fix is far better than
 *    no map at all.
 */
async function requestPositionWithFallback(
  mode: LocationAccuracyMode,
): Promise<Location.LocationObject> {
  const attempt = (accuracy: Location.LocationAccuracy) =>
    withTimeout(
      Location.getCurrentPositionAsync({ accuracy, mayShowUserSettingsDialog: false }),
      FIX_TIMEOUT_MS,
    );

  try {
    return await attempt(ACCURACY_BY_MODE[mode]);
  } catch (error) {
    if (!hasErrorCode(error, SETTINGS_UNSATISFIED_CODE)) {
      throw error;
    }

    logger.warn(
      'locationService',
      'Device settings refused the requested accuracy; retrying lower',
      {
        requested: mode,
      },
    );

    try {
      return await attempt(Location.Accuracy.Low);
    } catch (fallbackError) {
      if (hasErrorCode(fallbackError, SETTINGS_UNSATISFIED_CODE)) {
        throw new AppError(
          'unavailable',
          'Your device’s location settings are preventing a fix. Open your device settings and turn location on, then try again.',
          {
            retryable: true,
            cause: fallbackError,
            technicalMessage: `${SETTINGS_UNSATISFIED_CODE} at both requested and low accuracy.`,
          },
        );
      }
      throw fallbackError;
    }
  }
}

/**
 * Read the device's current position.
 *
 * Throws an `AppError` rather than the raw platform error so screens can render
 * `userMessage` directly. The distinction between "permission missing" and
 * "location services switched off" matters: the first is fixed in the app, the
 * second only in system settings.
 */
export async function getCurrentLocation(
  mode: LocationAccuracyMode = 'balanced',
): Promise<UserLocation> {
  const permission = await getPermissionStatus();
  if (permission !== 'granted') {
    throw new AppError('permission', 'Location access is needed to show your position.', {
      technicalMessage: `Foreground permission is "${permission}".`,
    });
  }

  // Checked separately: the app can hold permission while the device has
  // location switched off entirely, and the resulting failure is otherwise an
  // unhelpful timeout.
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new AppError(
      'unavailable',
      'Location services are switched off on this device. Turn them on in system settings to see your position.',
      { retryable: true, technicalMessage: 'Location.hasServicesEnabledAsync() returned false.' },
    );
  }

  try {
    const position = await requestPositionWithFallback(mode);

    const candidate = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };

    // A fix can come back with NaN or an out-of-range value on a failing sensor.
    // Letting that reach the map produces an unrecoverable native crash, so it
    // is rejected here.
    if (!isValidCoordinate(candidate)) {
      throw new AppError(
        'unavailable',
        'Your location could not be determined. Please try again.',
        {
          retryable: true,
          technicalMessage: `Invalid fix: ${JSON.stringify(candidate)}`,
        },
      );
    }

    return {
      ...candidate,
      accuracyM: position.coords.accuracy ?? null,
      timestamp: position.timestamp,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('locationService', 'Failed to read the current position', error);
    throw new AppError('unavailable', 'Your location could not be determined. Please try again.', {
      retryable: true,
      cause: error,
      technicalMessage: error instanceof Error ? error.message : 'Unknown location failure.',
    });
  }
}

/**
 * Last known position, if the OS has one cached.
 *
 * Returns instantly where `getCurrentLocation` may take several seconds waiting
 * for a fix, so it is useful for painting the map immediately. It can be stale
 * or absent, and callers must treat it as a hint rather than the truth.
 */
export async function getLastKnownLocation(): Promise<UserLocation | null> {
  try {
    const position = await Location.getLastKnownPositionAsync();
    if (position === null) {
      return null;
    }
    const candidate = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    if (!isValidCoordinate(candidate)) {
      return null;
    }
    return {
      ...candidate,
      accuracyM: position.coords.accuracy ?? null,
      timestamp: position.timestamp,
    };
  } catch {
    // A cached position is an optimisation; failing to get one is not an error
    // worth surfacing.
    return null;
  }
}
