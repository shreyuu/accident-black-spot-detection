import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePlacesQuota, PLACES_QUOTA } from '../placesQuota.ts';

/**
 * A per-account daily allowance on the billable Places proxy.
 *
 * Without one, any signed-in account — and accounts are free — could call the
 * proxy in a loop, each call one billed Places request.
 */

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);

describe('evaluatePlacesQuota', () => {
  it('starts a window on the first lookup', () => {
    assert.deepEqual(evaluatePlacesQuota(null, NOW), {
      allowed: true,
      next: { count: 1, windowStartMs: NOW },
    });
  });

  it('spends one of the allowance inside the window', () => {
    assert.deepEqual(evaluatePlacesQuota({ count: 3, windowStartMs: NOW - HOUR }, NOW), {
      allowed: true,
      next: { count: 4, windowStartMs: NOW - HOUR },
    });
  });

  it('refuses once the allowance is spent', () => {
    const state = { count: PLACES_QUOTA.maxPerWindow, windowStartMs: NOW - HOUR };
    assert.deepEqual(evaluatePlacesQuota(state, NOW), { allowed: false });
  });

  it('starts a new window once the old one has elapsed', () => {
    const state = {
      count: PLACES_QUOTA.maxPerWindow,
      windowStartMs: NOW - (PLACES_QUOTA.windowHours + 1) * HOUR,
    };
    assert.deepEqual(evaluatePlacesQuota(state, NOW), {
      allowed: true,
      next: { count: 1, windowStartMs: NOW },
    });
  });

  it('treats a malformed stored state as a fresh start rather than an error', () => {
    assert.deepEqual(evaluatePlacesQuota({ count: Number.NaN, windowStartMs: NOW }, NOW), {
      allowed: true,
      next: { count: 1, windowStartMs: NOW },
    });
  });
});
