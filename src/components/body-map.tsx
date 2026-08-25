import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MUSCLE_COLORS } from '@/lib/exercises';
import type { MuscleGroup } from '@/lib/types';

/**
 * A stylized (not a traced medical illustration) body diagram, colored per
 * Calgym's existing MuscleGroup categories rather than individually named
 * muscles — the app only ever tags an exercise with one of these 11 broad
 * groups, so nothing here claims precision the data doesn't have. What IS
 * worth getting right is that each region actually reads as the muscle it
 * is — a pec, a lat wing, a trap kite, a segmented ab wall — not a rounded
 * blob standing in for "chest" by color alone. Thin divider lines (drawn in
 * the page background color, on top of the fill) carve a single colored
 * region into that recognizable shape; they're decorative, not separate
 * data. Each group lives on whichever view a person would actually look at
 * it from; cardio and fullBody don't map to a drawable region and simply
 * never appear here.
 */
const FRONT_GROUPS: MuscleGroup[] = ['chest', 'shoulders', 'biceps', 'forearms', 'core', 'legs'];
const BACK_GROUPS: MuscleGroup[] = ['back', 'triceps', 'glutes'];

export type BodyMapView = 'front' | 'back';

/** Every drawable group, front first — used to build a front/back toggle. */
export const BODY_MAP_GROUPS: { group: MuscleGroup; view: BodyMapView }[] = [
  ...FRONT_GROUPS.map((group) => ({ group, view: 'front' as const })),
  ...BACK_GROUPS.map((group) => ({ group, view: 'back' as const })),
];

export function viewForGroup(group: MuscleGroup): BodyMapView | null {
  if (FRONT_GROUPS.includes(group)) return 'front';
  if (BACK_GROUPS.includes(group)) return 'back';
  return null;
}

type Shape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number }
  | { kind: 'path'; d: string };

interface Region {
  group: MuscleGroup;
  shapes: Shape[];
  /** The tap target — a plain rect covering the region, since a Path has no simple centered hit area. */
  hit: { x: number; y: number; w: number; h: number };
}

const ellipse = (cx: number, cy: number, rx: number, ry: number): Shape => ({ kind: 'ellipse', cx, cy, rx, ry });
const rect = (x: number, y: number, w: number, h: number, rx = 0): Shape => ({ kind: 'rect', x, y, w, h, rx });
const path = (d: string): Shape => ({ kind: 'path', d });

// A 200×360 figure. Two pecs meeting at a sternum line, a segmented ab
// wall, tapered deltoid/arm shapes, a trap-kite-over-lat-wing back, and
// split glutes — composed from primitives plus a couple of simple 4-point
// paths, not a single blob per region.
const FRONT_REGIONS: Region[] = [
  {
    group: 'shoulders',
    shapes: [ellipse(56, 80, 18, 20), ellipse(144, 80, 18, 20)],
    hit: { x: 36, y: 60, w: 40, h: 40 },
  },
  {
    group: 'chest',
    shapes: [ellipse(80, 92, 23, 19), ellipse(120, 92, 23, 19)],
    hit: { x: 56, y: 72, w: 88, h: 40 },
  },
  {
    group: 'core',
    shapes: [rect(74, 116, 52, 58, 12), rect(64, 122, 12, 42, 6), rect(124, 122, 12, 42, 6)],
    hit: { x: 62, y: 116, w: 76, h: 58 },
  },
  {
    group: 'biceps',
    shapes: [ellipse(41, 108, 13, 27), ellipse(159, 108, 13, 27)],
    hit: { x: 27, y: 80, w: 28, h: 58 },
  },
  {
    group: 'forearms',
    shapes: [rect(30, 136, 20, 48, 10), rect(150, 136, 20, 48, 10)],
    hit: { x: 28, y: 134, w: 24, h: 52 },
  },
  {
    group: 'legs',
    shapes: [rect(68, 210, 28, 122, 14), rect(104, 210, 28, 122, 14)],
    hit: { x: 66, y: 208, w: 68, h: 126 },
  },
];

const FRONT_DIVIDERS: Shape[] = [
  // Sternum line splitting the two pecs.
  rect(98, 76, 4, 36, 2),
  // Ab-wall grid: one center line, three horizontal rows.
  rect(98, 118, 4, 54, 2),
  rect(76, 132, 48, 3, 1.5),
  rect(76, 146, 48, 3, 1.5),
  rect(76, 160, 48, 3, 1.5),
  // Quad separation.
  rect(80, 214, 3, 112, 1.5),
  rect(116, 214, 3, 112, 1.5),
];

