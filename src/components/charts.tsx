import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

const CHART_H = 96;
const BAR_ZONE = CHART_H - 18;

/**
 * 7-column bar chart with the value printed above each bar, a dashed line
 * marking the goal, and each bar's opacity rising toward full color as it
 * nears (or passes) that goal — a day that barely moved the needle reads as
 * faint, a day that hit the target reads as solid. Tapping a bar is
 * optional (`onSelect`); the tapped column gets a light highlight behind it.
 */
export function WeekBars({
  values,
  target,
  labels,
  color,
  onSelect,
  selectedIndex,
}: {
  values: number[];
  target: number;
  labels: string[];
  color: string;
  onSelect?: (index: number) => void;
  selectedIndex?: number;
}) {
  const t = useTheme();
  const max = Math.max(target, ...values, 1);
  const goalTop = target > 0 ? BAR_ZONE - (Math.min(target, max) / max) * BAR_ZONE : null;
  return (
    <View>
      <View style={{ height: CHART_H }}>
        {goalTop !== null && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: goalTop,
              borderTopWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: t.textTertiary,
            }}
          />
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: CHART_H }}>
          {values.map((v, i) => {
            const h = Math.max(4, (v / max) * BAR_ZONE);
            const ratio = target > 0 ? Math.min(1, v / target) : v > 0 ? 1 : 0;
            const opacity = v > 0 ? 0.4 + ratio * 0.6 : 1;
            return (
              <Pressable
                key={i}
                disabled={!onSelect}
                onPress={() => onSelect?.(i)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  height: CHART_H,
                  borderRadius: 8,
                  backgroundColor: i === selectedIndex ? t.cardSubtle : 'transparent',
                }}
              >
                {v > 0 && (
                  <Text style={{ fontSize: 10, fontWeight: '700', color: t.textSecondary, marginBottom: 3 }}>
                    {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                  </Text>
                )}
                <View
                  style={{
                    width: '70%',
                    height: h,
                    borderRadius: 5,
                    backgroundColor: v > 0 ? color : t.border,
                    opacity: v > 0 ? opacity : 1,
                  }}
                />
              </Pressable>
            );
          })}
        </View>
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

/** Line chart with value labels on each point and day labels on the x-axis. */
export function TrendLine({
  values,
  labels,
  color,
  width,
  unit,
}: {
  values: number[];
  labels: string[];
  color: string;
  width: number;
  unit?: string;
}) {
  const t = useTheme();
  const h = 120;
  const padX = 16;
  const padTop = 20;
  const padBottom = 8;
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - padX * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = padX + i * step;
    const y = padTop + (1 - (v - min) / span) * (h - padTop - padBottom);
    return { x, y, v };
  });
  return (
    <View>
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
            r={i === pts.length - 1 ? 5 : 3.5}
            fill={i === pts.length - 1 ? color : t.card}
            stroke={color}
            strokeWidth={2}
          />
        ))}
      </Svg>
      {/* Value labels positioned above each point */}
      <View style={{ position: 'absolute', width, height: h }} pointerEvents="none">
        {pts.map((p, i) => (
          <Text
            key={i}
            style={{
              position: 'absolute',
              left: p.x - 18,
              top: p.y - 18,
              width: 36,
              textAlign: 'center',
              fontSize: 10,
              fontWeight: '700',
              color: t.textSecondary,
            }}
          >
            {p.v}
          </Text>
        ))}
      </View>
      {/* Day axis — children are all position:absolute for x-alignment against
          the points above, which means this row has no intrinsic height of
          its own; without an explicit one it collapses to 0 and whatever
          renders next (another chart, on a screen with several) overlaps
          these labels instead of appearing below them. */}
      <View style={{ flexDirection: 'row', width, height: 14, marginTop: 2 }}>
        {labels.map((l, i) => (
          <Text
            key={i}
            style={{
              position: 'absolute',
              left: padX + i * step - 18,
              width: 36,
              textAlign: 'center',
              fontSize: 10,
              color: t.textTertiary,
            }}
          >
            {l}
          </Text>
        ))}
        <Text style={{ opacity: 0, fontSize: 10 }}>{unit}</Text>
      </View>
    </View>
  );
}
