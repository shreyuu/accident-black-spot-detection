import * as Location from 'expo-location';

import { deliverAlert } from '@/features/alerts/alertDelivery';
import { recordAlert } from '@/features/alerts/alertLogRepository';
import {
  loadBackgroundAlertSnapshot,
  type BackgroundAlertSnapshot,
} from '@/features/alerts/backgroundAlertSnapshot';
import {
  BACKGROUND_LOCATION_TASK,
  handleBackgroundLocations,
} from '@/features/alerts/backgroundLocationTask';
import { loadZoneStates, saveZoneStates } from '@/features/alerts/zoneStateStore';
import { loadNearbyBlackSpots } from '@/features/black-spots/blackSpotCache';
import { getFirebaseAuth } from '@/services/firebase/app';
import type { BlackSpot, RiskLevel } from '@/types/domain';

// `defineTask` runs during module evaluation and would reach a native module
// that does not exist under Jest. Stubbing the whole package keeps the import
// side effect harmless while leaving the handler under test untouched.
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));

jest.mock('expo-location', () => ({
  hasStartedLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
}));

jest.mock('@/features/alerts/alertDelivery', () => ({ deliverAlert: jest.fn() }));
jest.mock('@/features/alerts/alertLogRepository', () => ({ recordAlert: jest.fn() }));
jest.mock('@/features/alerts/backgroundAlertSnapshot', () => ({
  loadBackgroundAlertSnapshot: jest.fn(),
}));
jest.mock('@/features/alerts/zoneStateStore', () => ({
  loadZoneStates: jest.fn(),
  saveZoneStates: jest.fn(),
}));
jest.mock('@/features/black-spots/blackSpotCache', () => ({ loadNearbyBlackSpots: jest.fn() }));
jest.mock('@/services/firebase/app', () => ({ getFirebaseAuth: jest.fn() }));

const mockedLocation = jest.mocked(Location);
const mockedDeliverAlert = jest.mocked(deliverAlert);
const mockedRecordAlert = jest.mocked(recordAlert);
const mockedLoadSnapshot = jest.mocked(loadBackgroundAlertSnapshot);
const mockedLoadZoneStates = jest.mocked(loadZoneStates);
const mockedSaveZoneStates = jest.mocked(saveZoneStates);
const mockedLoadCache = jest.mocked(loadNearbyBlackSpots);
const mockedGetAuth = jest.mocked(getFirebaseAuth);

const NOW = 1_700_000_000_000;

/** A black spot centred on the position the fixtures report. */
function makeSpot(id: string, riskLevel: RiskLevel): BlackSpot {
  return {
    id,
    name: `Spot ${id}`,
    category: 'accident',
    latitude: 51.5074,
    longitude: -0.1278,
    geohash: 'gcpvj0du6',
    radiusM: 300,
    riskLevel,
    severityScore: 70,
    accidentCount: 4,
    crimeCount: 0,
    reportCount: 3,
    verified: true,
    active: true,
    source: 'official',
    createdBy: 'admin',
    createdAt: null,
    updatedAt: null,
  };
}

function makeFix(latitude: number, longitude: number): Location.LocationObject {
  return {
    coords: {
      latitude,
      longitude,
      altitude: null,
      accuracy: 20,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: NOW,
  };
}

function snapshot(overrides: Partial<BackgroundAlertSnapshot> = {}): BackgroundAlertSnapshot {
  return {
    version: 1,
    userId: 'user-1',
    backgroundMonitoringEnabled: true,
    alertsEnabled: true,
    soundEnabled: true,
    hapticsEnabled: true,
    alertRadiusM: 1000,
    ...overrides,
  };
}

function cacheWith(...spots: BlackSpot[]) {
  return {
    spots,
    cachedAt: NOW - 1000,
    centre: { latitude: 51.5074, longitude: -0.1278 },
    stale: false,
  };
}

/** Signed in, so alert logging is attempted. */
function signedIn(): void {
  mockedGetAuth.mockReturnValue({ currentUser: { uid: 'user-1' } } as ReturnType<
    typeof getFirebaseAuth
  >);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedLoadSnapshot.mockResolvedValue(snapshot());
  mockedLoadZoneStates.mockResolvedValue({});
  mockedSaveZoneStates.mockResolvedValue();
  mockedLoadCache.mockResolvedValue(cacheWith(makeSpot('critical-1', 'critical')));
  mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
  mockedLocation.stopLocationUpdatesAsync.mockResolvedValue();
  mockedDeliverAlert.mockResolvedValue();
  mockedRecordAlert.mockResolvedValue();
  signedIn();
});