const BACK_REGIONS: Region[] = [
  {
    group: 'back',
    // Trapezius kite over the top, a lat "wing" V-taper underneath — drawn
    // as one region (they share a color, since the data has no separate
    // trap/lat split) but as two distinct, layered shapes.
    shapes: [
      path('M65,94 L135,94 L118,178 L82,178 Z'),
      path('M100,60 L138,86 L100,128 L62,86 Z'),
    ],
    hit: { x: 60, y: 58, w: 80, h: 122 },
  },
  {
    group: 'triceps',
    shapes: [ellipse(41, 108, 13, 27), ellipse(159, 108, 13, 27)],
    hit: { x: 27, y: 80, w: 28, h: 58 },
  },
  {
    group: 'glutes',
    shapes: [ellipse(85, 196, 21, 25), ellipse(115, 196, 21, 25)],
    hit: { x: 62, y: 172, w: 76, h: 50 },
  },
];

const BACK_DIVIDERS: Shape[] = [rect(98, 176, 4, 40, 2)];

// Undrawn arm/leg segments still get a neutral capsule so the figure reads
// as a whole body on the back view instead of stopping at the shoulders.
const BACK_NEUTRAL: Shape[] = [
  rect(30, 136, 20, 48, 10),
  rect(150, 136, 20, 48, 10),
  rect(68, 210, 28, 122, 14),
  rect(104, 210, 28, 122, 14),
];

function DrawShape({ shape, fill }: { shape: Shape; fill: string }) {
  if (shape.kind === 'circle') return <Circle cx={shape.cx} cy={shape.cy} r={shape.r} fill={fill} />;
  if (shape.kind === 'ellipse') return <Ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill={fill} />;
  if (shape.kind === 'rect') {
    return <Rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx ?? 0} fill={fill} />;
  }
  return <Path d={shape.d} fill={fill} />;
}

/**
 * `highlighted` colors the groups it lists (in MUSCLE_COLORS) and leaves
 * everything else neutral. Pass `onSelect` to make regions tappable — the
 * head/neck outline and the divider lines are always decorative.
 */
export function BodyMap({
  view,
  highlighted,
  onSelect,
  size = 200,
}: {
  view: BodyMapView;
  highlighted: MuscleGroup[];
  onSelect?: (group: MuscleGroup) => void;
  size?: number;
}) {
  const theme = useTheme();
  const regions = view === 'front' ? FRONT_REGIONS : BACK_REGIONS;
  const dividers = view === 'front' ? FRONT_DIVIDERS : BACK_DIVIDERS;
  const neutralExtra = view === 'back' ? BACK_NEUTRAL : [];
  const height = size * 1.8;

  return (
    <View style={{ width: size, height, alignItems: 'center' }}>
      <Svg width={size} height={height} viewBox="0 0 200 360">
        {/* Head + neck — decorative, never a target. */}
        <Circle cx={100} cy={34} r={24} fill={theme.cardSubtle} />
        <Rect x={90} y={54} width={20} height={16} rx={6} fill={theme.cardSubtle} />
        {neutralExtra.map((s, i) => (
          <DrawShape key={`neutral-${i}`} shape={s} fill={theme.cardSubtle} />
        ))}
        {regions.map((region) =>
          region.shapes.map((s, i) => (
            <DrawShape
              key={`${region.group}-${i}`}
              shape={s}
              fill={highlighted.includes(region.group) ? MUSCLE_COLORS[region.group] : theme.cardSubtle}
            />
          )),
        )}
        {/* Definition lines on top of the fills, in the surface behind the diagram. */}
        {dividers.map((s, i) => (
          <DrawShape key={`divider-${i}`} shape={s} fill={theme.card} />
        ))}
        {/* Invisible tap targets on top of everything — a Path has no simple centered hit area of its own. */}
        {onSelect &&
          regions.map((region) => (
            <Rect
              key={`hit-${region.group}`}
              x={region.hit.x}
              y={region.hit.y}
              width={region.hit.w}
              height={region.hit.h}
              fill="transparent"
              onPress={() => onSelect(region.group)}
            />
          ))}
      </Svg>
    </View>
  );
}

/** Front/back toggle + label, for screens that need to reach all 9 groups. */
export function BodyMapViewSwitch({
  view,
  onChange,
}: {
  view: BodyMapView;
  onChange: (view: BodyMapView) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
      {(['front', 'back'] as const).map((v) => (
        <Text
          key={v}
          onPress={() => onChange(v)}
          style={{
            fontSize: 13,
            fontWeight: '700',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            overflow: 'hidden',
            color: view === v ? theme.onPrimary : theme.textSecondary,
            backgroundColor: view === v ? theme.primary : theme.cardSubtle,
          }}
        >
          {v === 'front' ? t('exercises.bodyFront') : t('exercises.bodyBack')}
        </Text>
      ))}
    </View>
  );
}
