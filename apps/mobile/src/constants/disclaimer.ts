/**
 * Safety disclaimers.
 *
 * These exist because the app must never imply a guarantee it cannot deliver:
 * not accident or crime prevention, not medical or police response, not SMS
 * delivery, not perfect location accuracy, and not complete black spot
 * coverage. Data is crowdsourced and incomplete by nature.
 *
 * Centralised so the wording stays consistent between onboarding and Settings
 * and cannot drift into over-promising in one place.
 */

export const SAFETY_DISCLAIMER =
  'Accident Black Spot Detection provides informational warnings based on available data. ' +
  'It does not replace safe driving, emergency services or official guidance.';

export const COVERAGE_DISCLAIMER =
  'Black spot data is incomplete and partly crowdsourced. An area with no warning is not ' +
  'necessarily safe.';

export const DRIVING_DISCLAIMER =
  'Do not interact with this app while driving. Set up alerts before you travel.';

export const LOCATION_ACCURACY_DISCLAIMER =
  'GPS accuracy varies with surroundings and weather. Distances shown are approximate.';

/** Shown next to SOS. `expo-sms` opens the composer; it cannot confirm delivery. */
export const SOS_DELIVERY_DISCLAIMER =
  'Sending opens your messaging app so you can review and send. This app cannot confirm ' +
  'that a message was delivered.';

/**
 * Background monitoring disclosure, shown in full **before** the toggle can be
 * switched on.
 *
 * Written as separate points rather than a paragraph because it has to be read,
 * not skimmed past. Between them these are the things a user cannot find out for
 * themselves and would reasonably be annoyed to discover later: the battery
 * cost, the permanent Android notification, the fact that neither OS actually
 * guarantees the checks happen, and the fact that coverage comes from data
 * already downloaded.
 *
 * The rule the whole list serves: the app must not imply continuous monitoring
 * it cannot provide. See docs/background-monitoring.md for the underlying
 * platform behaviour.
 */
export const BACKGROUND_MONITORING_DISCLOSURE: readonly string[] = [
  'Your position is checked against nearby black spots while the app is closed or in the background, and you are warned by notification.',
  'This uses noticeably more battery than leaving it off, because it keeps your location updating while you travel.',
  'Checks are not continuous and are not guaranteed. Your phone decides when to run them, and it may delay them, batch them, or stop them entirely to save power.',
  'Warnings only cover black spots already downloaded to this device. Open the app occasionally so that data stays current for where you are.',
  'To avoid interrupting you unnecessarily, background notifications are sent for high and critical risk areas only.',
  'Your position stays on this device. It is compared to black spots locally and is never uploaded. When you are warned, the app records which black spot it was and when — never where you were.',
  'You can turn this off at any time, here in Settings.',
];

/** Platform-specific consequences the user will actually see, appended to the list above. */
export const BACKGROUND_MONITORING_IOS_NOTE =
  'iOS shows a blue indicator in the status bar whenever the app is using your location in the background.';

export const BACKGROUND_MONITORING_ANDROID_NOTE =
  'Android shows an ongoing notification for as long as this is running. Dismissing that notification stops background warnings.';
