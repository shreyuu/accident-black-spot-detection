import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { AppButton, AppText, AppTextInput, ErrorState, ScreenContainer } from '@/components';
import { sendPasswordReset } from '@/features/auth/authService';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '@/features/auth/schemas';
import { useTheme } from '@/theme';
import { toAppError, type AppError } from '@/utils/errors';

/**
 * Password reset screen.
 *
 * The confirmation is deliberately non-committal — "if an account exists for that
 * address" — and is shown identically whether or not the address is registered.
 * A message that confirmed the account exists would make this form an oracle for
 * checking whether a given person uses the app, which for a road-incident and
 * crime-reporting app is itself sensitive information.
 *
 * `sendPasswordReset` cooperates by resolving normally for unknown addresses.
 */
export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [submitError, setSubmitError] = useState<AppError | null>(null);
  const [sent, setSent] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
    mode: 'onBlur',
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await sendPasswordReset(forgotPasswordSchema.parse(values).email);
      setSent(true);
    } catch (error) {
      setSubmitError(toAppError(error));
    }
  });

  if (sent) {
    return (
      <ScreenContainer scrollable testID="forgot-password-sent">
        <View style={{ gap: theme.spacing.lg }}>
          <AppText variant="titleLarge">Check your email</AppText>
          <AppText variant="body" color="textMuted">
            If an account exists for that address, we have sent a link to reset the password. The
            link expires after a short time.
          </AppText>
          <AppText variant="caption" color="textSubtle">
            Nothing arrived? Check your spam folder, then try again.
          </AppText>

          <AppButton
            label="Back to sign in"
            onPress={() => router.replace('/(auth)/login')}
            fullWidth
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable testID="forgot-password-screen">
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xs }}>
          <AppText variant="titleLarge">Reset your password</AppText>
          <AppText variant="bodySmall" color="textMuted">
            Enter your email address and we will send you a link to choose a new password.
          </AppText>
        </View>

        {submitError !== null ? (
          <ErrorState
            error={submitError}
            title="Could not send the email"
            onRetry={() => void onSubmit()}
          />
        ) : null}

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
              returnKeyType="send"
              onSubmitEditing={() => void onSubmit()}
              editable={!isSubmitting}
            />
          )}
        />

        <AppButton
          label="Send reset link"
          onPress={() => void onSubmit()}
          loading={isSubmitting}
          fullWidth
        />
      </View>
    </ScreenContainer>
  );
}
