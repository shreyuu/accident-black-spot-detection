import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

export interface ScreenContainerProps {
  children: ReactNode;
  /** Wraps content in a ScrollView. Turn off for map or other full-bleed screens. */
  scrollable?: boolean;
  /** Removes horizontal padding, for edge-to-edge content such as the map. */
  edgeToEdge?: boolean;
  /**
   * Honour the bottom safe-area inset. Screens inside the tab bar should leave
   * this off — the tab bar already covers that space, and adding the inset again
   * produces a visible dead gap.
   */
  withBottomInset?: boolean;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Standard screen wrapper: themed background, safe-area handling and
 * consistent padding.
 *
 * Safe-area insets are applied here once rather than per screen, which is what
 * keeps layouts correct across notches, Dynamic Island, and Android's
 * edge-to-edge mode (enabled in app.config.ts).
 */
export function ScreenContainer({
  children,
  scrollable = false,
  edgeToEdge = false,
  withBottomInset = false,
  style,
  testID,
}: ScreenContainerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const padding: ViewStyle = {
    paddingHorizontal: edgeToEdge ? 0 : theme.spacing.lg,
    paddingTop: insets.top > 0 ? theme.spacing.sm : theme.spacing.lg,
    paddingBottom: withBottomInset ? insets.bottom + theme.spacing.lg : theme.spacing.lg,
  };

  if (scrollable) {
    return (
      <ScrollView
        testID={testID}
        style={[styles.flex, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={[padding, style]}
        keyboardShouldPersistTaps="handled"
        // Lets users reach content when a large system font size pushes it
        // beyond the viewport.
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View
      testID={testID}
      style={[styles.flex, { backgroundColor: theme.colors.background }, padding, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
