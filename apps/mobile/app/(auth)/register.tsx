import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import {
  AppButton,
  AppCheckbox,
  AppText,
  AppTextInput,
  DisclaimerNotice,
  ErrorState,
  ScreenContainer,
} from '@/components';
import { register } from '@/features/auth/authService';
import { registerSchema, type RegisterFormValues } from '@/features/auth/schemas';
import { useTheme } from '@/theme';
import { toAppError, type AppError } from '@/utils/errors';

/**
 * Registration screen.
 *
 * Passwords are handed straight to Firebase Authentication. Nothing in this app
 * stores, logs or hashes them.
 */
export default function RegisterScreen() {
  const theme = useTheme();
  const [submitError, setSubmitError] = useState<AppError | null>(null);
  const [profileWarning, setProfileWarning] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      acceptedTerms: false,
    },
    mode: 'onBlur',
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setProfileWarning(null);
    try {
      const result = await register(registerSchema.parse(values));

      // Reported honestly rather than hidden: the account exists and the user is
      // signed in, but their profile document did not save. AuthProvider retries
      // creating it, so this is informational, not a dead end.
      if (result.profileWriteFailed) {
        setProfileWarning(
          'Your account was created, but your profile details could not be saved. ' +
            'We will retry automatically — you can carry on using the app.',
        );
      }
      // No navigation here: AuthProvider flips the session status and the (auth)
      // layout redirects. See the note in login.tsx.
    } catch (error) {
      setSubmitError(toAppError(error));
    }
  });

  return (
    <ScreenContainer scrollable testID="register-screen">
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xs }}>
          <AppText variant="titleLarge">Create your account</AppText>
          <AppText variant="bodySmall" color="textMuted">
            You need an account to submit reports and store emergency contacts.
          </AppText>
        </View>

        {submitError !== null ? (
          <ErrorState
            error={submitError}
            title="Could not create your account"
            onRetry={() => void onSubmit()}
          />
        ) : null}

        {profileWarning !== null ? (
          <View
            accessibilityRole="alert"
            style={{
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: theme.radius.md,
              padding: theme.spacing.md,
            }}
          >
            <AppText variant="bodySmall" color="textMuted">
              {profileWarning}
            </AppText>
          </View>
        ) : null}

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value } }) => (
            <AppTextInput
              label="Full name"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              {...(errors.name?.message === undefined ? {} : { error: errors.name.message })}
              autoComplete="name"
              textContentType="name"
              autoCapitalize="words"
              editable={!isSubmitting}
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <AppTextInput
              label="Email"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              {...(errors.email?.message === undefined ? {} : { error: errors.email.message })}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              autoCorrect={false}
              placeholder="name@example.com"
              editable={!isSubmitting}
            />
          )}
        />

        <Controller
          control={control}
          name="phone"
          render={({ field: { onChange, onBlur, value } }) => (
            <AppTextInput
              label="Phone number"
              optional
              value={value ?? ''}
              onChangeText={onChange}
              onBlur={onBlur}
              {...(errors.phone?.message === undefined ? {} : { error: errors.phone.message })}
              hint="Only used if you choose to include it in an SOS message."
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              editable={!isSubmitting}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <AppTextInput
              label="Password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              {...(errors.password?.message === undefined
                ? {}
                : { error: errors.password.message })}
              hint="At least 8 characters, including a letter and a number."
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              editable={!isSubmitting}
            />
          )}
        />

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, onBlur, value } }) => (
            <AppTextInput
              label="Confirm password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              {...(errors.confirmPassword?.message === undefined
                ? {}
                : { error: errors.confirmPassword.message })}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              editable={!isSubmitting}
            />
          )}
        />

        <Controller
          control={control}
          name="acceptedTerms"
          render={({ field: { onChange, value } }) => (
            <AppCheckbox
              checked={value}
              onChange={onChange}
              label="I accept the terms of use and privacy notice, and understand this app provides informational warnings only."
              {...(errors.acceptedTerms?.message === undefined
                ? {}
                : { error: errors.acceptedTerms.message })}
              testID="accept-terms"
            />
          )}
        />

        <AppButton
          label="Create account"
          onPress={() => void onSubmit()}
          loading={isSubmitting}
          fullWidth
        />

        <DisclaimerNotice />
      </View>
    </ScreenContainer>
  );
}
