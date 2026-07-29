import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { AppButton, AppCheckbox, AppText, AppTextInput, ErrorState } from '@/components';
import {
  CONTACT_RELATIONSHIP_MAX_LENGTH,
  emergencyContactFormSchema,
  type EmergencyContactFormValues,
} from '@/features/emergency-contacts/contactSchemas';
import { useTheme } from '@/theme';
import type { EmergencyContact, EmergencyContactInput } from '@/types/domain';
import type { AppError } from '@/utils/errors';

export interface EmergencyContactFormProps {
  /** Supplied when editing; absent when adding. */
  contact?: EmergencyContact | undefined;
  onSubmit: (input: EmergencyContactInput) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: AppError | null;
}

/**
 * Add or edit one emergency contact.
 *
 * The phone number is required here even though the user's own is optional
 * elsewhere: a contact with no number is a name the app can do nothing with, and
 * storing another person's details for no actionable purpose is exactly what the
 * project's data-minimisation rule forbids.
 */
export function EmergencyContactForm({
  contact,
  onSubmit,
  onCancel,
  saving,
  error,
}: EmergencyContactFormProps) {
  const theme = useTheme();
  const isEditing = contact !== undefined;

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<EmergencyContactFormValues>({
    resolver: zodResolver(emergencyContactFormSchema),
    defaultValues: {
      name: contact?.name ?? '',
      phone: contact?.phone ?? '',
      relationship: contact?.relationship ?? '',
      isPrimary: contact?.isPrimary ?? false,
    },
    mode: 'onBlur',
  });

  const submit = handleSubmit(async (values) => {
    const parsed = emergencyContactFormSchema.parse(values);
    await onSubmit({
      name: parsed.name,
      phone: parsed.phone,
      // Omitted rather than undefined, so the repository can distinguish
      // "no label" from "label removed".
      ...(parsed.relationship === undefined || parsed.relationship.length === 0
        ? {}
        : { relationship: parsed.relationship }),
      isPrimary: parsed.isPrimary,
    });
  });

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <AppText variant="titleMedium">
        {isEditing ? 'Edit emergency contact' : 'Add an emergency contact'}
      </AppText>

      <AppText variant="caption" color="textSubtle">
        This person is not notified that you have added them, and nothing is ever sent to them
        without you pressing send yourself.
      </AppText>

      {error !== null ? <ErrorState error={error} title="Could not save this contact" /> : null}

      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <AppTextInput
            label="Name"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            {...(errors.name?.message === undefined ? {} : { error: errors.name.message })}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            editable={!saving}
            testID="contact-name"
          />
        )}
      />

      <Controller
        control={control}
        name="phone"
        render={({ field: { onChange, onBlur, value } }) => (
          <AppTextInput
            label="Phone number"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            {...(errors.phone?.message === undefined ? {} : { error: errors.phone.message })}
            hint="Include the country code if they may be abroad."
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            editable={!saving}
            testID="contact-phone"
          />
        )}
      />

      <Controller
        control={control}
        name="relationship"
        render={({ field: { onChange, onBlur, value } }) => (
          <AppTextInput
            label="Relationship"
            optional
            value={value ?? ''}
            onChangeText={onChange}
            onBlur={onBlur}
            {...(errors.relationship?.message === undefined
              ? {}
              : { error: errors.relationship.message })}
            hint="Helps you tell two similar names apart, for example “Sister”."
            maxLength={CONTACT_RELATIONSHIP_MAX_LENGTH}
            editable={!saving}
            testID="contact-relationship"
          />
        )}
      />

      <Controller
        control={control}
        name="isPrimary"
        render={({ field: { onChange, value } }) => (
          <AppCheckbox
            checked={value}
            onChange={onChange}
            label="Select this contact by default on the SOS screen"
            testID="contact-primary"
          />
        )}
      />

      <View style={{ gap: theme.spacing.sm }}>
        <AppButton
          label={isEditing ? 'Save changes' : 'Add contact'}
          onPress={() => void submit()}
          loading={saving}
          fullWidth
          testID="contact-save"
        />
        <AppButton
          label="Cancel"
          variant="ghost"
          onPress={onCancel}
          disabled={saving}
          fullWidth
          testID="contact-cancel"
        />
      </View>
    </View>
  );
}
