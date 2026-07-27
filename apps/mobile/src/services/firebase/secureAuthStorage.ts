import * as SecureStore from 'expo-secure-store';
import type { ReactNativeAsyncStorage } from 'firebase/auth';

import {
  chunkByUtf8Bytes,
  chunkKey,
  decodeManifest,
  encodeManifest,
  sanitizeKey,
} from '@/services/firebase/secureStoreCodec';
import { logger } from '@/utils/logger';

/**
 * Firebase auth persistence backed by `expo-secure-store`.
 *
 * ## Why not AsyncStorage
 *
 * Firebase's documented React Native setup passes AsyncStorage to
 * `getReactNativePersistence`. What gets persisted is the signed-in user record
 * including a **refresh token** — a long-lived credential that can mint new
 * access tokens. AsyncStorage keeps that as plaintext in the app sandbox, where
 * it is readable from a filesystem backup or on a rooted/jailbroken device.
 *
 * SecureStore stores it in the iOS Keychain and Android Keystore instead. That
 * also honours this project's own rule that SecureStore holds sensitive values
 * while AsyncStorage is reserved for non-sensitive cache.
 *
 * ## Failure behaviour
 *
 * Every read failure degrades to `null` — "no stored session" — so a corrupt or
 * partially written entry means the user signs in again. It never throws, since
 * persistence is consulted during app startup and an exception there would be a
 * launch crash.
 *
 * ## Write ordering
 *
 * Chunks are written before the manifest, and stale chunks are pruned after.
 * A crash mid-write therefore leaves the old manifest (or none) rather than a
 * manifest pointing at chunks that were never stored.
 */

async function readRaw(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    logger.warn('secureAuthStorage', 'Failed to read a SecureStore entry', {
      // The key is logged, never the value — the value is a credential.
      key,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

async function deleteRaw(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Deleting a key that does not exist is not an error worth surfacing.
  }
}

/**
 * Remove chunks for `baseKey` from `fromIndex` upward.
 *
 * Bounded rather than unbounded so a corrupt manifest cannot cause an endless
 * delete loop. The cap is far above any realistic session size.
 */
async function pruneChunksFrom(baseKey: string, fromIndex: number, upTo: number): Promise<void> {
  const limit = Math.min(upTo, 512);
  for (let index = fromIndex; index < limit; index += 1) {
    await deleteRaw(chunkKey(baseKey, index));
  }
}

export const secureAuthStorage: ReactNativeAsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    const baseKey = sanitizeKey(key);
    const manifest = decodeManifest(await readRaw(baseKey));

    if (manifest === null) {
      return null;
    }

    const parts: string[] = [];
    for (let index = 0; index < manifest.chunks; index += 1) {
      const part = await readRaw(chunkKey(baseKey, index));
      if (part === null) {
        // A missing chunk means the stored value is incomplete and cannot be
        // trusted. Clear it out so the next write starts from a clean slate.
        logger.warn('secureAuthStorage', 'Discarding an incomplete stored session', {
          chunkIndex: index,
          expectedChunks: manifest.chunks,
        });
        await this.removeItem(key);
        return null;
      }
      parts.push(part);
    }

    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const baseKey = sanitizeKey(key);
    const previous = decodeManifest(await readRaw(baseKey));
    const chunks = chunkByUtf8Bytes(value);

    try {
      // Chunks first, manifest last — see "Write ordering" above.
      for (const [index, part] of chunks.entries()) {
        await SecureStore.setItemAsync(chunkKey(baseKey, index), part);
      }
      await SecureStore.setItemAsync(baseKey, encodeManifest(chunks.length));
    } catch (error) {
      logger.error('secureAuthStorage', 'Failed to persist the session', error, {
        chunkCount: chunks.length,
      });
      // Leave nothing half-written; the user re-authenticates instead of the app
      // reading back a corrupt credential.
      await this.removeItem(key);
      return;
    }

    // Drop chunks left over from a longer previous value.
    if (previous !== null && previous.chunks > chunks.length) {
      await pruneChunksFrom(baseKey, chunks.length, previous.chunks);
    }
  },

  async removeItem(key: string): Promise<void> {
    const baseKey = sanitizeKey(key);
    const manifest = decodeManifest(await readRaw(baseKey));

    // Remove the manifest first so a crash cannot leave it pointing at deleted
    // chunks, which would read back as a corrupt entry.
    await deleteRaw(baseKey);

    // Prune generously: if the manifest was unreadable, sweep a small fixed
    // range so orphaned chunks are not left behind indefinitely.
    await pruneChunksFrom(baseKey, 0, manifest?.chunks ?? 8);
  },
};
