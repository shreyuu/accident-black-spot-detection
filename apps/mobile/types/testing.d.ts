/**
 * Makes Jest's globals (`describe`, `it`, `expect`, `jest`) visible to
 * TypeScript.
 *
 * Why this file rather than a `types` or `typeRoots` entry in tsconfig.json:
 * this is an npm workspace, so `@types/jest` is hoisted to the repository root
 * and `apps/mobile/node_modules/@types` does not exist. TypeScript's *automatic*
 * `@types` inclusion does not pick it up from there, but a triple-slash
 * reference resolves through normal Node module lookup, which does walk up to
 * the workspace root.
 *
 * Setting `"types": ["jest"]` in tsconfig.json would work too, but it disables
 * automatic inclusion for everything else, so `@types/react` would then have to
 * be listed manually and kept in sync by hand.
 */

/// <reference types="jest" />
