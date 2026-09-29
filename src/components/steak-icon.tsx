import Svg, { Path } from 'react-native-svg';

/**
 * A T-bone steak, for protein. Neither SF Symbols nor Ionicons has one, and
 * an emoji can't take the tile's colour or follow dark mode, so it is drawn
 * here: the cut in `color`, its fat rim and the bone in a light cream that
 * reads on either scheme.
 */
export function SteakIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path
        fill={color}
        d="M3.6 10.2C3.4 6.1 7 3.1 11.6 3.3c4.9.2 8.9 3.2 8.9 7.5 0 3.3-2.4 4.9-4 6.9-1.6 2-3.6 3.6-6.6 3-3.3-.6-5.3-3.1-5.5-5.9-.1-1.7-.7-2.6-.8-4.6Z"
      />
      <Path
        fill="none"
        stroke="#FFF8F2"
        strokeWidth={1.6}
        strokeOpacity={0.9}
        d="M5.3 10.2c-.1-3.2 2.8-5.4 6.3-5.2 3.9.2 7.1 2.5 7.1 5.8 0 2.5-1.9 3.8-3.2 5.4-1.3 1.6-2.9 2.9-5.2 2.4-2.5-.5-4-2.4-4.2-4.5-.1-1.3-.7-2.3-.8-3.9Z"
      />
      <Path fill="none" stroke="#FFF8F2" strokeWidth={1.8} strokeLinecap="round" d="M9.2 8.3l4.6 4.2M11.4 7.6v6.2" />
    </Svg>
  );
}
