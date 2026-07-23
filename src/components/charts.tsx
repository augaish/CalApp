import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

const CHART_H = 96;

/** 7-column bar chart with a target line context; labels under each bar. */
export function WeekBars({
  values,
  target,
  labels,
  color,
}: {
  values: number[];
  target: number;
  labels: string[];
  color: string;
}) {
  const t = useTheme();
  const max = Math.max(target, ...values, 1);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: CHART_H }}>
        {values.map((v, i) => {
          const h = Math.max(4, (v / max) * CHART_H);
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
              <View
                style={{
                  width: '70%',
                  height: h,
                  borderRadius: 5,
                  backgroundColor: v > 0 ? color : t.border,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        {labels.map((l, i) => (
          <Text
            key={i}
            style={{ flex: 1, textAlign: 'center', fontSize: 11, color: t.textTertiary }}
          >
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Simple line chart for weight entries (oldest → newest). */
export function TrendLine({ values, color, width }: { values: number[]; color: string; width: number }) {
  const t = useTheme();
  const h = 120;
  const pad = 10;
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return { x, y };
  });
  return (
    <Svg width={width} height={h}>
      <Polyline
        points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {pts.map((p, i) => (
        <Circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === pts.length - 1 ? 5 : 3}
          fill={i === pts.length - 1 ? color : t.card}
          stroke={color}
          strokeWidth={2}
        />
      ))}
      <Rect x={0} y={0} width={0} height={0} />
    </Svg>
  );
}
