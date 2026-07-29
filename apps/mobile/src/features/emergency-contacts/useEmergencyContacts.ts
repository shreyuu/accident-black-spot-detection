import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import {
  createEmergencyContact,
  deleteEmergencyContact,
  fetchEmergencyContacts,
  setPrimaryContact,
  updateEmergencyContact,
} from '@/features/emergency-contacts/emergencyContactRepository';
import type { EmergencyContact, EmergencyContactInput } from '@/types/domain';
import { toAppError, type AppError } from '@/utils/errors';

/**
 * The signed-in user's emergency contacts.
 *
 * `staleTime: 0` overrides the app-wide five-minute default (see QueryProvider),
 * which is right for black spots and wrong here. A contact edited on one screen
 * and then read on the SOS screen must be the edited one: a stale cache would
 * address an emergency message to a number the user had already corrected, and
 * they would have no way of knowing.
 */

export const emergencyContactsQueryKey = (userId: string | null) =>
  ['emergencyContacts', userId] as const;

export interface UseEmergencyContactsResult {
  contacts: EmergencyContact[];
  loading: boolean;
  refreshing: boolean;
  error: AppError | null;
  refetch: () => void;
}

export function useEmergencyContacts(userId: string | null): UseEmergencyContactsResult {
  const query = useQuery({
    queryKey: emergencyContactsQueryKey(userId),
    enabled: userId !== null,
    queryFn: async () => {
      if (userId === null) {
        return [];
      }
      return fetchEmergencyContacts(userId);
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  return {
    contacts: query.data ?? [],
    loading: query.isLoading,
    refreshing: query.isFetching && !query.isLoading,
    error: query.error === null ? null : toAppError(query.error),
    refetch: () => {
      void query.refetch();
    },
  };
}

export interface UseContactMutationsResult {
  add: (input: EmergencyContactInput, existingCount: number) => Promise<void>;
  update: (contactId: string, input: EmergencyContactInput) => Promise<void>;
  remove: (contactId: string) => Promise<void>;
  makePrimary: (contactId: string) => Promise<void>;
  saving: boolean;
  error: AppError | null;
  clearError: () => void;
}

/**
 * Create, edit, delete and re-prioritise contacts.
 *
 * Every mutation invalidates the list rather than patching the cache by hand.
 * Setting a primary contact rewrites the flag on several documents at once, and
 * hand-maintaining that in the cache is exactly the sort of duplicated logic
 * that drifts out of step with what the server actually did.
 */
export function useContactMutations(userId: string | null): UseContactMutationsResult {
  const queryClient = useQueryClient();

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: emergencyContactsQueryKey(userId) });
  }, [queryClient, userId]);

  const mutation = useMutation({
    mutationFn: async (
      action:
        | { kind: 'add'; input: EmergencyContactInput; existingCount: number }
        | { kind: 'update'; contactId: string; input: EmergencyContactInput }
        | { kind: 'remove'; contactId: string }
        | { kind: 'primary'; contactId: string },
    ): Promise<void> => {
      if (userId === null) {
        throw new Error('No signed-in user.');
      }

      switch (action.kind) {
        case 'add':
          await createEmergencyContact(userId, action.input, action.existingCount);
          return;
        case 'update':
          await updateEmergencyContact(userId, action.contactId, action.input);
          return;
        case 'remove':
          await deleteEmergencyContact(action.contactId);
          return;
        case 'primary':
          await setPrimaryContact(userId, action.contactId);
          return;
      }
    },
    onSuccess: invalidate,
  });

  const { mutateAsync } = mutation;

  return {
    add: useCallback(
      async (input, existingCount) => {
        await mutateAsync({ kind: 'add', input, existingCount });
      },
      [mutateAsync],
    ),
    update: useCallback(
      async (contactId, input) => {
        await mutateAsync({ kind: 'update', contactId, input });
      },
      [mutateAsync],
    ),
    remove: useCallback(
      async (contactId) => {
        await mutateAsync({ kind: 'remove', contactId });
      },
      [mutateAsync],
    ),
    makePrimary: useCallback(
      async (contactId) => {
        await mutateAsync({ kind: 'primary', contactId });
      },
      [mutateAsync],
    ),
    saving: mutation.isPending,
    error: mutation.error === null ? null : toAppError(mutation.error),
    clearError: mutation.reset,
  };
}
