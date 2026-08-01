import type { Coordinates } from '@/utils/geo';

/**
 * Building the URL that hands a destination to the phone's own maps app.
 *
 * Pure and separated from the `Linking.openURL` call so the URLs can be asserted
 * exactly. Two things make that worth doing: a malformed geo: URI fails silently
 * on Android — nothing opens, no error — and an unescaped label can terminate
 * the query string early and send the user to the wrong place entirely.
 *
 * The app **hands off**; it does not navigate. It cannot know whether the maps
 * app opened, whether a route was found, or whether the user followed it, and
 * the copy alongside these links says so.
 */

export type DirectionsPlatform = 'ios' | 'android' | 'other';

export interface DirectionsTarget {
  destination: Coordinates;
  /** Shown as the pin label where the platform supports it. */
  label?: string;
}

/**
 * The universal Google Maps URL.
 *
 * Used as the web fallback and as the last resort on any platform: it opens the
 * Google Maps app when installed and the website otherwise, so it cannot leave
 * the user with nothing.
 */
export function buildUniversalDirectionsUrl(destination: Coordinates): string {
  const query = encodeURIComponent(`${destination.latitude},${destination.longitude}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${query}`;
}

/**
 * The platform-native directions URL.
 *
 *   - iOS uses `maps://`, which opens Apple Maps — the app every iPhone has,
 *     rather than one the user may not have installed.
 *   - Android uses the `geo:` scheme with a `q` parameter. The coordinates are
 *     repeated in the path *and* in `q` on purpose: the path is what non-Google
 *     map apps read, and `q` is what carries the label.
 *
 * Both are `encodeURIComponent`-escaped. A facility called "A&E — St Mary's"
 * would otherwise cut the query string at the ampersand.
 */
export function buildDirectionsUrl(platform: DirectionsPlatform, target: DirectionsTarget): string {
  const { destination, label } = target;
  const latitude = destination.latitude;
  const longitude = destination.longitude;

  switch (platform) {
    case 'ios': {
      const base = `maps://?daddr=${latitude},${longitude}&dirflg=d`;
      return label === undefined || label.length === 0
        ? base
        : `${base}&q=${encodeURIComponent(label)}`;
    }
    case 'android': {
      const pin = `geo:${latitude},${longitude}`;
      const query =
        label === undefined || label.length === 0
          ? `${latitude},${longitude}`
          : `${latitude},${longitude}(${label})`;
      return `${pin}?q=${encodeURIComponent(query)}`;
    }
    case 'other':
      return buildUniversalDirectionsUrl(destination);
  }
}

/**
 * The `tel:` URL for a facility's published number.
 *
 * Everything except digits and the few characters a dialler actually
 * understands is stripped. Map data carries numbers as free text — "+44 20 7188
 * 7188 (switchboard)" is a real shape — and passing that through unfiltered
 * produces a URL the dialler rejects without saying why.
 *
 * Returns `null` when nothing dialable survives, so the caller can hide the
 * button rather than offer one that does nothing.
 */
export function buildTelUrl(phone: string): string | null {
  // A leading + is kept only at the front, where it means "international".
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^0-9]/g, '');

  if (digits.length < 3) {
    return null;
  }

  return `tel:${hasPlus ? '+' : ''}${digits}`;
}
