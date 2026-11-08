import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  deleteEmergencyContact,
  setPrimaryContact,
} from '@/features/emergency-contacts/emergencyContactRepository';
import { useContactMutations } from '@/features/emergency-contacts/useEmergencyContacts';

jest.mock('@/features/emergency-contacts/emergencyContactRepository', () => ({
  fetchEmergencyContacts: jest.fn(async () => []),
  createEmergencyContact: jest.fn(),
  updateEmergencyContact: jest.fn(),
  deleteEmergencyContact: jest.fn(),
  setPrimaryContact: jest.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useContactMutations — one-tap actions', () => {
  /**
   * The screen fires `remove` and `makePrimary` from button handlers with
   * `void`, so a rejection had nowhere to go: an unhandled promise rejection
   * (a red screen in development) on top of the error the hook already exposes.
   * They report failure through `error` and resolve.
   */
  it('reports a failed removal through `error` instead of rejecting', async () => {
    jest.mocked(deleteEmergencyContact).mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() => useContactMutations('user-1'), { wrapper });

    await act(async () => {
      await expect(result.current.remove('contact-1')).resolves.toBeUndefined();
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
  });

  it('reports a failed primary change through `error` instead of rejecting', async () => {
    jest.mocked(setPrimaryContact).mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() => useContactMutations('user-1'), { wrapper });

    await act(async () => {
      await expect(result.current.makePrimary('contact-1')).resolves.toBeUndefined();
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
  });
});
