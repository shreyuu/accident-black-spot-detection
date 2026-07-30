import { formatPhoneForDisplay, toDialString, toTelUri } from '@/features/sos/phoneNumber';

/**
 * A number mangled on its way into a `tel:` URI fails at the worst possible
 * moment. These tests pin down that the transformation only ever removes
 * characters a URI cannot carry — it never rewrites the number itself.
 */

describe('toDialString', () => {
  it('keeps a plain number unchanged', () => {
    expect(toDialString('07700900123')).toBe('07700900123');
  });

  it('strips the separators people actually type', () => {
    expect(toDialString('(077) 009-00123')).toBe('07700900123');
    expect(toDialString('077.009.00123')).toBe('07700900123');
  });

  it('preserves a leading plus for international numbers', () => {
    expect(toDialString('+44 7700 900123')).toBe('+447700900123');
  });

  it('keeps pause and extension characters', () => {
    // Stripping these would break a number that reaches someone via a
    // switchboard — the pause is part of dialling, not decoration.
    expect(toDialString('+441234567890,,123')).toBe('+441234567890,,123');
    expect(toDialString('*67 07700900123')).toBe('*6707700900123');
  });

  it('drops a plus that is not leading', () => {
    expect(toDialString('0770+0900123')).toBe('07700900123');
  });

  it('returns null when nothing diallable remains', () => {
    expect(toDialString('')).toBeNull();
    expect(toDialString('   ')).toBeNull();
    expect(toDialString('not a number')).toBeNull();
    // A lone '+' is not a number.
    expect(toDialString('+')).toBeNull();
  });

  it('never invents digits', () => {
    const result = toDialString('+44 (0) 7700 900123');
    expect(result).toBe('+4407700900123');
    expect(result?.replace(/\D/g, '')).toHaveLength(13);
  });
});

describe('toTelUri', () => {
  it('builds a tel: URI', () => {
    expect(toTelUri('+44 7700 900123')).toBe('tel:+447700900123');
  });

  it('returns null rather than an empty dialler URI', () => {
    // Callers disable the button on null; an empty `tel:` opens a blank dialler,
    // which during an emergency reads as the app being broken.
    expect(toTelUri('nonsense')).toBeNull();
  });
});

describe('formatPhoneForDisplay', () => {
  it('groups a long number for legibility', () => {
    expect(formatPhoneForDisplay('07700900123')).toBe('077 009 001 23');
  });

  it('keeps a leading plus', () => {
    expect(formatPhoneForDisplay('+447700900123')).toBe('+447 700 900 123');
  });

  it('leaves short service numbers alone', () => {
    expect(formatPhoneForDisplay('999')).toBe('999');
    expect(formatPhoneForDisplay('112')).toBe('112');
  });

  it('returns the original when nothing can be parsed', () => {
    // Better to show exactly what was stored than to blank the field — the user
    // needs to recognise their own contact's number.
    expect(formatPhoneForDisplay('call the office')).toBe('call the office');
  });
});
