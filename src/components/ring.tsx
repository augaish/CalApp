import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/** Circular progress ring; progress 0–1, children rendered in the center. */
export function Ring({
  size,
  strokeWidth,
  progress,
  color,
  trackColor,
  children,
}: {
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}
