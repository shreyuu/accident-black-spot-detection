/**
 * Phone number handling for dialling and messaging.
 *
 * Pure and tested, because a number that is mangled on its way into a `tel:` URI
 * fails at the worst possible moment — the user taps "Call" during an emergency
 * and the dialler opens empty, or worse, on a different number.
 *
 * Deliberately conservative: this does **not** attempt to parse or normalise
 * numbers into E.164. Doing that properly needs a library and a country context,
 * and doing it badly would silently rewrite a number that worked into one that
 * does not. What the user typed is what gets dialled, minus the characters a URI
 * cannot carry.
 */

/**
 * Characters kept in a dial string.
 *
 * Digits and a leading `+` are obvious. `*` and `#` are kept because they are
 * meaningful on some networks, and `,` and `;` because they encode pauses in
 * extension dialling — stripping those would break a number that reaches
 * somebody through a switchboard.
 */
const DIALLABLE = /[^0-9+*#,;]/g;

/**
 * Convert a stored number into something safe for a `tel:` URI.
 *
 * Returns `null` when nothing diallable remains, so callers can disable the
 * button rather than opening an empty dialler.
 */
export function toDialString(phone: string): string | null {
  const trimmed = phone.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Only a leading `+` is meaningful; one appearing later is a typo or a
  // separator, and passing it through produces an invalid URI.
  const hasLeadingPlus = trimmed.startsWith('+');
  const cleaned = trimmed.replace(DIALLABLE, '').replace(/\+/g, '');

  if (cleaned.length === 0) {
    return null;
  }

  return hasLeadingPlus ? `+${cleaned}` : cleaned;
}

/** A `tel:` URI, or `null` when the number cannot be dialled. */
export function toTelUri(phone: string): string | null {
  const dialString = toDialString(phone);
  return dialString === null ? null : `tel:${dialString}`;
}

/**
 * Group a long number for display.
 *
 * Only spacing — no reformatting, no country inference. The user has to be able
 * to recognise their own contact's number at a glance under stress, and a number
 * silently rewritten into an unfamiliar shape defeats that.
 */
export function formatPhoneForDisplay(phone: string): string {
  const dialString = toDialString(phone);
  if (dialString === null) {
    return phone;
  }

  // Left alone below 7 digits: short numbers are usually service codes, where
  // arbitrary grouping would look wrong rather than helpful.
  const digits = dialString.replace(/\D/g, '');
  if (digits.length < 7) {
    return dialString;
  }

  const prefix = dialString.startsWith('+') ? '+' : '';
  return `${prefix}${digits.replace(/(\d{3})(?=\d)/g, '$1 ')}`.trim();
}
