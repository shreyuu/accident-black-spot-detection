import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { RiskBadge } from '@/components/RiskBadge';
import { ThemeProvider } from '@/theme';
import { RISK_LEVELS } from '@/types/domain';

/**
 * Note the `await`: React Native Testing Library 14 made `render` async (it
 * awaits `act` internally). Forgetting it does not fail typechecking — the
 * floating promise is legal TypeScript — it fails at runtime with
 * "`render` function has not been called", because `screen` is only populated
 * once the promise resolves.
 */
async function renderBadge(ui: ReactElement, scheme: 'light' | 'dark' = 'light') {
  return render(<ThemeProvider initialPreference={scheme}>{ui}</ThemeProvider>);
}

/**
 * These assertions guard an accessibility requirement, not cosmetics: risk must
 * never be conveyed by colour alone. If someone later "simplifies" RiskBadge to
 * a bare coloured dot, these tests fail.
 */
describe('RiskBadge', () => {
  it.each(RISK_LEVELS)('renders a visible text label for the %s level', async (level) => {
    await renderBadge(<RiskBadge level={level} />);
    expect(screen.getByText(new RegExp(level, 'i'))).toBeTruthy();
  });

  it.each(RISK_LEVELS)('exposes the full risk level to screen readers for %s', async (level) => {
    await renderBadge(<RiskBadge level={level} />);
    expect(screen.getByLabelText(/risk$/i)).toBeTruthy();
  });

  it('keeps the full accessibility label in compact mode even though the text shortens', async () => {
    await renderBadge(<RiskBadge level="critical" compact />);

    // Visible text drops the word "risk" to save space...
    expect(screen.getByText('CRITICAL')).toBeTruthy();
    // ...but assistive tech still gets the complete phrase.
    expect(screen.getByLabelText('Critical risk')).toBeTruthy();
  });

  it('renders in the dark theme without throwing', async () => {
    await renderBadge(<RiskBadge level="high" />, 'dark');
    expect(screen.getByLabelText('High risk')).toBeTruthy();
  });
});
