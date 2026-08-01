import {
  buildAddress,
  categoryTagFilters,
  mapOverpassElement,
  mapOverpassResponse,
  readAlwaysOpen,
  type OverpassElement,
} from '@/features/nearby-places/overpassMapping';

function node(tags: Record<string, unknown>, overrides: Partial<OverpassElement> = {}) {
  return {
    type: 'node',
    id: 1234,
    lat: 51.5074,
    lon: -0.1278,
    tags,
    ...overrides,
  } satisfies OverpassElement;
}

describe('categoryTagFilters', () => {
  it('produces the tag filters for the requested categories', () => {
    expect(categoryTagFilters(['hospital', 'police'])).toEqual([
      { key: 'amenity', value: 'hospital' },
      { key: 'amenity', value: 'police' },
    ]);
  });

  it('produces nothing for no categories', () => {
    expect(categoryTagFilters([])).toEqual([]);
  });
});

describe('mapOverpassElement', () => {
  it('maps a named hospital node', () => {
    expect(mapOverpassElement(node({ amenity: 'hospital', name: 'St Mary’s Hospital' }))).toEqual({
      id: 'osm:node:1234',
      name: 'St Mary’s Hospital',
      category: 'hospital',
      latitude: 51.5074,
      longitude: -0.1278,
      source: 'openstreetmap',
    });
  });

  it('maps a police station', () => {
    expect(mapOverpassElement(node({ amenity: 'police', name: 'Central Police' }))?.category).toBe(
      'police',
    );
  });

  it('reads the computed centre of a way, which is how hospitals are usually mapped', () => {
    const way = node(
      { amenity: 'hospital', name: 'General Hospital' },
      { type: 'way', lat: undefined, lon: undefined, center: { lat: 51.51, lon: -0.13 } },
    );

    expect(mapOverpassElement(way)).toMatchObject({
      id: 'osm:way:1234',
      latitude: 51.51,
      longitude: -0.13,
    });
  });

  it('prefixes ids by element type, since OSM numbers nodes and ways separately', () => {
    const asNode = mapOverpassElement(node({ amenity: 'hospital', name: 'A' }));
    const asWay = mapOverpassElement(
      node({ amenity: 'hospital', name: 'A' }, { type: 'way', center: { lat: 51.5, lon: -0.1 } }),
    );

    expect(asNode?.id).not.toBe(asWay?.id);
  });

  it('carries an address, phone and 24/7 flag when they are present', () => {
    const place = mapOverpassElement(
      node({
        amenity: 'hospital',
        name: 'General Hospital',
        'addr:housenumber': '1',
        'addr:street': 'High Street',
        'addr:city': 'London',
        'addr:postcode': 'SW1A 1AA',
        phone: '+44 20 7188 7188',
        opening_hours: '24/7',
      }),
    );

    expect(place).toMatchObject({
      address: '1 High Street, London, SW1A 1AA',
      phone: '+44 20 7188 7188',
      alwaysOpen: true,
    });
  });

  it('falls back through the phone tag aliases', () => {
    expect(
      mapOverpassElement(node({ amenity: 'police', name: 'Station', 'contact:phone': '101' }))
        ?.phone,
    ).toBe('101');
  });

  it('omits optional fields entirely rather than setting them undefined', () => {
    const place = mapOverpassElement(node({ amenity: 'hospital', name: 'Bare' }));

    // Under exactOptionalPropertyTypes an explicit undefined is a different
    // thing, and it survives into the cache as an explicit null.
    expect(Object.keys(place ?? {})).not.toEqual(
      expect.arrayContaining(['address', 'phone', 'alwaysOpen']),
    );
  });

  it.each([
    ['no tags at all', { type: 'node', id: 1, lat: 51.5, lon: -0.1 }],
    ['an unrecognised amenity', node({ amenity: 'cafe', name: 'Coffee' })],
    ['a clinic, which is deliberately not a hospital', node({ amenity: 'clinic', name: 'Clinic' })],
    ['no name', node({ amenity: 'hospital' })],
    ['a blank name', node({ amenity: 'hospital', name: '   ' })],
    ['no position', node({ amenity: 'hospital', name: 'X' }, { lat: undefined, lon: undefined })],
    ['an out-of-range position', node({ amenity: 'hospital', name: 'X' }, { lat: 91, lon: 0 })],
    ['a non-numeric id', node({ amenity: 'hospital', name: 'X' }, { id: { nested: true } })],
  ])('drops an element with %s', (_label, element) => {
    expect(mapOverpassElement(element as OverpassElement)).toBeNull();
  });

  it('uses name:en only when there is no local name', () => {
    expect(
      mapOverpassElement(node({ amenity: 'hospital', name: 'Hôpital', 'name:en': 'Hospital' }))
        ?.name,
    ).toBe('Hôpital');
    expect(mapOverpassElement(node({ amenity: 'hospital', 'name:en': 'Hospital' }))?.name).toBe(
      'Hospital',
    );
  });
});

describe('readAlwaysOpen', () => {
  it('recognises 24/7', () => {
    expect(readAlwaysOpen({ opening_hours: '24/7' })).toBe(true);
    expect(readAlwaysOpen({ opening_hours: ' 24 / 7 ' })).toBe(true);
  });

  it.each([
    ['a weekday schedule', 'Mo-Fr 08:00-18:00'],
    ['a schedule with exceptions', 'Mo-Su 00:00-24:00; PH off'],
    ['an unparseable string', 'by appointment'],
  ])('returns unknown rather than false for %s', (_label, opening_hours) => {
    // Never `false`: implying a hospital is shut on the strength of a
    // half-understood string is the one outcome worth avoiding here.
    expect(readAlwaysOpen({ opening_hours })).toBeUndefined();
  });

  it('returns unknown when the tag is absent', () => {
    expect(readAlwaysOpen({})).toBeUndefined();
  });
});

describe('buildAddress', () => {
  it('joins house number, street, city and postcode', () => {
    expect(
      buildAddress({
        'addr:housenumber': '10',
        'addr:street': 'Downing Street',
        'addr:city': 'London',
        'addr:postcode': 'SW1A 2AA',
      }),
    ).toBe('10 Downing Street, London, SW1A 2AA');
  });

  it('works from a street alone', () => {
    expect(buildAddress({ 'addr:street': 'High Street' })).toBe('High Street');
  });

  it('returns nothing for a postcode on its own, which tells the user nothing', () => {
    expect(buildAddress({ 'addr:postcode': 'SW1A 2AA' })).toBeUndefined();
  });

  it('returns nothing for a house number on its own', () => {
    expect(buildAddress({ 'addr:housenumber': '10' })).toBeUndefined();
  });

  it('returns nothing when there are no address tags', () => {
    expect(buildAddress({})).toBeUndefined();
  });
});

describe('mapOverpassResponse', () => {
  it('maps the usable elements and skips the rest', () => {
    const places = mapOverpassResponse({
      elements: [
        node({ amenity: 'hospital', name: 'Good' }),
        node({ amenity: 'cafe', name: 'Ignored' }),
        null,
        'not an object',
        node({ amenity: 'police', name: 'Also good' }, { id: 99 }),
      ],
    });

    expect(places.map((place) => place.name)).toEqual(['Good', 'Also good']);
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['a missing elements array', {}],
    ['a non-array elements field', { elements: 'no' }],
  ])('returns an empty list for %s', (_label, response) => {
    expect(mapOverpassResponse(response)).toEqual([]);
  });
});
