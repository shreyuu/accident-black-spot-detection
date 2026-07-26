/**
 * Design tokens — the raw values every component draws from.
 *
 * Nothing in the app should hard-code a colour, font size, spacing value or
 * radius. Import from here (or from the resolved theme via `useTheme`) so that
 * light/dark theming and font scaling work everywhere for free.
 *
 * Accessibility note: colour is never the only carrier of meaning in this app.
 * Risk levels always ship a text label alongside their colour (see RiskBadge),
 * because a colour-only signal is unreadable for colour-blind users and in
 * bright sunlight — both very likely conditions for a road-safety app.
 */

/** Spacing scale, in points. A 4pt base keeps rhythm consistent. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export type SpacingToken = keyof typeof spacing;

/** Corner radii, in points. */
export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;

/**
 * Type scale. `lineHeight` is expressed in points rather than a multiplier so
 * that layout stays predictable when the OS font scale is increased.
 */
export const typography = {
  displayLarge: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  displaySmall: { fontSize: 26, lineHeight: 34, fontWeight: '700' },
  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  titleMedium: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  titleSmall: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;

export type TypographyToken = keyof typeof typography;

/**
 * Minimum interactive target size, in points.
 *
 * 44pt satisfies both Apple's Human Interface Guidelines and, comfortably,
 * Android's 48dp recommendation once padding is included. Enforced by
 * AppButton and any other pressable surface.
 */
export const MIN_TOUCH_TARGET = 44;

/**
 * Base palette. These are raw swatches — components consume the *semantic*
 * colours exposed by the theme, not these directly.
 *
 * Contrast was chosen so that every text-on-surface pairing in both themes
 * meets WCAG 2.1 AA (4.5:1 for body text, 3:1 for large text). Re-verify with
 * the accessibility audit in Phase 11 if any value changes.
 */
const palette = {
  // Deep navy — evokes road signage at night without being pure black.
  navy900: '#060F1D',
  navy800: '#0B1F3A',
  navy700: '#122C4F',
  navy600: '#1B3B66',

  white: '#FFFFFF',
  grey50: '#F6F8FB',
  grey100: '#ECEFF4',
  grey200: '#D8DEE7',
  grey300: '#B3BDCC',
  grey400: '#8794A6',
  grey500: '#5F6B7C',
  grey600: '#414C5C',
  grey700: '#2B3542',

  blue600: '#1B62D6',
  blue500: '#2E7BEF',
  blue300: '#7FB0F7',

  // Risk ramp. Deliberately spans hue *and* lightness so the levels remain
  // distinguishable in greyscale and to colour-blind users.
  green600: '#0F7A4F',
  green300: '#5FCB99',
  amber600: '#A96A00',
  amber300: '#F0B449',
  orange600: '#C1500E',
  orange300: '#F79B5C',
  red600: '#B4232B',
  red300: '#F1888C',

  transparent: 'transparent',
} as const;

/** Semantic colour roles. Both themes implement exactly this shape. */
export interface ThemeColors {
  /** App background, behind all content. */
  background: string;
  /** Raised container: cards, sheets, list rows. */
  surface: string;
  /** A surface resting on another surface — inputs, nested panels. */
  surfaceMuted: string;
  /** Hairlines and dividers. */
  border: string;
  /** Border for a focused or active input. */
  borderStrong: string;

  /** Primary body text. */
  text: string;
  /** Secondary/supporting text. Still AA against `background`. */
  textMuted: string;
  /** Lowest-emphasis text — placeholders, disabled labels. */
  textSubtle: string;
  /** Text drawn on top of `primary`. */
  textOnPrimary: string;

  /** Primary action colour. */
  primary: string;
  primaryPressed: string;
  primaryMuted: string;

  /** Destructive / emergency action colour (SOS). */
  danger: string;
  dangerPressed: string;

  /** Feedback colours. */
  success: string;
  warning: string;
  info: string;

  /** Risk level ramp, low → critical. */
  riskLow: string;
  riskMedium: string;
  riskHigh: string;
  riskCritical: string;

  /** Translucent scrim behind modals. */
  scrim: string;
}

export const lightColors: ThemeColors = {
  background: palette.grey50,
  surface: palette.white,
  surfaceMuted: palette.grey100,
  border: palette.grey200,
  borderStrong: palette.grey400,

  text: palette.navy900,
  textMuted: palette.grey600,
  textSubtle: palette.grey500,
  textOnPrimary: palette.white,

  primary: palette.blue600,
  primaryPressed: '#154FAD',
  primaryMuted: '#E3EDFC',

  danger: palette.red600,
  dangerPressed: '#8E1A21',

  success: palette.green600,
  warning: palette.amber600,
  info: palette.blue600,

  riskLow: palette.green600,
  riskMedium: palette.amber600,
  riskHigh: palette.orange600,
  riskCritical: palette.red600,

  scrim: 'rgba(6, 15, 29, 0.55)',
};

export const darkColors: ThemeColors = {
  background: palette.navy900,
  surface: palette.navy800,
  surfaceMuted: palette.navy700,
  border: palette.navy600,
  borderStrong: palette.grey500,

  text: palette.grey50,
  textMuted: palette.grey300,
  textSubtle: palette.grey400,
  textOnPrimary: palette.white,

  primary: palette.blue500,
  primaryPressed: palette.blue600,
  primaryMuted: '#16304F',

  danger: '#E8535C',
  dangerPressed: palette.red600,

  success: palette.green300,
  warning: palette.amber300,
  info: palette.blue300,

  riskLow: palette.green300,
  riskMedium: palette.amber300,
  riskHigh: palette.orange300,
  riskCritical: palette.red300,

  scrim: 'rgba(0, 0, 0, 0.65)',
};
