import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import {
  AppButton,
  AppText,
  AppTextInput,
  DisclaimerNotice,
  ErrorState,
  ScreenContainer,
} from '@/components';
import { login } from '@/features/auth/authService';
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas';
import { useTheme } from '@/theme';
import { toAppError, type AppError } from '@/utils/errors';

/**
 * Sign-in screen.
 *
 * Navigation after a successful sign-in is intentionally *not* done here.
 * AuthProvider's listener flips the session status, and the `(auth)` group layout
 * redirects on that. Pushing a route manually as well would race the redirect and
 * can leave a duplicated screen on the stack.
 */
export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [submitError, setSubmitError] = useState<AppError | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    // Validate on blur rather than on every keystroke: showing "invalid email"
    // while someone is halfway through typing one is just noise.
    mode: 'onBlur',
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await login(loginSchema.parse(values));
    } catch (error) {
      setSubmitError(toAppError(error));
    }
  });

  return (
    <ScreenContainer scrollable testID="login-screen">
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xs }}>
          <AppText variant="titleLarge">Welcome back</AppText>
          <AppText variant="bodySmall" color="textMuted">
            Sign in to see black spot warnings near you, submit reports and manage emergency
            contacts.
          </AppText>
        </View>

        {submitError !== null ? (
          <ErrorState
            error={submitError}
            title="Could not sign in"
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
              returnKeyType="next"
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
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={() => void onSubmit()}
              editable={!isSubmitting}
            />
          )}
        />

        <AppButton
          label="Sign in"
          onPress={() => void onSubmit()}
          loading={isSubmitting}
          fullWidth
          accessibilityHint="Signs you in and opens the map"
        />

        <View style={{ gap: theme.spacing.sm }}>
          <AppButton
            label="Create an account"
            onPress={() => router.push('/(auth)/register')}
            variant="secondary"
            fullWidth
            disabled={isSubmitting}
          />
          <AppButton
            label="Forgot your password?"
            onPress={() => router.push('/(auth)/forgot-password')}
            variant="ghost"
            fullWidth
            disabled={isSubmitting}
          />
        </View>

        <DisclaimerNotice />
      </View>
    </ScreenContainer>
  );
}
