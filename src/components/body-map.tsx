import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { BACK_PARTS, FRONT_PARTS, type MusclePath } from '@/components/body-map-parts';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MUSCLE_COLORS } from '@/lib/exercises';
import type { MuscleGroup } from '@/lib/types';

/**
 * A real anatomical body diagram (see body-map-parts.ts for the path data's
 * origin/license), colored per Calgym's existing MuscleGroup categories
 * rather than individually named muscles — the app only ever tags an
 * exercise with one of these broad groups, so nothing here claims precision
 * the data doesn't have. Every part of the figure is drawn (in neutral color
 * when not one of our tappable groups) so it always reads as one continuous
 * body, not a set of floating shapes. Each group lives on whichever view a
 * person would actually look at it from; cardio and fullBody don't map to a
 * drawable region and simply never appear here.
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

/**
 * `highlighted` colors the groups it lists (in MUSCLE_COLORS) and leaves
 * everything else neutral. Pass `onSelect` to make a group's own paths
 * tappable directly — real anatomical regions tile against their neighbors
 * with no gap, so no separate invisible hit-target is needed.
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
  const parts: MusclePath[] = view === 'front' ? FRONT_PARTS : BACK_PARTS;
  const viewBox = view === 'front' ? '0 0 724 1448' : '724 0 724 1448';
  const height = size * 2;

  return (
    <View style={{ width: size, height, alignItems: 'center' }}>
      <Svg width={size} height={height} viewBox={viewBox}>
        {parts.map((part, i) => {
          const color = part.group && highlighted.includes(part.group) ? MUSCLE_COLORS[part.group] : theme.cardSubtle;
          return (
            <Path
              key={i}
              d={part.d}
              fill={color}
              stroke={theme.card}
              strokeWidth={1}
              onPress={part.group && onSelect ? () => onSelect(part.group as MuscleGroup) : undefined}
            />
          );
        })}
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
