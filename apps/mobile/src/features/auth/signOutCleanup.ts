import { clearBackgroundAlertSnapshot } from '@/features/alerts/backgroundAlertSnapshot';
import { clearBackgroundRunHealth } from '@/features/alerts/backgroundRunHealthStore';
import { clearZoneStates } from '@/features/alerts/zoneStateStore';
import { clearNearbyBlackSpots } from '@/features/black-spots/blackSpotCache';
import { stopBackgroundMonitoring } from '@/features/location/backgroundLocationService';
import { clearNearbyPlaces } from '@/features/nearby-places/nearbyPlaceCache';
import { clearDrafts } from '@/features/reports/draftStore';
import { clearPreferences } from '@/features/settings/preferenceStore';

/**
 * Everything an account leaves on the device, removed at sign-out.
 *
 * The background task runs headless off its own snapshot, so leaving that
 * behind would mean the next person inherits the previous user's warnings and
 * their alert-log attribution. Drafts are the sharper case: an unsent draft is
 * somebody's private account of an incident, and leaving it would let the next
 * person read it — or submit it under their own name.
 *
 * The two location caches were missing until the audit (SECURITY_AUDIT.md L9).
 * Both key their entries on the user's position rounded to about a kilometre,
 * so on a shared device they told the next person roughly where the previous
 * one had been.
 *
 * Every helper here catches its own storage errors, so one failing store never
 * leaves the others uncleared.
 */
export async function clearDeviceDataForSignOut(): Promise<void> {
  await stopBackgroundMonitoring();
  await Promise.all([
    clearBackgroundAlertSnapshot(),
    clearZoneStates(),
    clearBackgroundRunHealth(),
    clearPreferences(),
    clearDrafts(),
    clearNearbyPlaces(),
    clearNearbyBlackSpots(),
  ]);
}
