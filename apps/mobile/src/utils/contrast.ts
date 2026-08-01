/**
 * WCAG contrast ratios.
 *
 * Implemented rather than imported so the design tokens can be *tested* against
 * a threshold instead of reviewed by eye. Contrast is the accessibility failure
 * that is easiest to ship and hardest to notice: it looks fine to whoever chose
 * the colours, on their screen, indoors — and this app is read in a car, in
 * daylight, by someone in a hurry.
 *
 * The formulas are from WCAG 2.1 (relative luminance §1.4.3), and the reference
 * values in the tests come from the specification's own worked examples.
 */

/** Thresholds from WCAG 2.1 AA. */
export const CONTRAST_AA_NORMAL = 4.5;
export const CONTRAST_AA_LARGE = 3.0;
/** Non-text contrast, for borders and control boundaries. */
export const CONTRAST_AA_NON_TEXT = 3.0;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse `#rgb`, `#rrggbb`, or `rgba(r, g, b, a)`.
 *
 * Returns `null` for anything unrecognised rather than guessing. A silently
 * mis-parsed colour would produce a contrast figure that is confidently wrong,
 * which is worse than no figure at all.
 */
export function parseColor(value: string): Rgb | null {
  const input = value.trim().toLowerCase();

  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(input);
  if (hexMatch !== null) {
    const hex = hexMatch[1] ?? '';
    const expanded =
      hex.length === 3
        ? hex
            .split('')
            .map((character) => character + character)
            .join('')
        : hex;
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
    };
  }

  const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/.exec(input);
  if (rgbMatch !== null) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }

  return null;
}

/** Relative luminance, per WCAG 2.1. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const normalised = value / 255;
    // The 0.03928 breakpoint and the 2.4 exponent are from the specification.
    return normalised <= 0.03928 ? normalised / 12.92 : ((normalised + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Contrast ratio between two colours, from 1 to 21.
 *
 * Order-independent: contrast is a property of the pair.
 *
 * Throws for an unparseable colour rather than returning a number, because a
 * test asserting "at least 4.5" against a silently-zero result would pass
 * whenever the colour format changed.
 */
export function contrastRatio(foreground: string, background: string): number {
  const front = parseColor(foreground);
  const back = parseColor(background);

  if (front === null || back === null) {
    throw new Error(
      `Cannot compute contrast for ${foreground} on ${background}: unrecognised colour format.`,
    );
  }

  const lighter = Math.max(relativeLuminance(front), relativeLuminance(back));
  const darker = Math.min(relativeLuminance(front), relativeLuminance(back));

  return (lighter + 0.05) / (darker + 0.05);
}

/** Whether a pair meets a threshold, rounded to two decimals as WCAG allows. */
export function meetsContrast(
  foreground: string,
  background: string,
  threshold: number = CONTRAST_AA_NORMAL,
): boolean {
  return Math.round(contrastRatio(foreground, background) * 100) / 100 >= threshold;
}
