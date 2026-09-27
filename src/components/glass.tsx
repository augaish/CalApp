import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Liquid Glass for the app's floating pieces — the header pills, the Add
 * button — on iOS 26 and later, and the existing tinted surface everywhere
 * else: older iOS, Android, the web, a binary without the glass module, and
 * anyone who has turned on Reduce Transparency.
 *
 * `fallback` is the style the surface already had; glass replaces only its
 * background, never its size or shape.
 */

type GlassViewType = React.ComponentType<{
  style?: StyleProp<ViewStyle>;
  glassEffectStyle?: 'regular' | 'clear';
  tintColor?: string;
  isInteractive?: boolean;
  children?: ReactNode;
}>;

const glassModule = Platform.OS === 'ios' ? requireOptionalNativeModule('ExpoGlassEffect') : null;

function liquidGlassAvailable(): boolean {
  if (!glassModule) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('expo-glass-effect') as { isLiquidGlassAvailable: () => boolean }).isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

const GLASS = liquidGlassAvailable();
const GlassView: GlassViewType | null = GLASS
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-glass-effect') as { GlassView: GlassViewType }).GlassView
  : null;

/** Whether the person has asked iOS for fewer see-through surfaces. */
function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (!GLASS) return;
    AccessibilityInfo.isReduceTransparencyEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

export function GlassSurface({
  style,
  fallback,
  tint,
  interactive = false,
  children,
}: {
  /** Size, shape and layout — kept either way. */
  style?: StyleProp<ViewStyle>;
  /** The background the surface has without glass. */
  fallback?: StyleProp<ViewStyle>;
  tint?: string;
  interactive?: boolean;
  children?: ReactNode;
}) {
  const reduce = useReduceTransparency();
  if (GlassView && !reduce) {
    return (
      <GlassView style={[style, { overflow: 'hidden' }]} glassEffectStyle="regular" tintColor={tint} isInteractive={interactive}>
        {children}
      </GlassView>
    );
  }
  return <View style={[style, fallback]}>{children}</View>;
}

/**
 * Glass as a background layer: drop it in as the first child of a pill or a
 * round button, and the control keeps its own padding, content and press
 * feedback on top.
 */
export function GlassBacking({ radius, fallbackColor, tint }: { radius: number; fallbackColor: string; tint?: string }) {
  return (
    <GlassSurface
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius }}
      fallback={{ backgroundColor: fallbackColor }}
      tint={tint}
    />
  );
}
