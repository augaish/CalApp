import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Rect } from 'react-native-svg';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MUSCLE_COLORS } from '@/lib/exercises';
import type { MuscleGroup } from '@/lib/types';

/**
 * A stylized (not anatomical) body silhouette, colored per Calgym's existing
 * MuscleGroup categories rather than fine-grained musculature — the app only
 * ever tags an exercise with one of these 11 broad groups, so drawing real
 * muscle-fiber detail would show precision the data doesn't have. Each group
 * lives on whichever view a person would actually look at it from; the two
 * that don't map to a drawable body region (cardio, fullBody) simply never
 * appear here.
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

interface Region {
  group: MuscleGroup;
  shape: 'circle' | 'ellipse' | 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
}

// A 200×360 stylized figure. Shapes are deliberately simple (circles,
// ellipses, rounded rects) rather than a hand-traced outline — predictable
// to render correctly and reads clearly at small sizes.
const FRONT_REGIONS: Region[] = [
  { group: 'shoulders', shape: 'circle', x: 58, y: 82, w: 17, h: 17 },
  { group: 'shoulders', shape: 'circle', x: 142, y: 82, w: 17, h: 17 },
  { group: 'chest', shape: 'rect', x: 66, y: 74, w: 68, h: 40, rx: 18 },
  { group: 'core', shape: 'rect', x: 74, y: 118, w: 52, h: 54, rx: 14 },
  { group: 'biceps', shape: 'rect', x: 32, y: 86, w: 22, h: 46, rx: 11 },
  { group: 'biceps', shape: 'rect', x: 146, y: 86, w: 22, h: 46, rx: 11 },
  { group: 'forearms', shape: 'rect', x: 30, y: 134, w: 20, h: 50, rx: 10 },
  { group: 'forearms', shape: 'rect', x: 150, y: 134, w: 20, h: 50, rx: 10 },
  { group: 'legs', shape: 'rect', x: 70, y: 210, w: 26, h: 118, rx: 13 },
  { group: 'legs', shape: 'rect', x: 104, y: 210, w: 26, h: 118, rx: 13 },
];

const BACK_REGIONS: Region[] = [
  { group: 'back', shape: 'rect', x: 62, y: 72, w: 76, h: 96, rx: 22 },
  { group: 'triceps', shape: 'rect', x: 32, y: 86, w: 22, h: 46, rx: 11 },
  { group: 'triceps', shape: 'rect', x: 146, y: 86, w: 22, h: 46, rx: 11 },
  { group: 'glutes', shape: 'ellipse', x: 100, y: 186, w: 42, h: 26 },
];

// Undrawn arm/leg segments still get a neutral capsule so the figure reads
// as a whole body on the back view instead of stopping at the shoulders.
const BACK_NEUTRAL: Omit<Region, 'group'>[] = [
  { shape: 'rect', x: 30, y: 134, w: 20, h: 50, rx: 10 },
  { shape: 'rect', x: 150, y: 134, w: 20, h: 50, rx: 10 },
  { shape: 'rect', x: 70, y: 210, w: 26, h: 118, rx: 13 },
  { shape: 'rect', x: 104, y: 210, w: 26, h: 118, rx: 13 },
];

function RegionShape({
  region,
  fill,
  onPress,
}: {
  region: Region | Omit<Region, 'group'>;
  fill: string;
  onPress?: () => void;
}) {
  const props = { fill, onPress, opacity: onPress ? 1 : 0.9 };
  if (region.shape === 'circle') {
    return <Circle cx={region.x + region.w / 2} cy={region.y + region.h / 2} r={region.w / 2} {...props} />;
  }
  if (region.shape === 'ellipse') {
    return <Ellipse cx={region.x} cy={region.y} rx={region.w / 2} ry={region.h / 2} {...props} />;
  }
  return <Rect x={region.x} y={region.y} width={region.w} height={region.h} rx={region.rx ?? 0} {...props} />;
}

/**
 * `highlighted` colors the groups it lists (in MUSCLE_COLORS) and leaves
 * everything else neutral. Pass `onSelect` to make regions tappable — the
 * head/neck outline is always decorative.
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
  const neutralExtra = view === 'back' ? BACK_NEUTRAL : [];
  const height = size * 1.8;

  return (
    <View style={{ width: size, height, alignItems: 'center' }}>
      <Svg width={size} height={height} viewBox="0 0 200 360">
        {/* Head + neck — decorative, never a target. */}
        <Circle cx={100} cy={34} r={24} fill={theme.cardSubtle} />
        <Rect x={90} y={54} width={20} height={16} rx={6} fill={theme.cardSubtle} />
        {neutralExtra.map((r, i) => (
          <RegionShape key={`neutral-${i}`} region={r} fill={theme.cardSubtle} />
        ))}
        {regions.map((r, i) => (
          <RegionShape
            key={`${r.group}-${i}`}
            region={r}
            fill={highlighted.includes(r.group) ? MUSCLE_COLORS[r.group] : theme.cardSubtle}
            onPress={onSelect ? () => onSelect(r.group) : undefined}
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
