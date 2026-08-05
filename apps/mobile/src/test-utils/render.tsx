import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/theme';

/**
 * Render a component inside the providers it needs to mount.
 *
 * Phase 13. Before this, the one component test in the repository wrapped its
 * subject in `ThemeProvider` inline, which worked because that component happens
 * not to read safe-area insets. Anything that does — the proximity banner, every
 * screen — fails at mount with "No safe area value available", and the failure
 * looks like a bug in the component rather than a missing test wrapper.
 *
 * Centralising it means a new screen test starts from something that works, and
 * the metrics below are fixed rather than device-derived so a layout assertion
 * cannot pass or fail depending on which simulator last ran.
 *
 * Excluded from coverage in `jest.config.js`: this is test scaffolding, and
 * counting it would flatter the number without testing anything.
 */

/**
 * Insets for a notched phone.
 *
 * Deliberately non-zero. Zero insets would let a component that ignores them
 * pass a test and then render underneath the status bar on every modern device —
 * which is exactly the class of bug a safe-area inset exists to prevent.
 */
export const TEST_SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Theme to render under. Explicit, because contrast differs between the two. */
  theme?: 'light' | 'dark';
}

export function Providers({
  children,
  theme = 'light',
}: {
  children: ReactNode;
  theme?: 'light' | 'dark';
}) {
  return (
    <SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>
      <ThemeProvider initialPreference={theme}>{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * `render`, with providers.
 *
 * Async because RNTL 14 made `render` async — a missing `await` typechecks and
 * then fails at runtime, which is gotcha 6 in the project's list.
 */
export async function renderWithProviders(
  ui: ReactElement,
  { theme = 'light', ...options }: RenderWithProvidersOptions = {},
) {
  return render(ui, {
    wrapper: ({ children }) => <Providers theme={theme}>{children}</Providers>,
    ...options,
  });
}
