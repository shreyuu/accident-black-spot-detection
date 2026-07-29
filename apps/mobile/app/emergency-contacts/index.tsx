import { useState } from 'react';
import { View } from 'react-native';

import {
  AppButton,
  AppText,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  LoadingIndicator,
  ScreenContainer,
} from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { MAX_EMERGENCY_CONTACTS } from '@/features/emergency-contacts/contactSchemas';
import { EmergencyContactForm } from '@/features/emergency-contacts/EmergencyContactForm';
import { EmergencyContactRow } from '@/features/emergency-contacts/EmergencyContactRow';
import {
  useContactMutations,
  useEmergencyContacts,
} from '@/features/emergency-contacts/useEmergencyContacts';
import { useTheme } from '@/theme';
import type { EmergencyContact, EmergencyContactInput } from '@/types/domain';

/**
 * Manage the people an SOS can be addressed to.
 *
 * These are other people's names and phone numbers, held on their behalf without
 * their knowledge, so the screen says so plainly and keeps the list short. It is
 * also the only place in the app where a delete is offered without a Cloud
 * Function behind it — a contact is the user's own data about someone else, and
 * being able to remove it immediately is the point.
 */
export default function EmergencyContactsScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const userId = user?.uid ?? null;

  const { contacts, loading, error, refetch } = useEmergencyContacts(userId);
  const { add, update, remove, makePrimary, saving, error: mutationError, clearError } =
    useContactMutations(userId);

  const [editing, setEditing] = useState<EmergencyContact | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<EmergencyContact | null>(null);

  const atCapacity = contacts.length >= MAX_EMERGENCY_CONTACTS;
  const showingForm = adding || editing !== null;

  const closeForm = () => {
    setAdding(false);
    setEditing(null);
    clearError();
  };

  const handleSubmit = async (input: EmergencyContactInput): Promise<void> => {
    if (editing !== null) {
      await update(editing.id, input);
    } else {
      await add(input, contacts.length);
    }
    closeForm();
  };

  if (loading) {
    return (
      <ScreenContainer testID="emergency-contacts-loading">
        <LoadingIndicator fullscreen message="Loading your contacts…" />
      </ScreenContainer>
    );
  }

  if (error !== null && contacts.length === 0) {
    return (
      <ScreenContainer testID="emergency-contacts-error">
        <ErrorState error={error} title="Could not load your contacts" onRetry={refetch} />
      </ScreenContainer>
    );
  }

  if (showingForm) {
    return (
      <ScreenContainer scrollable testID="emergency-contact-form" withBottomInset>
        <EmergencyContactForm
          {...(editing === null ? {} : { contact: editing })}
          onSubmit={handleSubmit}
          onCancel={closeForm}
          saving={saving}
          error={mutationError}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable testID="emergency-contacts" withBottomInset>
      <View style={{ gap: theme.spacing.lg }}>
        <AppText variant="bodySmall" color="textMuted">
          These are the people the SOS screen can address a message to. They are stored only for
          your account, are never told they have been added, and are never contacted automatically.
        </AppText>

        {mutationError !== null ? (
          <ErrorState error={mutationError} title="That change could not be saved" />
        ) : null}

        {contacts.length === 0 ? (
          <EmptyState
            title="No emergency contacts yet"
            description="Add someone who could help if you were in trouble — a family member, a friend, or a neighbour."
            testID="emergency-contacts-empty"
          />
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {contacts.map((contact) => (
              <EmergencyContactRow
                key={contact.id}
                contact={contact}
                onEdit={setEditing}
                onDelete={setPendingDelete}
                onMakePrimary={(target) => void makePrimary(target.id)}
                disabled={saving}
              />
            ))}
          </View>
        )}

        <AppButton
          label="Add a contact"
          onPress={() => setAdding(true)}
          disabled={atCapacity || saving}
          fullWidth
          testID="add-contact"
        />

        <AppText variant="caption" color="textSubtle">
          {atCapacity
            ? `You have saved the maximum of ${MAX_EMERGENCY_CONTACTS} contacts. Remove one to add another.`
            : `${contacts.length} of ${MAX_EMERGENCY_CONTACTS} saved.`}
        </AppText>
      </View>

      <ConfirmationDialog
        visible={pendingDelete !== null}
        title="Remove this contact?"
        message={
          pendingDelete === null
            ? ''
            : `${pendingDelete.name} will no longer appear on the SOS screen. You can add them again later.`
        }
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target !== null) {
            void remove(target.id);
          }
        }}
        onCancel={() => setPendingDelete(null)}
        testID="delete-contact-dialog"
      />
    </ScreenContainer>
  );
}
