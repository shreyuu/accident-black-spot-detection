import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from '@/theme/theme';

/**
 * Theme preference, mirroring `UserProfile.darkModePreference`.
 *
 * "system" follows the OS setting.
 *
 * Phase 11 made this persistent. The preference is hydrated from
 * `preferenceStore` on mount, so a user who chose dark keeps it across
 * restarts rather than being returned to the system setting every launch.
 *
 * The read is done here rather than through `usePreferences` on purpose: the
 * theme has to resolve before anything renders, and `usePreferences` depends on
 * `AuthProvider`, which the theme sits above. Reading the one field directly
 * keeps the provider tree acyclic. `usePreferences` writes the same store, so
 * the two agree.
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

export function ThemeProvider({ children, initialPreference }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(initialPreference ?? 'system');

  // Hydrate from disk, unless a preference was passed in — tests and previews
  // supply one explicitly and must not have it overwritten asynchronously.
  useEffect(() => {
    if (initialPreference !== undefined) {
      return;
    }
    let cancelled = false;

    void (async () => {
      // Imported lazily so the theme layer does not pull AsyncStorage into
      // every test that renders a themed component.
      const { loadPreferences } = await import('@/features/settings/preferenceStore');
      const stored = await loadPreferences();
      if (!cancelled) {
        setPreference(stored.darkModePreference);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialPreference]);

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
