import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { LoadingIndicator, ScreenContainer } from '@/components';
import { useBackgroundMonitoring } from '@/features/alerts/useBackgroundMonitoring';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme';

/**
 * Main application tabs, gated on an authenticated session.
 *
 * The guard lives in the group layout rather than in each screen, so every
 * current and future tab is protected by construction and a new screen cannot
 * forget to check. Note this is a *usability* boundary, not a security boundary —
 * the real enforcement is in Firestore rules, which reject unauthenticated reads
 * regardless of what the client renders.
 *
 * Every tab carries both an icon and a text label. Icon-only tab bars are hard to
 * interpret at a glance and unusable with a screen reader, and this app is used
 * in a hurry.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { status } = useAuth();

  // Mounted here purely for its reconciliation, so background monitoring is
  // brought back in step on launch rather than only when Settings is opened —
  // the gap Phase 8 left open. The return value is unused; the guard inside
  // is module-level, so this instance and the Settings screen's cannot both
  // act on the same decision.
  useBackgroundMonitoring();

  if (status === 'restoring') {
    return (
      <ScreenContainer>
        <LoadingIndicator fullscreen message="Restoring your session…" />
      </ScreenContainer>
    );
  }

  if (status === 'unauthenticated') {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: theme.typography.titleSmall,
        headerShadowVisible: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSubtle,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: theme.typography.caption,
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarAccessibilityLabel: 'Map. View black spots near you.',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: 'Report',
          tabBarAccessibilityLabel: 'Report. Submit an incident report.',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sos"
        options={{
          title: 'SOS',
          tabBarAccessibilityLabel: 'SOS. Send your location to an emergency contact.',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="alert-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarAccessibilityLabel: 'Settings. Alerts, privacy and account.',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
