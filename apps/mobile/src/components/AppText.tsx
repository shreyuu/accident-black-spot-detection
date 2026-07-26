import { StyleSheet, Text, type TextProps } from 'react-native';

import { useTheme } from '@/theme';
import type { TypographyToken } from '@/theme/tokens';

type ColorRole = 'text' | 'textMuted' | 'textSubtle' | 'textOnPrimary' | 'danger' | 'primary';

export interface AppTextProps extends TextProps {
  variant?: TypographyToken;
  color?: ColorRole;
  center?: boolean;
}

/**
 * Themed text primitive.
 *
 * Every string in the app renders through this so that colour, type scale and
 * OS font scaling behave consistently. `allowFontScaling` is intentionally left
 * at its default (true) — honouring the user's system font size is an
 * accessibility requirement, not an option.
 */
export function AppText({
  variant = 'body',
  color = 'text',
  center = false,
  style,
  ...rest
}: AppTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        theme.typography[variant],
        { color: theme.colors[color] },
        center && styles.center,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
