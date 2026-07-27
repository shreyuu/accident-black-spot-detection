import {
  chunkByUtf8Bytes,
  chunkKey,
  decodeManifest,
  encodeManifest,
  MAX_VALUE_BYTES,
  sanitizeKey,
  shortHash,
  utf8ByteLength,
} from '@/services/firebase/secureStoreCodec';

/**
 * These helpers sit directly under the auth session. A bug here means either a
 * corrupted credential or a user silently signed out on every launch, so the
 * round-trip properties are tested exhaustively rather than by example.
 */

describe('utf8ByteLength', () => {
  it.each([
    ['', 0],
    ['a', 1],
    ['abc', 3],
    ['£', 2], // U+00A3, two bytes
    ['€', 3], // U+20AC, three bytes
    ['😀', 4], // U+1F600, surrogate pair, four bytes
    ['a£€😀', 1 + 2 + 3 + 4],
  ])('measures %p as %d bytes', (input, expected) => {
    expect(utf8ByteLength(input)).toBe(expected);
  });

  /**
   * Cross-checked against a known-correct encoder rather than against
   * hand-computed numbers, so the test is not just restating the implementation.
   *
   * `TextEncoder` is used in preference to Node's `Buffer` because it is typed by
   * the DOM lib that `expo/tsconfig.base` already includes — reaching for
   * `Buffer` would mean pulling `@types/node` in and leaking Node globals into
   * the type surface of app code that runs on a phone.
   */
  it('agrees with TextEncoder for mixed content', () => {
    const encoder = new TextEncoder();
    const samples = ['hello world', 'naïve café', 'Ω≈ç√∫', '🚗💥🚑', 'a'.repeat(500), ''];

    for (const sample of samples) {
      expect(utf8ByteLength(sample)).toBe(encoder.encode(sample).length);
    }
  });
});

describe('shortHash', () => {
  it('is deterministic — the same key must map to the same entry after a restart', () => {
    expect(shortHash('firebase:authUser:key:[DEFAULT]')).toBe(
      shortHash('firebase:authUser:key:[DEFAULT]'),
    );
  });

  it('distinguishes keys that differ only in punctuation', () => {
    // These collapse to the same sanitised prefix, so the hash is what keeps
    // them apart.
    expect(shortHash('a:b')).not.toBe(shortHash('a-b'));
  });

  it('produces a SecureStore-safe token', () => {
    for (const input of ['', 'a', 'firebase:authUser:x:[DEFAULT]', '😀']) {
      expect(shortHash(input)).toMatch(/^[a-z0-9]+$/);
    }
  });
});

describe('sanitizeKey', () => {
  it("accepts Firebase's real key format, which SecureStore would otherwise reject", () => {
    const firebaseKey = 'firebase:authUser:AIzaSyDemoKey123:[DEFAULT]';
    const sanitized = sanitizeKey(firebaseKey);

    // This is SecureStore's own validation regex.
    expect(sanitized).toMatch(/^[\w.-]+$/);
  });

  it.each([
    'firebase:authUser:key:[DEFAULT]',
    'firebase:persistence:key:[DEFAULT]',
    'firebase:redirectUser:key:[DEFAULT]',
    'simple',
    'with spaces',
    'with/slash',
    'emoji😀key',
  ])('produces a valid key for %p', (input) => {
    expect(sanitizeKey(input)).toMatch(/^[\w.-]+$/);
  });

  it('is deterministic', () => {
    expect(sanitizeKey('firebase:authUser:x')).toBe(sanitizeKey('firebase:authUser:x'));
  });

  it('keeps distinct inputs distinct', () => {
    const keys = [
      'firebase:authUser:key:[DEFAULT]',
      'firebase:authUser:key:[SECOND]',
      'firebase:redirectUser:key:[DEFAULT]',
      'a:b',
      'a-b',
      'a_b',
    ];
    expect(new Set(keys.map(sanitizeKey)).size).toBe(keys.length);
  });

  it('bounds the key length even for a very long input', () => {
    expect(sanitizeKey('x'.repeat(5000)).length).toBeLessThanOrEqual(128);
  });
});

