import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Every dashboard page authorises itself.
 *
 * The group layout's guard is not enough on its own. Next renders from the
 * first route segment that differs from the `Next-Router-State-Tree` the client
 * sends, so a request claiming the `(dashboard)` layout is already mounted gets
 * the page rendered **without** the layout — and without its redirect. That
 * header is client-controlled. A page that reads data therefore has to check
 * the actor itself, close to the read; the layout check stays as defence in
 * depth.
 *
 * Static on purpose, like the repository's other hygiene gates: rendering a
 * server component under test would need a Firebase backend, and the property
 * being protected is "this call is present", which a source check states
 * exactly.
 */

const DASHBOARD_DIR = join(import.meta.dirname, '..', '..', 'app', '(dashboard)');

function findPages(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return findPages(path);
    }
    return entry === 'page.tsx' ? [path] : [];
  });
}

describe('dashboard pages', () => {
  const pages = findPages(DASHBOARD_DIR);

  it('exist, so this test is not vacuously passing', () => {
    assert.ok(pages.length >= 4, `expected at least 4 dashboard pages, found ${pages.length}`);
  });

  for (const page of pages) {
    it(`${relative(DASHBOARD_DIR, page)} resolves the actor itself`, () => {
      const source = readFileSync(page, 'utf8');
      assert.match(
        source,
        /await getDashboardActor\(\)/,
        'a dashboard page must call getDashboardActor() and refuse a null actor — the layout guard can be skipped',
      );
    });
  }
});
