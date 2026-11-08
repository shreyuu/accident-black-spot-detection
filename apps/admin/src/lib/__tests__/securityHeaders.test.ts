import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import nextConfig from '../../../next.config.ts';

/**
 * Defence in depth for a dashboard that authorises privileged writes. The
 * `SameSite=Strict` session cookie already blunts framing and cross-site
 * requests; these make the browser refuse the rest (SECURITY_AUDIT.md L10).
 */
describe('admin security headers', () => {
  it('are applied to every route', async () => {
    assert.ok(nextConfig.headers, 'next.config.ts should define headers()');
    const rules = await nextConfig.headers();
    const everything = rules.find((rule) => rule.source === '/:path*');
    assert.ok(everything, 'expected a rule covering every path');

    const headers = Object.fromEntries(everything.headers.map(({ key, value }) => [key, value]));

    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.match(headers['Content-Security-Policy'] ?? '', /frame-ancestors 'none'/);
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Referrer-Policy'], 'no-referrer');
  });
});