describe('chunkByUtf8Bytes', () => {
  it('returns a single empty chunk for an empty string', () => {
    // "" must stay distinguishable from a missing key, so it cannot produce
    // zero chunks.
    expect(chunkByUtf8Bytes('')).toEqual(['']);
  });

  it('returns one chunk when the value fits', () => {
    expect(chunkByUtf8Bytes('short value')).toEqual(['short value']);
  });

  it('round-trips ASCII content of any length', () => {
    for (const length of [
      1,
      100,
      MAX_VALUE_BYTES - 1,
      MAX_VALUE_BYTES,
      MAX_VALUE_BYTES + 1,
      10_000,
    ]) {
      const value = 'a'.repeat(length);
      expect(chunkByUtf8Bytes(value).join('')).toBe(value);
    }
  });

  it('keeps every chunk within the byte ceiling', () => {
    const value = 'abcdef£€😀'.repeat(800);
    for (const chunk of chunkByUtf8Bytes(value)) {
      expect(utf8ByteLength(chunk)).toBeLessThanOrEqual(MAX_VALUE_BYTES);
    }
  });

  it('never splits a surrogate pair', () => {
    // Emoji are 4 bytes each; a naive length-based split would sever them and
    // corrupt the value on reassembly.
    const value = '😀'.repeat(1000);
    const chunks = chunkByUtf8Bytes(value);

    expect(chunks.join('')).toBe(value);
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/[\uD800-\uDBFF]$/); // no trailing high surrogate
      expect(chunk).not.toMatch(/^[\uDC00-\uDFFF]/); // no leading low surrogate
    }
  });

  it('round-trips a realistic persisted session payload', () => {
    // Approximates what Firebase stores: a JSON user record with two JWTs.
    const jwt = `eyJhbGciOiJSUzI1NiJ9.${'A'.repeat(900)}.${'B'.repeat(342)}`;
    const payload = JSON.stringify({
      uid: 'abc123',
      email: 'someone@example.com',
      displayName: 'Ada Lovelace',
      stsTokenManager: { accessToken: jwt, refreshToken: jwt, expirationTime: 1_800_000_000_000 },
    });

    const chunks = chunkByUtf8Bytes(payload);
    expect(chunks.length).toBeGreaterThan(1); // proves chunking is actually needed
    expect(chunks.join('')).toBe(payload);
  });

  it('respects a custom ceiling', () => {
    expect(chunkByUtf8Bytes('abcdef', 2)).toEqual(['ab', 'cd', 'ef']);
  });

  it('emits an oversized character alone rather than corrupting it', () => {
    // A 4-byte emoji cannot fit a 2-byte ceiling and must not be split.
    expect(chunkByUtf8Bytes('a😀b', 2)).toEqual(['a', '😀', 'b']);
  });

  it('rejects a non-positive ceiling instead of looping forever', () => {
    expect(() => chunkByUtf8Bytes('abc', 0)).toThrow(/greater than zero/);
  });
});

describe('manifest encoding', () => {
  it('round-trips a chunk count', () => {
    expect(decodeManifest(encodeManifest(7))).toEqual({ chunks: 7 });
  });

  it('round-trips zero', () => {
    expect(decodeManifest(encodeManifest(0))).toEqual({ chunks: 0 });
  });

  it('returns null for a missing manifest', () => {
    expect(decodeManifest(null)).toBeNull();
  });

  /**
   * Every malformed case must return null rather than throw: persistence is read
   * during app startup, so an exception here would be a launch crash instead of
   * a harmless "please sign in again".
   */
  it.each([
    ['not json', 'chunks=3'],
    ['wrong type', '{"chunks":"3"}'],
    ['fractional', '{"chunks":1.5}'],
    ['negative', '{"chunks":-1}'],
    ['missing field', '{"other":3}'],
    ['null literal', 'null'],
    ['array', '[3]'],
    ['empty string', ''],
  ])('returns null for a %s manifest', (_label, raw) => {
    expect(decodeManifest(raw)).toBeNull();
  });
});

describe('chunkKey', () => {
  it('produces SecureStore-safe, distinct, ordered keys', () => {
    const base = sanitizeKey('firebase:authUser:key:[DEFAULT]');
    const keys = [0, 1, 2, 10].map((index) => chunkKey(base, index));

    for (const key of keys) {
      expect(key).toMatch(/^[\w.-]+$/);
    }
    expect(new Set(keys).size).toBe(keys.length);
    // Chunk keys must not collide with the manifest key itself.
    expect(keys).not.toContain(base);
  });
});
