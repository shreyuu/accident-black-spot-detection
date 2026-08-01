import {
  categoryForTypes,
  includedTypesFor,
  mapGooglePlace,
  mapGooglePlacesResponse,
  type GooglePlaceResult,
} from '@/features/nearby-places/googlePlacesMapping';

function result(overrides: Partial<GooglePlaceResult> = {}): GooglePlaceResult {
  return {
    id: 'ChIJabc123',
    displayName: { text: 'General Hospital' },
    location: { latitude: 51.5074, longitude: -0.1278 },
    types: ['hospital', 'health', 'point_of_interest'],
    ...overrides,
  };
}

describe('includedTypesFor', () => {
  it('maps our categories onto Google types', () => {
    expect(includedTypesFor(['hospital', 'police']).sort()).toEqual(['hospital', 'police']);
  });

  it('de-duplicates when categories share a type', () => {
    expect(includedTypesFor(['hospital', 'hospital'])).toEqual(['hospital']);
  });

  it('returns nothing for no categories', () => {
    expect(includedTypesFor([])).toEqual([]);
  });
});

describe('categoryForTypes', () => {
  it('finds our category among the many types Google returns', () => {
    expect(categoryForTypes(['point_of_interest', 'establishment', 'police'])).toBe('police');
  });

  it('returns null when nothing matches', () => {
    expect(categoryForTypes(['restaurant', 'establishment'])).toBeNull();
  });

  it('ignores non-string entries rather than throwing', () => {
    expect(categoryForTypes([null, 42, 'hospital'])).toBe('hospital');
  });
});

describe('mapGooglePlace', () => {
  it('maps a hospital result', () => {
    expect(mapGooglePlace(result())).toEqual({
      id: 'google:ChIJabc123',
      name: 'General Hospital',
      category: 'hospital',
      latitude: 51.5074,
      longitude: -0.1278,
      source: 'google-places',
    });
  });

  it('prefixes the id so it cannot collide with an OpenStreetMap one', () => {
    expect(mapGooglePlace(result())?.id.startsWith('google:')).toBe(true);
  });

  it('prefers the international phone number over the national one', () => {
    const place = mapGooglePlace(
      result({
        nationalPhoneNumber: '020 7188 7188',
        internationalPhoneNumber: '+44 20 7188 7188',
      }),
    );

    expect(place?.phone).toBe('+44 20 7188 7188');
  });

  it('falls back to the national number when that is all there is', () => {
    expect(mapGooglePlace(result({ nationalPhoneNumber: '020 7188 7188' }))?.phone).toBe(
      '020 7188 7188',
    );
  });

  it('carries the formatted address', () => {
    expect(mapGooglePlace(result({ formattedAddress: '1 High St, London' }))?.address).toBe(
      '1 High St, London',
    );
  });

  it('never turns "open now" into "open 24 hours"', () => {
    // Different claims. Conflating them would tell someone at 3am that a
    // daytime clinic never closes.
    const place = mapGooglePlace(result({ regularOpeningHours: { openNow: true } }));

    expect(place?.alwaysOpen).toBeUndefined();
    expect(Object.keys(place ?? {})).not.toContain('alwaysOpen');
  });

  it.each([
    ['a missing id', { id: undefined }],
    ['a blank id', { id: '  ' }],
    ['a missing display name', { displayName: undefined }],
    ['a blank display name', { displayName: { text: '' } }],
    ['a missing location', { location: undefined }],
    ['a non-numeric latitude', { location: { latitude: '51.5', longitude: -0.1 } }],
    ['an out-of-range latitude', { location: { latitude: 91, longitude: -0.1 } }],
    ['no recognised type', { types: ['restaurant'] }],
    ['a missing types array', { types: undefined }],
  ])('drops a result with %s', (_label, overrides) => {
    expect(mapGooglePlace(result(overrides as Partial<GooglePlaceResult>))).toBeNull();
  });
});

describe('mapGooglePlacesResponse', () => {
  it('maps the usable results and skips the rest', () => {
    const places = mapGooglePlacesResponse({
      places: [
        result(),
        result({ id: 'other', types: ['restaurant'] }),
        null,
        result({ id: 'p1', displayName: { text: 'Central Police' }, types: ['police'] }),
      ],
    });

    expect(places.map((place) => place.name)).toEqual(['General Hospital', 'Central Police']);
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['a missing places array', {}],
    ['an error payload', { error: { code: 403, message: 'denied' } }],
  ])('returns an empty list for %s', (_label, response) => {
    expect(mapGooglePlacesResponse(response)).toEqual([]);
  });
});
