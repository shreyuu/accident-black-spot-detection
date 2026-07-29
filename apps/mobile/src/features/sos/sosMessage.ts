import type { Coordinates } from '@/utils/geo';

/**
 * Composing the SOS message.
 *
 * Pure, and tested exhaustively, because this string is the entire product of
 * the SOS feature. Everything else — the button, the countdown, the composer —
 * exists to deliver it, and a mistake here is a message that sends someone to
 * the wrong place or tells them help is already coming when it is not.
 *
 * Three rules govern the wording and none of them is negotiable:
 *
 *   1. **It never claims the emergency services have been contacted.** They have
 *      not. The message says so explicitly, because a recipient who assumes an
 *      ambulance is already on its way may not call one.
 *   2. **A missing location is stated, never omitted.** Silence would read as
 *      "no location was needed"; the recipient has to know the position is
 *      unknown so they can ring instead of driving somewhere.
 *   3. **Accuracy is disclosed when the platform reports it.** A coordinate
 *      printed to five decimal places implies a metre of precision that consumer
 *      GPS does not have, so the message says how rough the fix actually is.
 */

/** The position to share, plus whatever the platform knows about its quality. */
export interface SosLocation extends Coordinates {
  /** Horizontal accuracy in metres, when reported. */
  accuracyM: number | null;
}

export interface SosMessageInput {
  /** The sender's own name, so the recipient knows who is asking. */
  senderName: string;
  /** `null` when no fix could be obtained — see rule 2 above. */
  location: SosLocation | null;
  /** Injected clock, in epoch milliseconds, so the output is testable. */
  now: number;
  /** Optional free text the user added before sending. */
  note?: string | undefined;
}

/** Upper bound on the user's optional note. */
export const SOS_NOTE_MAX_LENGTH = 200;

/**
 * Decimal places used for the shared coordinates.
 *
 * Five is about 1.1 m at the equator — finer than any consumer GPS fix, which is
 * why the accuracy line accompanies it. Fewer places would be actively harmful:
 * four is ~11 m and three is ~110 m, enough to put a recipient on the wrong side
 * of a dual carriageway.
 */
const COORDINATE_DECIMALS = 5;

/**
 * Map link format.
 *
 * The documented, stable Google Maps URL rather than a `geo:` URI. `geo:` is not
 * clickable in the iOS Messages app and does nothing on a desktop, whereas an
 * https link opens in whatever map or browser the recipient actually has —
 * which, for a message that may be read by anyone, is the point.
 */
export function buildMapLink(location: Coordinates): string {
  const latitude = location.latitude.toFixed(COORDINATE_DECIMALS);
  const longitude = location.longitude.toFixed(COORDINATE_DECIMALS);
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/** Coordinates as the recipient reads them. */
export function formatCoordinates(location: Coordinates): string {
  return `${location.latitude.toFixed(COORDINATE_DECIMALS)}, ${location.longitude.toFixed(COORDINATE_DECIMALS)}`;
}

/**
 * How the fix quality is described.
 *
 * Rounded up to something a person can act on. "Accurate to about 43 m" invites
 * false confidence in the 3; the buckets below say only as much as the reading
 * supports.
 */
function describeAccuracy(accuracyM: number | null): string | null {
  if (accuracyM === null || !Number.isFinite(accuracyM) || accuracyM <= 0) {
    return null;
  }
  if (accuracyM <= 20) {
    return 'accurate to within about 20 m';
  }
  if (accuracyM <= 100) {
    return 'accurate to within about 100 m';
  }
  if (accuracyM <= 1000) {
    return 'only accurate to a few hundred metres';
  }
  return 'very approximate — the fix is poor';
}

/**
 * The closing line, which carries the honesty requirement.
 *
 * Exported so the SOS screen can show the user the exact words their contacts
 * will read before they send anything.
 */
export const SOS_MESSAGE_FOOTER =
  'Sent from the Accident Black Spot Detection app. This app has NOT contacted the emergency ' +
  'services — please call them if you can.';

/** Shown in place of coordinates when no fix was available. */
export const SOS_NO_LOCATION_LINE =
  'Location: NOT AVAILABLE — this phone could not get a location fix, so you will need to contact ' +
  'me to find out where I am.';

/**
 * Build the message body.
 *
 * Never throws: this runs when someone is already in trouble, and a message with
 * a missing field is worth far more than an exception.
 */
export function buildSosMessage(input: SosMessageInput): string {
  const { senderName, location, now, note } = input;

  const name = senderName.trim().length > 0 ? senderName.trim() : 'Someone using this phone';

  const lines: string[] = [`EMERGENCY: ${name} needs help.`, ''];

  if (location === null) {
    lines.push(SOS_NO_LOCATION_LINE);
  } else {
    const accuracy = describeAccuracy(location.accuracyM);
    lines.push(
      `Location: ${formatCoordinates(location)}${accuracy === null ? '' : ` (${accuracy})`}`,
    );
    lines.push(`Map: ${buildMapLink(location)}`);
  }

  // The recipient needs to know how old the position is — a fix from twenty
  // minutes ago is a different situation from one taken just now.
  lines.push(`Sent at: ${new Date(now).toLocaleString()}`);

  const trimmedNote = note?.trim() ?? '';
  if (trimmedNote.length > 0) {
    lines.push('', trimmedNote.slice(0, SOS_NOTE_MAX_LENGTH));
  }

  lines.push('', SOS_MESSAGE_FOOTER);

  return lines.join('\n');
}
