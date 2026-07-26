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
