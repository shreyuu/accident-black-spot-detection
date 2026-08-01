import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components';
import { ALERT_RADIUS_STEPS_M, describeAlertRadius } from '@/features/settings/preferences';
import { useTheme } from '@/theme';
import { formatDistance } from '@/utils/geo';

export interface AlertRadiusPickerProps {
  value: number;
  onChange: (metres: number) => void;
  disabled?: boolean;
}

/**
 * How far ahead the user is warned.
 *
 * Discrete steps rather than a slider, for two reasons. A slider offers 1 m of
 * precision against a signal accurate to perhaps 10 m in the open and far worse
 * among buildings — precision the reading does not have. And a slider is a
 * genuinely difficult control to operate with a screen reader or with limited
 * dexterity, whereas these are ordinary buttons with a stated value.
 *
 * The selected step is marked by a border, a filled background **and**
 * `accessibilityState.checked` — never by colour alone, the same rule the risk
 * badges follow.
 */
export function AlertRadiusPicker({ value, onChange, disabled = false }: AlertRadiusPickerProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: theme.spacing.xxs }}
      >
        {ALERT_RADIUS_STEPS_M.map((step) => {
          const selected = step === value;
          return (
            <Pressable
              key={step}
              onPress={() => onChange(step)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              accessibilityLabel={`Warn me ${formatDistance(step)} ahead`}
              hitSlop={4}
              style={[
                styles.step,
                {
                  backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  borderRadius: theme.radius.pill,
                  minHeight: theme.minTouchTarget,
                  opacity: disabled ? 0.5 : 1,
                  paddingHorizontal: theme.spacing.lg,
                },
              ]}
            >
              <AppText
                variant="label"
                color={selected ? 'textOnPrimary' : 'text'}
                testID={`alert-radius-${step}`}
              >
                {formatDistance(step)}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/*
        The consequence of the choice, in words. "500 m" alone does not tell
        someone whether they have given themselves enough time to react.
      */}
      <AppText variant="caption" color="textMuted" accessibilityLiveRegion="polite">
        {describeAlertRadius(value)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { alignItems: 'center', borderWidth: 2, justifyContent: 'center' },
});
