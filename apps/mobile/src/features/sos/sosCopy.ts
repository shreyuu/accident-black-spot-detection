/**
 * Wording for the SOS flow.
 *
 * Centralised for the same reason the safety disclaimers are: this is the copy
 * most likely to be read in a hurry and least likely to be read carefully, and
 * every sentence here is one someone might act on. Nothing in this file may
 * imply that help has been summoned, that a message was delivered, or that the
 * app is monitoring anything.
 */

/** The headline promise of the screen, stated accurately. */
export const SOS_WHAT_THIS_DOES =
  'This prepares a message with your location and opens your messaging app so you can send it to ' +
  'the contacts you choose.';

/**
 * The single most important sentence in the feature.
 *
 * Shown before the button, not buried under it.
 */
export const SOS_NOT_EMERGENCY_SERVICES =
  'This is not a way to contact the emergency services. If you are in danger or someone is hurt, ' +
  'call your local emergency number first.';

/** Shown while the countdown is running. */
export const SOS_COUNTDOWN_HINT = 'Tap Cancel to stop. Nothing has been sent yet.';

/** Shown when the user has no contacts saved. */
export const SOS_NO_CONTACTS =
  'You have not added any emergency contacts. You can still copy or share the message, but there ' +
  'is nobody for the app to address it to.';

/** Shown when a location fix could not be obtained. */
export const SOS_NO_LOCATION_WARNING =
  'Your location is not available, so the message will say so instead of guessing. You can still ' +
  'send it — your contacts will know to ask where you are.';

/** Shown while a fix is still being acquired. */
export const SOS_LOCATING = 'Getting your location — you can still send without it.';

/** Explains why only a few contacts can be addressed at once. */
export const SOS_RECIPIENT_LIMIT_NOTE =
  'Everyone you pick will see the other recipients’ numbers in the same message thread.';

/** Shown above the message preview. */
export const SOS_PREVIEW_LABEL = 'Exactly what your contacts will receive';
