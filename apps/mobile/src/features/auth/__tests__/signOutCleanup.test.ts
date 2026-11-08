import { clearBackgroundAlertSnapshot } from '@/features/alerts/backgroundAlertSnapshot';
import { clearBackgroundRunHealth } from '@/features/alerts/backgroundRunHealthStore';
import { clearZoneStates } from '@/features/alerts/zoneStateStore';
import { clearDeviceDataForSignOut } from '@/features/auth/signOutCleanup';
import { clearNearbyBlackSpots } from '@/features/black-spots/blackSpotCache';
import { stopBackgroundMonitoring } from '@/features/location/backgroundLocationService';
import { clearNearbyPlaces } from '@/features/nearby-places/nearbyPlaceCache';
import { clearDrafts } from '@/features/reports/draftStore';
import { clearPreferences } from '@/features/settings/preferenceStore';

jest.mock('@/features/alerts/backgroundAlertSnapshot', () => ({
  clearBackgroundAlertSnapshot: jest.fn(async () => undefined),
}));
jest.mock('@/features/alerts/backgroundRunHealthStore', () => ({
  clearBackgroundRunHealth: jest.fn(async () => undefined),
}));
jest.mock('@/features/alerts/zoneStateStore', () => ({
  clearZoneStates: jest.fn(async () => undefined),
}));
jest.mock('@/features/black-spots/blackSpotCache', () => ({
  clearNearbyBlackSpots: jest.fn(async () => undefined),
}));
jest.mock('@/features/location/backgroundLocationService', () => ({
  stopBackgroundMonitoring: jest.fn(async () => undefined),
}));
jest.mock('@/features/nearby-places/nearbyPlaceCache', () => ({
  clearNearbyPlaces: jest.fn(async () => undefined),
}));
jest.mock('@/features/reports/draftStore', () => ({
  clearDrafts: jest.fn(async () => undefined),
}));
jest.mock('@/features/settings/preferenceStore', () => ({
  clearPreferences: jest.fn(async () => undefined),
}));

describe('clearDeviceDataForSignOut', () => {
  it('stops background monitoring and clears every per-account store', async () => {
    await clearDeviceDataForSignOut();

    expect(stopBackgroundMonitoring).toHaveBeenCalled();
    for (const clear of [
      clearBackgroundAlertSnapshot,
      clearZoneStates,
      clearBackgroundRunHealth,
      clearPreferences,
      clearDrafts,
    ]) {
      expect(clear).toHaveBeenCalled();
    }
  });

  it('clears the location caches, which hold where the last user was', async () => {
    // Both caches key their entries on the user's position rounded to about a
    // kilometre. Left behind, the next person on a shared device could read
    // roughly where the previous one had been (SECURITY_AUDIT.md L9).
    await clearDeviceDataForSignOut();

    expect(clearNearbyPlaces).toHaveBeenCalled();
    expect(clearNearbyBlackSpots).toHaveBeenCalled();
  });
});
