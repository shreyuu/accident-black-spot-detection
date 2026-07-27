/**
 * Type declaration for `getReactNativePersistence`, which exists at runtime but
 * is missing from the typed public surface of `firebase@12`.
 *
 * ## Why this file is necessary
 *
 * The symbol genuinely ships. Traced through the installed packages:
 *
 *   1. `firebase/auth` resolves via its `exports` map to
 *      `firebase/auth/dist/esm/index.esm.js`, whose entire content is
 *      `export * from '@firebase/auth';`
 *   2. Metro then resolves `@firebase/auth` using the `react-native` export
 *      condition, which selects `@firebase/auth/dist/rn/index.js`.
 *   3. That React Native build exports `getReactNativePersistence`.
 *
 * So the runtime import works. TypeScript, however, follows the umbrella
 * package's `"types"` key — `firebase/auth/dist/auth/index.d.ts` — and the
 * `firebase` package's `./auth` subpath has **no `react-native` condition at
 * all** (only `browser`, `node`, `default` and `types`). The declaration file it
 * points at therefore never mentions the symbol.
 *
 * Verified with `tsc --traceResolution`: even a direct `@firebase/auth` import
 * resolves to `dist/auth-public.d.ts` rather than `dist/rn/index.rn.d.ts`,
 * despite `expo/tsconfig.base` already setting
 * `customConditions: ["react-native"]`.
 *
 * ## Why this approach over the alternatives
 *
 * - Declaring `types: ["jest"]`-style overrides or custom `typeRoots` does not
 *   help: the problem is the umbrella package's exports map, not type discovery.
 * - Casting to `any` at the call site would silence the error but discard the
 *   `Persistence` return type, which is what makes `initializeAuth` type-safe.
 * - Switching to `@react-native-firebase/auth` would force a development build
 *   from Phase 2 and diverge from the agreed stack.
 *
 * This declaration is narrow: one function, fully typed, no `any`. It should be
 * deleted once Firebase adds a `react-native` condition to the `./auth` subpath.
 *
 * See docs/phase-0-audit.md §3 (risk H1) for the original investigation.
 */

import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  /**
   * The storage contract Firebase expects. `@react-native-async-storage/async-storage`
   * satisfies it directly; our SecureStore-backed adapter implements it
   * deliberately (see src/services/firebase/secureAuthStorage.ts).
   */
  export interface ReactNativeAsyncStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }

  /**
   * Builds a `Persistence` implementation backed by the supplied storage, so
   * that a signed-in session survives an app restart.
   */
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
