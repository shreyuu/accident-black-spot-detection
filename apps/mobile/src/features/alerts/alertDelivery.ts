import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import type { ProximityAlert } from '@/features/alerts/proximityEngine';
import { logger } from '@/utils/logger';

/**
 * Turning an alert decision into something the user perceives.
 *
 * Kept separate from `proximityEngine` so the decision logic stays pure and
 * testable, and separate from the UI so a Phase 8 background task can reuse it.
 *
 * Every channel is independently controlled by the user's preferences, and every
 * channel fails softly: a notification permission that was refused, or a device
 * without a haptic motor, must never stop the in-app banner from appearing. The
 * banner is the one channel that always works, which is why it is the caller's
 * responsibility rather than this module's.
 *
 * ## Why `expo-notifications` is loaded lazily
 *
 * A static `import * as Notifications from 'expo-notifications'` **throws at
 * import time** in Expo Go on Android, which since SDK 53 refuses to provide the
 * module at all. Because this file is reached from the map screen, that turned
 * into a cascade: the route failed to load, `(tabs)/_layout` then crashed with
 * "Cannot read property 'ErrorBoundary' of undefined", and the entire tab group
 * — map, report, SOS, settings — was unreachable on Android. On iOS the same
 * import only logs a warning, which is why it went unnoticed.
 *
 * The module already treats every notification failure as survivable; it simply
 * could not survive its own import. Loading it lazily keeps that contract intact
 * on every platform: if it cannot be loaded, notifications are skipped and the
 * in-app banner and haptics carry on.
 *
 * TODO(phase-8): the development build introduced there supplies the module
 * properly, at which point this can go back to a static import — but only if the
 * app never runs under Expo Go again.
 */

type NotificationsModule = typeof import('expo-notifications');

/** `undefined` = not tried yet, `null` = tried and unavailable. */
let notificationsModule: NotificationsModule | null | undefined;

function loadNotifications(): NotificationsModule | null {
  if (notificationsModule !== undefined) {
    return notificationsModule;
  }

  try {
    // A runtime `require` is the point: a static import cannot be caught, and
    // catching it is the whole reason this function exists.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see the module note above
    notificationsModule = require('expo-notifications') as NotificationsModule;
  } catch (error) {
    logger.warn('alertDelivery', 'Notifications are unavailable; using the in-app banner only', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    notificationsModule = null;
  }

  return notificationsModule;
}

export interface AlertPreferences {
  alertsEnabled: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
}

const ANDROID_CHANNEL_ID = 'proximity-warnings';

let notificationsConfigured = false;

/**
 * Prepare the notification channel and foreground presentation.
 *
 * Safe to call repeatedly. On Android a channel must exist before any
 * notification can be posted, and its importance is fixed at creation — which is
 * why HIGH is set here rather than per notification.
 */
export async function configureNotifications(): Promise<void> {
  if (notificationsConfigured) {
    return;
  }

  const Notifications = loadNotifications();
  if (Notifications === null) {
    return;
  }

  notificationsConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      // The app also shows an in-app banner, but the OS notification is what the
      // user sees if they have just switched away, so it is still presented.
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Proximity warnings',
        description: 'Warnings when you approach a known accident-prone or crime-prone area.',
        // HIGH so the warning surfaces while the user is travelling. Anything
        // lower is delivered silently to the shade, where it is useless.
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    } catch (error) {
      logger.warn('alertDelivery', 'Could not create the Android notification channel', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}

/**
 * Ask for notification permission.
 *
 * Returns whether it was granted. A refusal is not an error — the in-app banner
 * still works — so callers should carry on regardless.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const Notifications = loadNotifications();
  if (Notifications === null) {
    return false;
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) {
      return true;
    }
    if (!existing.canAskAgain) {
      return false;
    }
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (error) {
    logger.warn('alertDelivery', 'Could not resolve notification permission', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}

/**
 * Deliver one alert through the notification and haptic channels.
 *
 * Never throws. The caller has already shown the banner; a failure here must not
 * take that down with it.
 */
export async function deliverAlert(
  alert: ProximityAlert,
  preferences: AlertPreferences,
): Promise<void> {
  if (!preferences.alertsEnabled) {
    return;
  }

  await Promise.allSettled([
    presentNotification(alert, preferences.soundEnabled),
    triggerHaptics(preferences.hapticsEnabled),
  ]);
}

async function presentNotification(alert: ProximityAlert, soundEnabled: boolean): Promise<void> {
  const Notifications = loadNotifications();
  if (Notifications === null) {
    return;
  }

  try {
    await configureNotifications();

    await Notifications.scheduleNotificationAsync({
      content: {
        title: alert.blackSpot.name,
        body: alert.message,
        sound: soundEnabled,
        // Carried so a Phase 8 tap can deep-link straight to the detail screen.
        data: { blackSpotId: alert.blackSpot.id },
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      // Immediate. A proximity warning delivered later is worse than useless.
      trigger: null,
    });
  } catch (error) {
    logger.warn('alertDelivery', 'Could not present the notification', {
      blackSpotId: alert.blackSpot.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

async function triggerHaptics(hapticsEnabled: boolean): Promise<void> {
  if (!hapticsEnabled) {
    return;
  }
  try {
    // Warning rather than Error: this is a caution, not a failure, and the
    // pattern is distinguishable from the app's other feedback.
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Many devices have no haptic motor. Nothing to report.
  }
}

/** Test-only reset of the one-shot configuration and module-load guards. */
export function __resetAlertDeliveryForTests(): void {
  notificationsConfigured = false;
  notificationsModule = undefined;
}
