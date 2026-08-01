import {
  buildDirectionsUrl,
  buildTelUrl,
  buildUniversalDirectionsUrl,
} from '@/features/nearby-places/directions';

const DESTINATION = { latitude: 51.5074, longitude: -0.1278 };

describe('buildDirectionsUrl', () => {
  it('opens Apple Maps on iOS', () => {
    expect(buildDirectionsUrl('ios', { destination: DESTINATION })).toBe(
      'maps://?daddr=51.5074,-0.1278&dirflg=d',
    );
  });

  it('uses the geo scheme on Android, repeating the coordinates in the query', () => {
    expect(buildDirectionsUrl('android', { destination: DESTINATION })).toBe(
      'geo:51.5074,-0.1278?q=51.5074%2C-0.1278',
    );
  });

  it('falls back to the universal Google Maps URL elsewhere', () => {
    expect(buildDirectionsUrl('other', { destination: DESTINATION })).toBe(
      buildUniversalDirectionsUrl(DESTINATION),
    );
  });

  it.each(['ios' as const, 'android' as const])(
    'escapes a label containing an ampersand on %s',
    (platform) => {
      const url = buildDirectionsUrl(platform, {
        destination: DESTINATION,
        label: "A&E — St Mary's",
      });

      // An unescaped ampersand terminates the query string early and sends the
      // user somewhere else entirely.
      expect(url).toContain('%26');
      expect(url.split('&').length).toBe(platform === 'ios' ? 3 : 1);
    },
  );

  it.each(['ios' as const, 'android' as const])(
    'omits the label on %s when it is empty',
    (platform) => {
      const withEmpty = buildDirectionsUrl(platform, { destination: DESTINATION, label: '' });

      expect(withEmpty).toBe(buildDirectionsUrl(platform, { destination: DESTINATION }));
    },
  );

  it('includes the label in the Android pin syntax', () => {
    expect(
      buildDirectionsUrl('android', { destination: DESTINATION, label: 'General Hospital' }),
    ).toBe('geo:51.5074,-0.1278?q=51.5074%2C-0.1278(General%20Hospital)');
  });

  it('handles negative coordinates in both hemispheres', () => {
    const url = buildDirectionsUrl('ios', {
      destination: { latitude: -33.8688, longitude: 151.2093 },
    });

    expect(url).toContain('-33.8688,151.2093');
  });
});

describe('buildUniversalDirectionsUrl', () => {
  it('builds a Google Maps universal link', () => {
    expect(buildUniversalDirectionsUrl(DESTINATION)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=51.5074%2C-0.1278',
    );
  });
});

describe('buildTelUrl', () => {
  it('keeps a leading plus for an international number', () => {
    expect(buildTelUrl('+44 20 7188 7188')).toBe('tel:+442071887188');
  });

  it('strips the free text map data routinely carries', () => {
    expect(buildTelUrl('+44 20 7188 7188 (switchboard)')).toBe('tel:+442071887188');
  });

  it('handles a short local number', () => {
    expect(buildTelUrl('101')).toBe('tel:101');
  });

  it('drops a plus that is not at the front', () => {
    expect(buildTelUrl('020 7188 7188 ext+5')).toBe('tel:02071887188' + '5');
  });

  it.each([
    ['an empty string', ''],
    ['pure punctuation', '--- ()'],
    ['too few digits to dial', '12'],
  ])('returns null for %s, so the caller can hide the button', (_label, phone) => {
    expect(buildTelUrl(phone)).toBeNull();
  });
});
