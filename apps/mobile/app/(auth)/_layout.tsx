import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/**
 * Authentication route group.
 *
 * TODO(phase-2): redirect away from this group when a session already exists, so
 * a signed-in user cannot land back on the login screen via a deep link or the
 * back stack.
 */
export default function AuthLayout() {
  const theme = useTheme();

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
