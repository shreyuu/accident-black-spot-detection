import { elevation } from '@/theme/elevation';
import {
  CONTRAST_AA_LARGE,
  CONTRAST_AA_NON_TEXT,
  CONTRAST_AA_NORMAL,
  contrastRatio,
} from '@/utils/contrast';
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

/**
 * Contrast, measured rather than reviewed.
 *
 * Phase 11. Contrast is the accessibility failure that is easiest to ship and
 * hardest to notice: the colours look fine to whoever chose them, on their
 * screen, indoors. This app is read in a car, in daylight, by someone in a
 * hurry — so the tokens are asserted against WCAG 2.1 AA instead.
 */
describe('colour contrast (WCAG 2.1 AA)', () => {
  const schemes = [
    { name: 'light', theme: lightTheme },
    { name: 'dark', theme: darkTheme },
  ] as const;

  describe.each(schemes)('$name', ({ theme }) => {
    const { colors } = theme;

    it.each([
      ['text on background', 'text', 'background'],
      ['text on surface', 'text', 'surface'],
      ['text on surfaceMuted', 'text', 'surfaceMuted'],
      ['textMuted on background', 'textMuted', 'background'],
      ['textMuted on surface', 'textMuted', 'surface'],
      ['danger on background', 'danger', 'background'],
      ['danger on surface', 'danger', 'surface'],
      ['primary on background', 'primary', 'background'],
    ] as const)('%s meets 4.5:1', (_label, foreground, background) => {
      expect(contrastRatio(colors[foreground], colors[background])).toBeGreaterThanOrEqual(
        CONTRAST_AA_NORMAL,
      );
    });

    it('textOnPrimary is readable on the primary fill', () => {
      // Every filled button in the app depends on this pair.
      expect(contrastRatio(colors.textOnPrimary, colors.primary)).toBeGreaterThanOrEqual(
        CONTRAST_AA_NORMAL,
      );
    });

    it('textOnPrimary is readable on the danger fill', () => {
      // The SOS button, which is the one that has to be legible under stress.
      expect(contrastRatio(colors.textOnPrimary, colors.danger)).toBeGreaterThanOrEqual(
        CONTRAST_AA_NORMAL,
      );
    });

    it('textSubtle meets the large-text threshold at minimum', () => {
      // Only ever used at caption size for supporting text, so 3:1 is the
      // applicable bar — but it is asserted rather than assumed.
      expect(contrastRatio(colors.textSubtle, colors.background)).toBeGreaterThanOrEqual(
        CONTRAST_AA_LARGE,
      );
    });

    it('borderStrong is distinguishable from the surface it sits on', () => {
      // Non-text contrast: a control whose boundary cannot be seen is a control
      // that cannot be found.
      expect(contrastRatio(colors.borderStrong, colors.surface)).toBeGreaterThanOrEqual(
        CONTRAST_AA_NON_TEXT,
      );
    });

    it.each(['riskLow', 'riskMedium', 'riskHigh', 'riskCritical'] as const)(
      '%s is distinguishable from the surface behind it',
      (role) => {
        // Risk is never conveyed by colour alone — RiskBadge always carries a
        // label — but the colour still has to be visible to everyone else.
        expect(contrastRatio(colors[role], colors.surface)).toBeGreaterThanOrEqual(
          CONTRAST_AA_NON_TEXT,
        );
      },
    );
  });
});

/**
 * Pressed states, which WCAG does not exempt.
 *
 * A button under a finger is still a button someone has to read, and the
 * pressed fill is a different colour from the resting one.
 */
describe('pressed state contrast', () => {
  it.each([
    { name: 'light', theme: lightTheme },
    { name: 'dark', theme: darkTheme },
  ])('$name keeps button labels readable while pressed', ({ theme }) => {
    expect(
      contrastRatio(theme.colors.textOnPrimary, theme.colors.primaryPressed),
    ).toBeGreaterThanOrEqual(CONTRAST_AA_NORMAL);
    expect(
      contrastRatio(theme.colors.textOnPrimary, theme.colors.dangerPressed),
    ).toBeGreaterThanOrEqual(CONTRAST_AA_NORMAL);
  });
});
