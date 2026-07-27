import * as Location from 'expo-location';

import {
  getCurrentLocation,
  getLastKnownLocation,
  getPermissionStatus,
  requestPermission,
} from '@/features/location/locationService';
import { AppError } from '@/utils/errors';

jest.mock('expo-location');

const mockedLocation = jest.mocked(Location);

/**
 * `expo-location` is mocked because these tests are about the service's own
 * decisions — how each permission shape is classified, and how a bad or absent
 * fix is handled — not about the native module.
 */

/** Build a permission response matching `expo-location`'s shape. */
function permissionResponse(
  status: Location.PermissionStatus,
  canAskAgain: boolean,
): Location.LocationPermissionResponse {
  return {
    status,
    canAskAgain,
    granted: status === Location.PermissionStatus.GRANTED,
    expires: 'never',
  } as Location.LocationPermissionResponse;
}

function positionFor(latitude: number, longitude: number, accuracy: number | null = 10) {
  return {
    coords: {
      latitude,
      longitude,
      accuracy,
      altitude: null,
      heading: null,
      speed: null,
      altitudeAccuracy: null,
    },
    timestamp: 1_700_000_000_000,
  } as Location.LocationObject;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Real enums, since the service compares against PermissionStatus members.
  Object.defineProperty(mockedLocation, 'PermissionStatus', {
    value: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
    writable: true,
  });
  Object.defineProperty(mockedLocation, 'Accuracy', {
    value: { High: 4, Balanced: 3 },
    writable: true,
  });
});

describe('permission classification', () => {
  /**
   * The distinction that matters most. `denied` can be re-prompted; `blocked`
   * cannot, and must send the user to system Settings instead of showing a
   * button that silently does nothing.
   */
  it.each([
    ['granted', Location.PermissionStatus.GRANTED, true, 'granted'],
    ['never asked', Location.PermissionStatus.UNDETERMINED, true, 'undetermined'],
    ['refused but re-askable', Location.PermissionStatus.DENIED, true, 'denied'],
    ['refused permanently', Location.PermissionStatus.DENIED, false, 'blocked'],
  ])('classifies %s correctly', async (_label, status, canAskAgain, expected) => {
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(status as Location.PermissionStatus, canAskAgain),
    );

    await expect(getPermissionStatus()).resolves.toBe(expected);
  });

  it('treats a granted permission as granted even when canAskAgain is false', async () => {
    // iOS reports canAskAgain: false once the single prompt has been used, which
    // must not be mistaken for a refusal.
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(Location.PermissionStatus.GRANTED, false),
    );

    await expect(getPermissionStatus()).resolves.toBe('granted');
  });

  it('classifies the response from an explicit request the same way', async () => {
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(Location.PermissionStatus.DENIED, false),
    );

    await expect(requestPermission()).resolves.toBe('blocked');
  });
});

describe('getCurrentLocation', () => {
  function grantPermission() {
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(Location.PermissionStatus.GRANTED, true),
    );
    mockedLocation.hasServicesEnabledAsync.mockResolvedValue(true);
    mockedLocation.getLastKnownPositionAsync.mockResolvedValue(null);
  }

  it('returns a valid fix', async () => {
    grantPermission();
    mockedLocation.getCurrentPositionAsync.mockResolvedValue(positionFor(51.5074, -0.1278, 12));

    const result = await getCurrentLocation('high');

    expect(result.latitude).toBeCloseTo(51.5074, 6);
    expect(result.longitude).toBeCloseTo(-0.1278, 6);
    expect(result.accuracyM).toBe(12);
  });

  it('refuses to read a position without permission', async () => {
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(Location.PermissionStatus.DENIED, true),
    );

    await expect(getCurrentLocation()).rejects.toThrow(AppError);
    expect(mockedLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  /**
   * Permission and device state are separate failures with separate remedies, so
   * the message must not blame the app's permission when the device's location
   * services are simply switched off.
   */
  it('reports location services being switched off as a distinct, retryable problem', async () => {
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(Location.PermissionStatus.GRANTED, true),
    );
    mockedLocation.hasServicesEnabledAsync.mockResolvedValue(false);

    await expect(getCurrentLocation()).rejects.toMatchObject({
      kind: 'unavailable',
      retryable: true,
      userMessage: expect.stringContaining('switched off'),
    });
    expect(mockedLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  /**
   * A failing sensor can return NaN or an out-of-range value. Passing that to
   * the native map view crashes it, so it is rejected at the boundary.
   */
  it.each([
    ['NaN latitude', Number.NaN, 0],
    ['out-of-range latitude', 91, 0],
    ['out-of-range longitude', 0, 181],
    ['infinite longitude', 0, Number.POSITIVE_INFINITY],
  ])('rejects a fix with %s rather than passing it to the map', async (_label, lat, lon) => {
    grantPermission();
    mockedLocation.getCurrentPositionAsync.mockResolvedValue(positionFor(lat, lon));

    await expect(getCurrentLocation()).rejects.toMatchObject({
      kind: 'unavailable',
      retryable: true,
    });
  });

  /**
   * Android's Play Services "Location Accuracy" dialog is suppressed. Left on,
   * it reappears on every request and asks the user to opt into Google's wifi
   * crowdsourcing — an interruption loop, and a data-collection request this app
   * has no business making on Google's behalf.
   */
  it('never triggers the Play Services location-accuracy dialog', async () => {
    grantPermission();
    mockedLocation.getCurrentPositionAsync.mockResolvedValue(positionFor(51.5, -0.1));

    await getCurrentLocation();

    expect(mockedLocation.getCurrentPositionAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mayShowUserSettingsDialog: false }),
    );
  });

  it('uses balanced accuracy by default and high only when asked', async () => {
    grantPermission();
    mockedLocation.getCurrentPositionAsync.mockResolvedValue(positionFor(51.5, -0.1));

    await getCurrentLocation();
    expect(mockedLocation.getCurrentPositionAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ accuracy: Location.Accuracy.Balanced }),
    );

    await getCurrentLocation('high');
    expect(mockedLocation.getCurrentPositionAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ accuracy: Location.Accuracy.High }),
    );
  });

  it('wraps an unexpected native failure as a retryable AppError', async () => {
    // The service logs this failure by design; the spy keeps the expected noise
    // out of the test output so a genuine error still stands out.
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    grantPermission();
    mockedLocation.getCurrentPositionAsync.mockRejectedValue(new Error('CLLocationManager failed'));

    await expect(getCurrentLocation()).rejects.toMatchObject({
      kind: 'unavailable',
      retryable: true,
    });

    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('reports a null accuracy rather than inventing a value', async () => {
    grantPermission();
    mockedLocation.getCurrentPositionAsync.mockResolvedValue(positionFor(51.5, -0.1, null));

    await expect(getCurrentLocation()).resolves.toMatchObject({ accuracyM: null });
  });

  /**
   * `getCurrentPositionAsync` accepts no timeout and waits indefinitely where no
   * fix is obtainable — indoors, in a tunnel, or with a failing sensor. Without
   * this bound the UI shows a spinner that never stops and offers no retry.
   */
  it('times out instead of hanging forever when no fix arrives', async () => {
    jest.useFakeTimers();
    grantPermission();
    mockedLocation.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));

    const pending = getCurrentLocation();
    const assertion = expect(pending).rejects.toMatchObject({
      kind: 'unavailable',
      retryable: true,
      userMessage: expect.stringContaining('taking too long'),
    });

    // Let the permission and services checks settle, then run out the clock.
    await jest.advanceTimersByTimeAsync(16_000);
    await assertion;

    jest.useRealTimers();
  });
});

