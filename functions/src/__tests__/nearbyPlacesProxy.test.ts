import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normaliseProxyRequest } from '../nearbyPlacesProxy.ts';

/**
 * Validation at the boundary between a client and a billable third-party API.
 *
 * Every value crossing it needs bounding. An unbounded radius or an open list of
 * place types would be somebody else running their searches on this project's
 * billing account, and the proxy exists precisely so that the credential is no
 * longer the client's to misuse.
 */

const valid = { latitude: 51.5074, longitude: -0.1278, radiusM: 2000, includedTypes: ['hospital'] };

describe('normaliseProxyRequest', () => {
  it('accepts a well-formed request', () => {
    const result = normaliseProxyRequest(valid);

    assert.equal(result.radiusM, 2000);
    assert.deepEqual(result.includedTypes, ['hospital']);
  });

  it('rounds coordinates to five decimal places before they leave', () => {
    // About a metre. Enough to find a hospital, not enough to describe where
    // somebody is standing — and done here rather than trusted to the caller,
    // because a proxy that trusted its caller would not be a privacy control.
    const result = normaliseProxyRequest({
      ...valid,
      latitude: 51.50740123456,
      longitude: -0.12780987654,
    });

    assert.equal(result.latitude, 51.5074);
    assert.equal(result.longitude, -0.12781);
  });

  it('caps the radius rather than forwarding an enormous one', () => {
    assert.equal(normaliseProxyRequest({ ...valid, radiusM: 10_000_000 }).radiusM, 50_000);
  });

  it('rejects coordinates outside the valid range', () => {
    for (const bad of [
      { latitude: 91 },
      { latitude: -91 },
      { longitude: 181 },
      { longitude: -181 },
      { latitude: Number.NaN },
      { longitude: 'north' },
    ]) {
      assert.throws(
        () => normaliseProxyRequest({ ...valid, ...bad }),
        `should reject ${JSON.stringify(bad)}`,
      );
    }
  });

  it('rejects a non-positive radius', () => {
    assert.throws(() => normaliseProxyRequest({ ...valid, radiusM: 0 }));
    assert.throws(() => normaliseProxyRequest({ ...valid, radiusM: -5 }));
  });

  it('drops place types outside the allow-list', () => {
    // Otherwise this is a general-purpose Places gateway with somebody else's
    // key in it, rather than a proxy for two facility kinds.
    const result = normaliseProxyRequest({
      ...valid,
      includedTypes: ['hospital', 'casino', 'restaurant', 'police'],
    });

    assert.deepEqual(result.includedTypes.sort(), ['hospital', 'police']);
  });

  it('rejects a request with no supported type left', () => {
    assert.throws(() => normaliseProxyRequest({ ...valid, includedTypes: ['casino'] }));
    assert.throws(() => normaliseProxyRequest({ ...valid, includedTypes: [] }));
    assert.throws(() => normaliseProxyRequest({ ...valid, includedTypes: 'hospital' }));
  });

  it('de-duplicates repeated types', () => {
    const result = normaliseProxyRequest({
      ...valid,
      includedTypes: ['hospital', 'hospital', 'hospital'],
    });

    assert.deepEqual(result.includedTypes, ['hospital']);
  });

  it('rejects a payload that is not an object', () => {
    for (const bad of [null, undefined, 'hospital', 42, []]) {
      assert.throws(() => normaliseProxyRequest(bad));
    }
  });
});
