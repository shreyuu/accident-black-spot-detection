import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { AppButton } from '@/components/AppButton';
import { ThemeProvider } from '@/theme';

/**
 * `render` and `fireEvent` are both async in React Native Testing Library 14.
 * They must be awaited — a missing `await` typechecks fine but silently skips
 * the assertion's setup at runtime.
 */
async function renderButton(ui: ReactElement) {
  return render(<ThemeProvider initialPreference="light">{ui}</ThemeProvider>);
}

describe('AppButton', () => {
  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await renderButton(<AppButton label="Submit" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    await renderButton(<AppButton label="Submit" onPress={onPress} disabled />);

    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  /**
   * Guards against duplicate submissions — the mechanism that stops a
   * double-tap creating two incident reports or two SOS messages.
   */
  it('does not call onPress while loading', async () => {
    const onPress = jest.fn();
    await renderButton(<AppButton label="Submit" onPress={onPress} loading />);

    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reports disabled state to assistive tech, not just visually', async () => {
    await renderButton(<AppButton label="Submit" onPress={jest.fn()} disabled />);

    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('marks itself busy while loading', async () => {
    await renderButton(<AppButton label="Submit" onPress={jest.fn()} loading />);

    const button = screen.getByRole('button', { name: 'Submit' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true });
  });

  it('prefers an explicit accessibility label over the visible one', async () => {
    await renderButton(
      <AppButton label="Send" onPress={jest.fn()} accessibilityLabel="Send SOS message" />,
    );

    expect(screen.getByRole('button', { name: 'Send SOS message' })).toBeTruthy();
  });
});