describe('getLastKnownLocation', () => {
  it('returns a cached fix when one exists', async () => {
    mockedLocation.getLastKnownPositionAsync.mockResolvedValue(positionFor(51.5, -0.1));

    await expect(getLastKnownLocation()).resolves.toMatchObject({ latitude: 51.5 });
  });

  it('returns null when the platform has no cached fix', async () => {
    mockedLocation.getLastKnownPositionAsync.mockResolvedValue(null);

    await expect(getLastKnownLocation()).resolves.toBeNull();
  });

  it('returns null rather than throwing, since a cached fix is only an optimisation', async () => {
    mockedLocation.getLastKnownPositionAsync.mockRejectedValue(new Error('unavailable'));

    await expect(getLastKnownLocation()).resolves.toBeNull();
  });

  it('discards a cached fix with invalid coordinates', async () => {
    mockedLocation.getLastKnownPositionAsync.mockResolvedValue(positionFor(Number.NaN, 0));

    await expect(getLastKnownLocation()).resolves.toBeNull();
  });
});

describe('accuracy fallback when device settings refuse the request', () => {
  function grantPermission() {
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(Location.PermissionStatus.GRANTED, true),
    );
    mockedLocation.hasServicesEnabledAsync.mockResolvedValue(true);
    mockedLocation.getLastKnownPositionAsync.mockResolvedValue(null);
  }

  function settingsUnsatisfied() {
    return Object.assign(new Error('Location request failed due to unsatisfied device settings'), {
      code: 'ERR_LOCATION_SETTINGS_UNSATISFIED',
    });
  }

  /**
   * Verified on the Pixel_9 emulator: declining Android's "Location Accuracy"
   * dialog makes every high-accuracy request fail with this code. Falling back
   * to a coarser fix keeps the map working, and a coarse fix is entirely
   * adequate against warning radii of 100 m and up.
   */
  it('retries at low accuracy rather than giving up', async () => {
    const warned = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    grantPermission();
    mockedLocation.getCurrentPositionAsync
      .mockRejectedValueOnce(settingsUnsatisfied())
      .mockResolvedValueOnce(positionFor(51.5, -0.1));

    await expect(getCurrentLocation('high')).resolves.toMatchObject({ latitude: 51.5 });

    expect(mockedLocation.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
    warned.mockRestore();
  });

  it('reports an actionable message when even low accuracy is refused', async () => {
    const warned = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    grantPermission();
    mockedLocation.getCurrentPositionAsync.mockRejectedValue(settingsUnsatisfied());

    await expect(getCurrentLocation('high')).rejects.toMatchObject({
      kind: 'unavailable',
      retryable: true,
      userMessage: expect.stringContaining('location settings'),
    });

    warned.mockRestore();
  });

  it('does not retry for unrelated failures', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    grantPermission();
    mockedLocation.getCurrentPositionAsync.mockRejectedValue(new Error('some other failure'));

    await expect(getCurrentLocation('high')).rejects.toBeInstanceOf(AppError);

    expect(mockedLocation.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });
});
