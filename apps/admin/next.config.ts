import type { NextConfig } from 'next';

/**
 * Next.js configuration for the admin dashboard.
 *
 * `transpilePackages` is what lets this app import
 * `@accident-black-spot-detection/shared-types` as TypeScript source. Without it
 * Next treats the workspace package as pre-built JavaScript and fails on the
 * first type annotation — and the whole point of that package is that the two
 * apps read the same source for the vocabulary that also appears in
 * `firestore.rules`.
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@accident-black-spot-detection/shared-types'],
  reactStrictMode: true,
  // The dashboard is an internal tool behind authentication; there is nothing to
  // gain from telling the world which framework version it runs.
  poweredByHeader: false,
  typedRoutes: true,
};

export default nextConfig;
