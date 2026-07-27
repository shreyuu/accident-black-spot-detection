import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { LocationPermissionGate } from '@/features/location/LocationPermissionGate';
import type { LocationPermissionStatus } from '@/features/location/locationService';
import { ThemeProvider } from '@/theme';
import { AppError } from '@/utils/errors';

async function renderGate(ui: ReactElement) {
  return render(<ThemeProvider initialPreference="light">{ui}</ThemeProvider>);
}

interface Handlers {
  onRequestAccess: jest.Mock;
  onOpenSettings: jest.Mock;
  onRetry: jest.Mock;
}

function handlers(): Handlers {
  return { onRequestAccess: jest.fn(), onOpenSettings: jest.fn(), onRetry: jest.fn() };
}

async function renderFor(
  permission: LocationPermissionStatus,
  overrides: { error?: AppError | null; initialising?: boolean } = {},
) {
  const h = handlers();
  await renderGate(
    <LocationPermissionGate
      permission={permission}
      error={overrides.error ?? null}
      initialising={overrides.initialising ?? false}
      {...h}
    />,
  );
  return h;
}

describe('LocationPermissionGate', () => {
  it('shows a loading state while the initial permission check runs', async () => {
    await renderFor('undetermined', { initialising: true });
    expect(screen.getByLabelText('Checking location access…')).toBeTruthy();
  });

  describe('undetermined', () => {
    it('explains before prompting, rather than asking cold', async () => {
      await renderFor('undetermined');

      // The card is present (its title and its button share the same wording,
      // so the card is located by testID and the button asserted separately).
      expect(screen.getByTestId('permission-request')).toBeTruthy();

      // The three things the user is owed before the OS dialog appears: why it
      // is needed, what happens to the data, and how to turn it off again.
      expect(screen.getByText(/warn you when you approach/i)).toBeTruthy();
      expect(screen.getByText(/not uploaded/i)).toBeTruthy();
      expect(screen.getByText(/turn this off/i)).toBeTruthy();
    });

    it('states that no location history is kept', async () => {
      await renderFor('undetermined');
      expect(screen.getByText(/no location history is kept/i)).toBeTruthy();
    });

    it('makes clear that only foreground access is being requested', async () => {
      await renderFor('undetermined');
      expect(
        screen.getByText(/background monitoring is a separate, optional setting/i),
      ).toBeTruthy();
    });

    it('requests access when the primary action is pressed', async () => {
      const h = await renderFor('undetermined');

      await fireEvent.press(screen.getByRole('button', { name: 'Allow location access' }));
      expect(h.onRequestAccess).toHaveBeenCalledTimes(1);
    });
  });

  describe('denied', () => {
    it('acknowledges the refusal and offers another attempt', async () => {
      await renderFor('denied');

      expect(screen.getByText('Location access is needed')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    });

    it('reassures the user that the rest of the app still works', async () => {
      await renderFor('denied');
      expect(screen.getByText(/Everything else still works/i)).toBeTruthy();
    });

    it('can still prompt, because asking again is possible in this state', async () => {
      const h = await renderFor('denied');

      await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
      expect(h.onRequestAccess).toHaveBeenCalledTimes(1);
      expect(h.onOpenSettings).not.toHaveBeenCalled();
    });
  });

  describe('blocked', () => {
    /**
     * The important distinction. Once permission is permanently refused, no
     * in-app prompt can change it, so offering "Allow access" would be a button
     * that visibly does nothing.
     */
    it('offers system settings instead of a prompt that cannot work', async () => {
      await renderFor('blocked');

      expect(screen.getByRole('button', { name: 'Open settings' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Allow location access' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    it('explains why the app can no longer ask', async () => {
      await renderFor('blocked');
      expect(screen.getByText(/can no longer ask for permission directly/i)).toBeTruthy();
    });

    it('opens settings when pressed', async () => {
      const h = await renderFor('blocked');

      await fireEvent.press(screen.getByRole('button', { name: 'Open settings' }));
      expect(h.onOpenSettings).toHaveBeenCalledTimes(1);
      expect(h.onRequestAccess).not.toHaveBeenCalled();
    });
  });

  describe('granted', () => {
    it('renders nothing, letting the map take over', async () => {
      const { toJSON } = await renderGate(
        <LocationPermissionGate
          permission="granted"
          error={null}
          initialising={false}
          {...handlers()}
        />,
      );
      expect(toJSON()).toBeNull();
    });

    /**
     * Permission can be granted while the device still cannot produce a fix —
     * location services switched off, for instance. That is a different problem
     * with a different fix, so it must not be presented as a permission issue.
     */
    it('shows a retryable error rather than a permission prompt when a fix fails', async () => {
      const h = await renderFor('granted', {
        error: new AppError('unavailable', 'Location services are switched off on this device.', {
          retryable: true,
        }),
      });

      expect(screen.getByText('Could not find your location')).toBeTruthy();
      expect(screen.getByText(/switched off on this device/i)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
      expect(h.onRetry).toHaveBeenCalledTimes(1);
    });
  });
});
