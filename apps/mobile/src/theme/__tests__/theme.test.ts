import { elevation } from '@/theme/elevation';
import { darkTheme, lightTheme } from '@/theme/theme';
import { darkColors, lightColors } from '@/theme/tokens';

describe('theme', () => {
  it('exposes matching colour roles in both schemes', () => {
    // A role present in one theme but missing from the other produces an
    // invisible element in exactly one appearance mode — easy to ship, hard to
    // notice. Compare the key sets instead of trusting review.
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it('sets isDark consistently with the scheme', () => {
    expect(lightTheme.isDark).toBe(false);
    expect(lightTheme.scheme).toBe('light');
    expect(darkTheme.isDark).toBe(true);
    expect(darkTheme.scheme).toBe('dark');
  });

  it('meets the 44pt minimum touch target', () => {
    expect(lightTheme.minTouchTarget).toBeGreaterThanOrEqual(44);
  });

  it('uses different backgrounds per scheme', () => {
    expect(lightTheme.colors.background).not.toBe(darkTheme.colors.background);
  });

  it('exposes a distinct colour for every risk level', () => {
    for (const theme of [lightTheme, darkTheme]) {
      const riskColors = [
        theme.colors.riskLow,
        theme.colors.riskMedium,
        theme.colors.riskHigh,
        theme.colors.riskCritical,
      ];
      expect(new Set(riskColors).size).toBe(riskColors.length);
    }
  });
});

describe('elevation', () => {
  it('returns no shadow at level 0', () => {
    expect(elevation(0, false)).toEqual({});
  });

  it('produces a style for raised levels', () => {
    expect(Object.keys(elevation(2, false)).length).toBeGreaterThan(0);
  });

  it('uses a stronger shadow in dark mode, where a faint one is invisible', () => {
    const light = elevation(2, false);
    const dark = elevation(2, true);

    // Only iOS/web express opacity; on Android both collapse to `elevation`.
    if ('shadowOpacity' in light && 'shadowOpacity' in dark) {
      expect(dark.shadowOpacity).toBeGreaterThan(light.shadowOpacity as number);
    } else {
      expect(dark).toEqual(light);
    }
  });
});
