import {
  buildMapLink,
  buildSosMessage,
  formatCoordinates,
  SOS_MESSAGE_FOOTER,
  SOS_NO_LOCATION_LINE,
  SOS_NOTE_MAX_LENGTH,
  type SosLocation,
} from '@/features/sos/sosMessage';

/**
 * The message is the whole product of the SOS feature. These tests exist mainly
 * to protect three promises: it never says the emergency services were called,
 * it never silently omits a missing location, and it never implies more
 * positional precision than the fix supports.
 */

const NOW = Date.UTC(2026, 6, 29, 14, 30, 0);

const LOCATION: SosLocation = {
  latitude: 51.507351,
  longitude: -0.127758,
  accuracyM: 12,
};

describe('buildSosMessage', () => {
  it('names the sender and asks for help', () => {
    const message = buildSosMessage({ senderName: 'Alex Doe', location: LOCATION, now: NOW });
    expect(message).toContain('EMERGENCY: Alex Doe needs help.');
  });

  it('falls back to a neutral subject when no name is stored', () => {
    // A profile can legitimately be missing — the recipient still needs to know
    // the message is about a person, not about the app.
    const message = buildSosMessage({ senderName: '   ', location: LOCATION, now: NOW });
    expect(message).toContain('Someone using this phone needs help.');
  });

  describe('the honesty guarantees', () => {
    it('always states that the emergency services have NOT been contacted', () => {
      const withLocation = buildSosMessage({ senderName: 'A', location: LOCATION, now: NOW });
      const withoutLocation = buildSosMessage({ senderName: 'A', location: null, now: NOW });

      for (const message of [withLocation, withoutLocation]) {
        expect(message).toContain(SOS_MESSAGE_FOOTER);
        expect(message).toContain('has NOT contacted the emergency services');
      }
    });

    it('never claims the message was delivered or that help is coming', () => {
      const message = buildSosMessage({
        senderName: 'A',
        location: LOCATION,
        now: NOW,
        note: 'anything',
      });
      expect(message).not.toMatch(/help is on the way|on its way|has been sent|delivered/i);
      expect(message).not.toMatch(/ambulance|police have been|we have called/i);
    });

    it('states plainly when there is no location instead of omitting it', () => {
      const message = buildSosMessage({ senderName: 'A', location: null, now: NOW });
      expect(message).toContain(SOS_NO_LOCATION_LINE);
      expect(message).toContain('NOT AVAILABLE');
      expect(message).not.toContain('Map:');
    });
  });

  describe('location detail', () => {
    it('includes coordinates and a map link', () => {
      const message = buildSosMessage({ senderName: 'A', location: LOCATION, now: NOW });
      expect(message).toContain('51.50735, -0.12776');
      expect(message).toContain('https://www.google.com/maps/search/?api=1&query=51.50735,-0.12776');
    });

    it('discloses how rough the fix is', () => {
      const message = buildSosMessage({ senderName: 'A', location: LOCATION, now: NOW });
      expect(message).toContain('accurate to within about 20 m');
    });

    it.each([
      [12, 'accurate to within about 20 m'],
      [75, 'accurate to within about 100 m'],
      [400, 'only accurate to a few hundred metres'],
      [5000, 'very approximate'],
    ])('describes an accuracy of %sm honestly', (accuracyM, expected) => {
      const message = buildSosMessage({
        senderName: 'A',
        location: { ...LOCATION, accuracyM },
        now: NOW,
      });
      expect(message).toContain(expected);
    });

    it('omits the accuracy phrase when the platform did not report one', () => {
      const message = buildSosMessage({
        senderName: 'A',
        location: { ...LOCATION, accuracyM: null },
        now: NOW,
      });
      expect(message).toContain('51.50735, -0.12776');
      expect(message).not.toContain('accurate to');
    });

    it('ignores a nonsensical accuracy rather than printing it', () => {
      for (const accuracyM of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
        const message = buildSosMessage({
          senderName: 'A',
          location: { ...LOCATION, accuracyM },
          now: NOW,
        });
        expect(message).not.toContain('accurate to');
      }
    });
  });

  describe('the optional note', () => {
    it('is included when supplied', () => {
      const message = buildSosMessage({
        senderName: 'A',
        location: LOCATION,
        now: NOW,
        note: 'Car is in the ditch past the bridge.',
      });
      expect(message).toContain('Car is in the ditch past the bridge.');
    });

    it('is left out entirely when blank', () => {
      const message = buildSosMessage({
        senderName: 'A',
        location: LOCATION,
        now: NOW,
        note: '   ',
      });
      // No stray blank block where the note would have been.
      expect(message).not.toMatch(/\n\n\n/);
    });

    it('is truncated so one long note cannot bloat the message', () => {
      const message = buildSosMessage({
        senderName: 'A',
        location: LOCATION,
        now: NOW,
        note: 'x'.repeat(SOS_NOTE_MAX_LENGTH + 100),
      });
      expect(message).toContain('x'.repeat(SOS_NOTE_MAX_LENGTH));
      expect(message).not.toContain('x'.repeat(SOS_NOTE_MAX_LENGTH + 1));
    });
  });

  it('includes when the message was composed', () => {
    const message = buildSosMessage({ senderName: 'A', location: LOCATION, now: NOW });
    expect(message).toContain('Sent at:');
    expect(message).toContain(new Date(NOW).toLocaleString());
  });

  it('never throws, whatever it is handed', () => {
    // This runs when someone is already in trouble. A partial message beats an
    // exception every time.
    expect(() => buildSosMessage({ senderName: '', location: null, now: 0 })).not.toThrow();
    expect(() =>
      buildSosMessage({
        senderName: '',
        location: { latitude: 0, longitude: 0, accuracyM: null },
        now: NOW,
        note: undefined,
      }),
    ).not.toThrow();
  });
});

describe('buildMapLink', () => {
  it('produces an https link rather than a geo: URI', () => {
    // geo: is not clickable in the iOS Messages app and does nothing on a
    // desktop; the recipient may be on either.
    const link = buildMapLink({ latitude: 51.507351, longitude: -0.127758 });
    expect(link.startsWith('https://')).toBe(true);
    expect(link).not.toContain('geo:');
  });

  it('keeps five decimal places, including for negative coordinates', () => {
    expect(buildMapLink({ latitude: -33.8688, longitude: 151.2093 })).toContain(
      'query=-33.86880,151.20930',
    );
  });
});

describe('formatCoordinates', () => {
  it('pads to a consistent precision', () => {
    expect(formatCoordinates({ latitude: 1.5, longitude: -2 })).toBe('1.50000, -2.00000');
  });
});
