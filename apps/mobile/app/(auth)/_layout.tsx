import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme';

/**
 * Authentication route group.
 *
 * Signed-in users are redirected away. Without this, a deep link or a lingering
 * back-stack entry could drop an authenticated user onto the login form, where
 * signing in again is confusing and signing out is not what they asked for.
 *
 * `restoring` deliberately falls through to the login screen here rather than
 * showing a spinner: this group is only reached from the splash gate, which has
 * already resolved the session, or by explicit navigation.
 */
export default function AuthLayout() {
  const theme = useTheme();
  const { status } = useAuth();

  if (status === 'authenticated') {
    return <Redirect href="/(tabs)/map" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        headerTitleStyle: theme.typography.titleSmall,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="login" options={{ title: 'Sign in' }} />
      <Stack.Screen name="register" options={{ title: 'Create account' }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Reset password' }} />
    </Stack>
  );
}
