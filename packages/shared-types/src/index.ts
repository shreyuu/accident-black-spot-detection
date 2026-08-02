/**
 * Vocabulary and rules shared by `apps/mobile` and `apps/admin`.
 *
 * Consumed as TypeScript source — there is no build step. Metro resolves it
 * through npm workspaces, and Next.js through `transpilePackages`. That keeps a
 * change to a safety-critical enum from needing a publish before the other app
 * can see it.
 *
 * What belongs here: strings, shapes and pure functions that both apps must
 * agree on. What does not: anything that imports React, Firebase, or Expo. This
 * package has no runtime dependencies at all, which is what lets the Firestore
 * rules tests import it too.
 */

export * from './roles.ts';
export * from './vocabulary.ts';
export * from './moderation.ts';
export * from './audit.ts';
export * from './reportLimits.ts';
