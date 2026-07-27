/**
 * Pure encoding helpers for the SecureStore-backed auth persistence adapter.
 *
 * These live apart from the adapter itself so they can be unit tested without
 * any native module. They exist to work around two hard constraints of
 * `expo-secure-store` that Firebase's key and value shapes both violate:
 *
 *  1. **Key charset.** SecureStore validates keys against `/^[\w.-]+$/`.
 *     Firebase's auth keys look like
 *     `firebase:authUser:AIzaSy...:[DEFAULT]` — the `:` and `[]` characters
 *     make `setItemAsync` throw outright.
 *
 *  2. **Value size.** On Android, SecureStore values are stored via
 *     SharedPreferences with Keystore-backed encryption, and values beyond
 *     roughly 2 KB are documented as unreliable. A persisted Firebase user
 *     record contains an ID token and a refresh token, both JWTs, so it can
 *     comfortably exceed that.
 */

/** Conservative ceiling per stored value, in UTF-8 bytes. */
export const MAX_VALUE_BYTES = 1536;

/**
 * UTF-8 byte length of a string, computed without `TextEncoder` so the helper
 * has no runtime dependency and behaves identically under Jest and Hermes.
 *
 * Iterating with `for...of` walks code *points*, so surrogate pairs are counted
 * once as 4 bytes rather than twice as 3.
 */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x80) {
      bytes += 1;
    } else if (codePoint < 0x800) {
      bytes += 2;
    } else if (codePoint < 0x10000) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes;
}

/**
 * djb2, rendered as unsigned base-36.
 *
 * Used only to keep sanitised keys distinct — never for anything security
 * relevant. It is a collision-resistance aid for a small, fixed set of Firebase
 * key shapes, not a cryptographic hash.
 */
export function shortHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    // `| 0` keeps the intermediate result in int32 range so the result is
    // stable across engines.
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Map an arbitrary storage key onto SecureStore's `[\w.-]` charset.
 *
 * Illegal characters collapse to `_`, which alone would let
 * `a:b` and `a-b`-style variants collide, so a hash of the original key is
 * appended. The result is deterministic: the same input always yields the same
 * SecureStore key, which is what makes reads after a restart work.
 */
export function sanitizeKey(key: string): string {
  const collapsed = key.replace(/[^\w.-]/g, '_');
  // Truncated to leave room for the hash suffix and the chunk index suffix.
  return `${collapsed.slice(0, 96)}.${shortHash(key)}`;
}

/**
 * Split a string into pieces whose UTF-8 encodings each stay within
 * `maxBytes`.
 *
 * Splits only on code-point boundaries, so a surrogate pair is never severed —
 * doing so would corrupt the value on reassembly. An empty input yields a
 * single empty chunk, which keeps "" distinguishable from a missing key.
 */
export function chunkByUtf8Bytes(value: string, maxBytes: number = MAX_VALUE_BYTES): string[] {
  if (maxBytes <= 0) {
    throw new Error('maxBytes must be greater than zero.');
  }
  if (value.length === 0) {
    return [''];
  }

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const character of value) {
    const characterBytes = utf8ByteLength(character);

    // A single character larger than the limit cannot be split further without
    // corrupting it, so it is emitted alone and allowed to exceed the ceiling.
    if (characterBytes > maxBytes) {
      if (current.length > 0) {
        chunks.push(current);
        current = '';
        currentBytes = 0;
      }
      chunks.push(character);
      continue;
    }

    if (currentBytes + characterBytes > maxBytes) {
      chunks.push(current);
      current = character;
      currentBytes = characterBytes;
    } else {
      current += character;
      currentBytes += characterBytes;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/** Manifest recorded against the sanitised base key. */
export interface ChunkManifest {
  /** Number of chunk entries written for this key. */
  chunks: number;
}

export function encodeManifest(chunkCount: number): string {
  return JSON.stringify({ chunks: chunkCount } satisfies ChunkManifest);
}

/**
 * Parse a manifest, returning `null` for anything malformed.
 *
 * Returning `null` rather than throwing is deliberate: a corrupt manifest must
 * degrade to "no stored session" so the user simply signs in again. Throwing
 * here would surface as an app crash on launch.
 */
export function decodeManifest(raw: string | null): ChunkManifest | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'chunks' in parsed &&
      typeof (parsed as { chunks: unknown }).chunks === 'number' &&
      Number.isInteger((parsed as { chunks: number }).chunks) &&
      (parsed as { chunks: number }).chunks >= 0
    ) {
      return { chunks: (parsed as { chunks: number }).chunks };
    }
    return null;
  } catch {
    return null;
  }
}

/** SecureStore key for chunk `index` of `baseKey`. */
export function chunkKey(baseKey: string, index: number): string {
  return `${baseKey}.c${index}`;
}
