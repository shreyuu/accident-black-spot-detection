import { fireEvent, render, screen } from '@testing-library/react-native';

import { BACKGROUND_MONITORING_DISCLOSURE } from '@/constants/disclaimer';
import { BackgroundMonitoringDisclosure } from '@/features/alerts/BackgroundMonitoringDisclosure';
import { ThemeProvider } from '@/theme';

/** `render` is async in RNTL 14 — a missing `await` typechecks and fails at runtime. */
async function renderDisclosure() {
  const onAccept = jest.fn();
  const onCancel = jest.fn();

  await render(
    <ThemeProvider initialPreference="light">
      <BackgroundMonitoringDisclosure visible onAccept={onAccept} onCancel={onCancel} />
    </ThemeProvider>,
  );

  return { onAccept, onCancel };
}

describe('BackgroundMonitoringDisclosure', () => {
  it('shows every disclosure point before anything can be enabled', async () => {
    await renderDisclosure();

    for (const point of BACKGROUND_MONITORING_DISCLOSURE) {
      expect(screen.getByText(point)).toBeTruthy();
    }
  });

  it('states the battery cost', async () => {
    await renderDisclosure();

    expect(screen.getByText(/more battery/i)).toBeTruthy();
  });

  it('says the checks are neither continuous nor guaranteed', async () => {
    await renderDisclosure();

    expect(screen.getByText(/not continuous and are not guaranteed/i)).toBeTruthy();
  });

  it('says the position is never uploaded', async () => {
    await renderDisclosure();

    expect(screen.getByText(/never uploaded/i)).toBeTruthy();
  });

  it('confirms only through an explicit, descriptive action', async () => {
    const { onAccept, onCancel } = await renderDisclosure();

    await fireEvent.press(screen.getByTestId('background-monitoring-accept'));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('treats "Not now" as a refusal', async () => {
    const { onAccept, onCancel } = await renderDisclosure();

    await fireEvent.press(screen.getByText('Not now'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('treats dismissing the dialog as a refusal, never as consent', async () => {
    const { onAccept, onCancel } = await renderDisclosure();

    await fireEvent.press(screen.getByLabelText('Dismiss without turning on background warnings'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });
});
