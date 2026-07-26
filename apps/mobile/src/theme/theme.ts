import { elevation, type ElevationLevel } from '@/theme/elevation';
import {
  darkColors,
  lightColors,
  MIN_TOUCH_TARGET,
  radius,
  spacing,
  typography,
  type ThemeColors,
} from '@/theme/tokens';

/** The resolved theme handed to components by `useTheme()`. */
export interface Theme {
  scheme: 'light' | 'dark';
  isDark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  minTouchTarget: number;
  /** Platform-correct shadow for the given depth, pre-bound to this scheme. */
  elevation: (level: ElevationLevel) => ReturnType<typeof elevation>;
}

function buildTheme(scheme: 'light' | 'dark'): Theme {
  const isDark = scheme === 'dark';
  return {
    scheme,
    isDark,
    colors: isDark ? darkColors : lightColors,
    spacing,
    radius,
    typography,
    minTouchTarget: MIN_TOUCH_TARGET,
    elevation: (level) => elevation(level, isDark),
  };
}

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');
