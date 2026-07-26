import { Platform, type ViewStyle } from 'react-native';

/**
 * Cross-platform elevation.
 *
 * iOS and Android express depth differently: iOS uses layered shadow
 * properties, Android uses a single `elevation` value driven by the system.
 * Writing both by hand at every call site is how platform drift creeps in, so
 * every shadow in the app goes through this helper.
 *
 * In dark themes a drop shadow is nearly invisible against a dark background,
 * so `shadowOpacity` is raised there to keep surfaces separable.
 */

export type ElevationLevel = 0 | 1 | 2 | 3;

interface ElevationSpec {
  offsetY: number;
  radius: number;
  opacityLight: number;
  opacityDark: number;
  android: number;
}

const SPECS: Record<ElevationLevel, ElevationSpec> = {
  0: { offsetY: 0, radius: 0, opacityLight: 0, opacityDark: 0, android: 0 },
  1: { offsetY: 1, radius: 3, opacityLight: 0.08, opacityDark: 0.3, android: 2 },
  2: { offsetY: 3, radius: 8, opacityLight: 0.12, opacityDark: 0.4, android: 5 },
  3: { offsetY: 8, radius: 18, opacityLight: 0.18, opacityDark: 0.5, android: 12 },
};

export function elevation(level: ElevationLevel, isDark: boolean): ViewStyle {
  const spec = SPECS[level];

  if (level === 0) {
    return {};
  }

  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: spec.offsetY },
      shadowRadius: spec.radius,
      shadowOpacity: isDark ? spec.opacityDark : spec.opacityLight,
    },
    android: {
      elevation: spec.android,
    },
    default: {
      // Web / react-native-web.
      boxShadow: `0px ${spec.offsetY}px ${spec.radius}px rgba(0,0,0,${
        isDark ? spec.opacityDark : spec.opacityLight
      })`,
    } as ViewStyle,
  });
}
