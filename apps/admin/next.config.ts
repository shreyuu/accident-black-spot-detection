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
/**
 * Security headers on every response (SECURITY_AUDIT.md L10).
 *
 * Defence in depth: the `SameSite=Strict` session cookie already means a framed
 * or cross-site copy of the dashboard is signed out. These make the browser
 * refuse to frame it at all, refuse to sniff a response into something
 * executable, and send nowhere the URL a moderator came from.
 *
 * The CSP is deliberately only `frame-ancestors` for now. A script policy that
 * does not break Next's inline bootstrap needs per-request nonces from a proxy,
 * which is a change of its own.
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  transpilePackages: ['@accident-black-spot-detection/shared-types'],
  reactStrictMode: true,
  // The dashboard is an internal tool behind authentication; there is nothing to
  // gain from telling the world which framework version it runs.
  poweredByHeader: false,
  typedRoutes: true,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