describe('handleBackgroundLocations', () => {
  it('delivers a notification when the user enters a high-risk zone', async () => {
    await handleBackgroundLocations([makeFix(51.5074, -0.1278)], NOW);

    expect(mockedDeliverAlert).toHaveBeenCalledTimes(1);
    const [alert, preferences] = mockedDeliverAlert.mock.calls[0] ?? [];
    expect(alert?.blackSpot.id).toBe('critical-1');
    expect(preferences).toEqual({
      alertsEnabled: true,
      soundEnabled: true,
      hapticsEnabled: true,
    });
  });

  it('records the alert as a background alert', async () => {
    await handleBackgroundLocations([makeFix(51.5074, -0.1278)], NOW);

    expect(mockedRecordAlert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', alertType: 'background' }),
    );
  });

  it('skips the alert log when no session has been restored', async () => {
    mockedGetAuth.mockReturnValue({ currentUser: null } as ReturnType<typeof getFirebaseAuth>);

    await handleBackgroundLocations([makeFix(51.5074, -0.1278)], NOW);

    expect(mockedDeliverAlert).toHaveBeenCalledTimes(1);
    expect(mockedRecordAlert).not.toHaveBeenCalled();
  });

  it('persists zone state before delivering, so a kill mid-batch cannot repeat the warning', async () => {
    const order: string[] = [];
    mockedSaveZoneStates.mockImplementation(async () => {
      order.push('save');
    });
    mockedDeliverAlert.mockImplementation(async () => {
      order.push('deliver');
    });

    await handleBackgroundLocations([makeFix(51.5074, -0.1278)], NOW);

    expect(order).toEqual(['save', 'deliver']);
    expect(mockedSaveZoneStates).toHaveBeenCalledWith(
      expect.objectContaining({
        'critical-1': expect.objectContaining({ inside: true, lastAlertedAt: NOW }),
      }),
      NOW,
    );
  });

  it('does not re-alert for a zone the user was already inside', async () => {
    mockedLoadZoneStates.mockResolvedValue({
      'critical-1': { blackSpotId: 'critical-1', inside: true, lastAlertedAt: NOW - 60_000 },
    });

    await handleBackgroundLocations([makeFix(51.5074, -0.1278)], NOW);

    expect(mockedDeliverAlert).not.toHaveBeenCalled();
  });

  it('withholds a low-risk alert rather than interrupting for it', async () => {
    mockedLoadCache.mockResolvedValue(cacheWith(makeSpot('low-1', 'low')));

    await handleBackgroundLocations([makeFix(51.5074, -0.1278)], NOW);

    expect(mockedDeliverAlert).not.toHaveBeenCalled();
    // State still advances: the user really was inside, and the map will show it.
    expect(mockedSaveZoneStates).toHaveBeenCalledWith(
      expect.objectContaining({ 'low-1': expect.objectContaining({ inside: true }) }),
      NOW,
    );
  });

  it('stays silent outside every zone', async () => {
    await handleBackgroundLocations([makeFix(51.6, -0.3)], NOW);

    expect(mockedDeliverAlert).not.toHaveBeenCalled();
  });

  it('uses the newest fix in a coalesced batch', async () => {
    // The OS hands over several updates at once, oldest first. Only the last one
    // is inside the zone; reading the first would miss the entry entirely.
    await handleBackgroundLocations(
      [makeFix(51.6, -0.3), makeFix(51.55, -0.2), makeFix(51.5074, -0.1278)],
      NOW,
    );

    expect(mockedDeliverAlert).toHaveBeenCalledTimes(1);
  });

  it('ignores a fix with an unusable coordinate', async () => {
    await handleBackgroundLocations([makeFix(Number.NaN, -0.1278)], NOW);

    expect(mockedDeliverAlert).not.toHaveBeenCalled();
    expect(mockedSaveZoneStates).not.toHaveBeenCalled();
  });

  it('honours the user’s alert radius rather than the spot radius alone', async () => {
    mockedLoadSnapshot.mockResolvedValue(snapshot({ alertRadiusM: 100 }));
    // 200 m away: inside the spot's 300 m radius, outside the user's 100 m.
    await handleBackgroundLocations([makeFix(51.5092, -0.1278)], NOW);

    expect(mockedDeliverAlert).not.toHaveBeenCalled();
  });

  describe('when it should no longer be running', () => {
    it('stops updates and delivers nothing when the user has opted out', async () => {
      mockedLoadSnapshot.mockResolvedValue(snapshot({ backgroundMonitoringEnabled: false }));

      await handleBackgroundLocations([makeFix(51.5074, -0.1278)], NOW);

      expect(mockedLocation.stopLocationUpdatesAsync).toHaveBeenCalledWith(
        BACKGROUND_LOCATION_TASK,
      );
      expect(mockedDeliverAlert).not.toHaveBeenCalled();
    });

    it('stops updates when all alerts have been switched off', async () => {
      mockedLoadSnapshot.mockResolvedValue(snapshot({ alertsEnabled: false }));

      await handleBackgroundLocations([makeFix(51.5074, -0.1278)], NOW);

      expect(mockedLocation.stopLocationUpdatesAsync).toHaveBeenCalled();
      expect(mockedDeliverAlert).not.toHaveBeenCalled();
    });

    it('stops updates when there is no snapshot at all, rather than assuming defaults', async () => {
      mockedLoadSnapshot.mockResolvedValue(null);

      await handleBackgroundLocations([makeFix(51.5074, -0.1278)], NOW);

      expect(mockedLocation.stopLocationUpdatesAsync).toHaveBeenCalled();
      expect(mockedDeliverAlert).not.toHaveBeenCalled();
    });

    it('does not call stop when nothing is registered', async () => {
      mockedLoadSnapshot.mockResolvedValue(null);
      mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(false);

      await handleBackgroundLocations([makeFix(51.5074, -0.1278)], NOW);

      expect(mockedLocation.stopLocationUpdatesAsync).not.toHaveBeenCalled();
    });
  });

  it('stays silent when the offline cache covers no black spots here', async () => {
    mockedLoadCache.mockResolvedValue(null);

    await handleBackgroundLocations([makeFix(51.5074, -0.1278)], NOW);

    expect(mockedDeliverAlert).not.toHaveBeenCalled();
    expect(mockedSaveZoneStates).not.toHaveBeenCalled();
  });
});
