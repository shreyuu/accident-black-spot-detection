import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Files whose presence means the emulators are holding a **real** credential.
 *
 * `functions/.secret.local` is where the Functions emulator reads secrets from,
 * and where `functions/.env.example` tells a developer to put a real Google
 * Places key. Exposed on the LAN, the proxy would spend it for anyone who asked.
 */
const REAL_SECRET_FILES = ['functions/.secret.local'];

/**
 * The secret files that make LAN mode unsafe, relative to the repository root.
 * Empty means LAN mode may start. `exists` is injectable for tests.
 */
export function secretsBlockingLanMode(repoRoot, exists = existsSync) {
  return REAL_SECRET_FILES.filter((file) => exists(join(repoRoot, file)));
}
