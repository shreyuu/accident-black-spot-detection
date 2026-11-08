/**
 * Which stored `imageUrls` the moderation queue may render as links.
 *
 * The field is written by the reporter's own client. `firestore.rules` now
 * requires each entry to be a download URL for the reporter's own upload, but
 * this is the dashboard's half of the pair — the Admin SDK bypasses the rules,
 * values stored before that rule existed are still there, and a link a
 * moderator clicks from a page holding their session is worth checking twice
 * (SECURITY_AUDIT.md L3).
 */

const STORAGE_ORIGIN = 'https://firebasestorage.googleapis.com';

/** Hosts the Storage emulator is reached on in development. */
const EMULATOR_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '10.0.2.2']);
const EMULATOR_PORT = '9199';

function isDisplayable(url: string, usingEmulators: boolean): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.origin === STORAGE_ORIGIN) {
    return parsed.pathname.startsWith('/v0/b/');
  }

  return (
    usingEmulators &&
    parsed.protocol === 'http:' &&
    EMULATOR_HOSTNAMES.has(parsed.hostname) &&
    parsed.port === EMULATOR_PORT
  );
}

/** The entries safe to render, de-duplicated, in their stored order. */
export function displayableImageUrls(
  values: readonly unknown[],
  usingEmulators: boolean,
): string[] {
  const urls = values.filter(
    (value): value is string => typeof value === 'string' && isDisplayable(value, usingEmulators),
  );
  return [...new Set(urls)];
}
