import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from '@/theme/theme';

/**
 * Theme preference, mirroring `UserProfile.darkModePreference`.
 *
 * "system" follows the OS setting. In Phase 1 the preference lives only in
 * memory; Phase 11 persists it and drives it from the Settings screen, at which
 * point `setPreference` will be backed by storage rather than local state.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  /** Overrides the resolved scheme. Used by tests and theme previews. */
  initialPreference?: ThemePreference;
}

export function ThemeProvider({ children, initialPreference = 'system' }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);

  const value = useMemo<ThemeContextValue>(() => {
    const resolved = preference === 'system' ? (systemScheme ?? 'light') : preference;
    return {
      theme: resolved === 'dark' ? darkTheme : lightTheme,
      preference,
      setPreference,
    };
  }, [preference, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Access the active theme.
 *
 * Throws when used outside ThemeProvider. That is deliberate: silently falling
 * back to a default theme hides a real wiring mistake and produces screens that
 * look subtly wrong instead of failing where the bug is.
 */
export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme must be used inside a <ThemeProvider>.');
  }
  return context.theme;
}

/** Read and change the theme preference. Used by the Settings screen. */
export function useThemePreference(): Omit<ThemeContextValue, 'theme'> {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useThemePreference must be used inside a <ThemeProvider>.');
  }
  return { preference: context.preference, setPreference: context.setPreference };
}
