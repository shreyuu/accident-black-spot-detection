import { StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';

export interface AppSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  /** Supporting text. Always rendered, never a tooltip — this is where honesty lives. */
  description?: string;
  disabled?: boolean;
  testID?: string;
}

/**
 * Labelled on/off switch.
 *
 * Wraps the platform `Switch` rather than reimplementing it, so it inherits the
 * native gesture, animation and — importantly — the platform's own accessibility
 * behaviour.
 *
 * The label and description are rendered as one accessible element with the
 * switch. Without that grouping a screen reader announces a bare "off, switch"
 * with no indication of what it controls, and this particular switch turns on
 * background location tracking.
 */
export function AppSwitch({
  value,
  onValueChange,
  label,
  description,
  disabled = false,
  testID,
}: AppSwitchProps) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled }}
      style={[styles.row, { gap: theme.spacing.md, minHeight: theme.minTouchTarget }]}
    >
      <View style={[styles.text, { gap: theme.spacing.xxs }]}>
        <AppText variant="body" color={disabled ? 'textSubtle' : 'text'}>
          {label}
        </AppText>
        {description !== undefined ? (
          <AppText variant="caption" color="textMuted">
            {description}
          </AppText>
        ) : null}
      </View>

      <Switch
        testID={testID}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        // The inner element is hidden from the reader because the wrapper above
        // already announces the role and state; exposing both makes the control
        // read out twice.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
        thumbColor={theme.colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  text: { flex: 1 },
});
