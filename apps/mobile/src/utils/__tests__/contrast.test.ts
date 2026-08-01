import {
  CONTRAST_AA_NORMAL,
  contrastRatio,
  meetsContrast,
  parseColor,
  relativeLuminance,
} from '@/utils/contrast';

describe('parseColor', () => {
  it.each([
    ['#ffffff', { r: 255, g: 255, b: 255 }],
    ['#000000', { r: 0, g: 0, b: 0 }],
    ['#1A6FD4', { r: 26, g: 111, b: 212 }],
    ['#fff', { r: 255, g: 255, b: 255 }],
    ['#abc', { r: 170, g: 187, b: 204 }],
    ['rgba(6, 15, 29, 0.55)', { r: 6, g: 15, b: 29 }],
    ['rgb(1, 2, 3)', { r: 1, g: 2, b: 3 }],
  ])('parses %s', (input, expected) => {
    expect(parseColor(input)).toEqual(expected);
  });

  it.each(['transparent', 'red', '', '#12345', 'hsl(0, 0%, 0%)'])(
    'returns null rather than guessing at %s',
    (input) => {
      // A silently mis-parsed colour produces a confidently wrong ratio, which
      // is worse than no ratio at all.
      expect(parseColor(input)).toBeNull();
    },
  );
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white, per the specification', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });

  it('weights green most heavily, as human vision does', () => {
    const green = relativeLuminance({ r: 0, g: 255, b: 0 });
    const red = relativeLuminance({ r: 255, g: 0, b: 0 });
    const blue = relativeLuminance({ r: 0, g: 0, b: 255 });

    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white — the maximum possible', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio('#1a6fd4', '#1a6fd4')).toBeCloseTo(1, 5);
  });

  it('does not depend on which colour is named first', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#000000'), 5);
  });

  it('throws rather than returning a number for an unparseable colour', () => {
    // A test asserting "at least 4.5" against a silently-zero result would pass
    // the moment a colour format changed.
    expect(() => contrastRatio('transparent', '#ffffff')).toThrow(/unrecognised colour format/i);
  });
});

describe('meetsContrast', () => {
  it('accepts black on white', () => {
    expect(meetsContrast('#000000', '#ffffff')).toBe(true);
  });

  it('rejects a pair below the threshold', () => {
    expect(meetsContrast('#777777', '#888888', CONTRAST_AA_NORMAL)).toBe(false);
  });
});
