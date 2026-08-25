import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { BACK_PARTS, FRONT_PARTS, type MusclePath } from '@/components/body-map-parts';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MUSCLE_COLORS, MUSCLE_ID_COLORS } from '@/lib/exercises';
import type { MuscleGroup, MuscleId } from '@/lib/types';

/**
 * A real anatomical body diagram (see body-map-parts.ts for the path data's
 * origin/license and its two independent tags per region: a coarse `group`
 * and a precise `muscle`). Every part of the figure is drawn (in neutral
 * color when not one of the groups/muscles in play) so it always reads as
 * one continuous body, not a set of floating shapes. Each group lives on
 * whichever view a person would actually look at it from; cardio and
 * fullBody don't map to a drawable region and simply never appear here.
 */
const FRONT_GROUPS: MuscleGroup[] = ['chest', 'shoulders', 'biceps', 'forearms', 'core', 'legs'];
// Calves live on the back view — the gastrocnemius bulge reads clearly there,
// while the front view mostly shows the shin (tibialis), which we don't tag.
const BACK_GROUPS: MuscleGroup[] = ['back', 'triceps', 'glutes', 'calves'];

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
 * Which view actually shows these muscles — unlike a MuscleGroup, a specific
 * exercise's muscle list can span both (e.g. a squat's quads read on the
 * front, its glutes on the back). Picks whichever view has more of them
 * drawable, so the default view leads with the bigger picture; the caller
 * still gets a front/back toggle to see the rest.
 */
export function viewForMuscles(muscles: MuscleId[]): BodyMapView | null {
  const count = (parts: MusclePath[]) => parts.filter((p) => p.muscle.some((m) => muscles.includes(m))).length;
  const front = count(FRONT_PARTS);
  const back = count(BACK_PARTS);
  if (front === 0 && back === 0) return null;
  return front >= back ? 'front' : 'back';
}

/**
 * Two ways to drive coloring, mutually exclusive:
 * - Group mode (`highlighted`/`secondary`, MuscleGroup[]) — for browsing by
 *   broad category, e.g. the exercise library's picker. Supports `onSelect`
 *   since real anatomical regions tile against their neighbors with no gap,
 *   so no separate invisible hit-target is needed.
 * - Muscle mode (`highlightedMuscles`/`secondaryMuscles`, MuscleId[]) — for
 *   one exercise's actual primary/secondary muscles. Takes over whenever
 *   `highlightedMuscles` is passed.
 * Either way: the primary set is full color, the secondary set is the same
 * color faded, everything else stays neutral.
 */
export function BodyMap({
  view,
  highlighted,
  secondary,
  highlightedMuscles,
  secondaryMuscles,
  onSelect,
  size = 200,
}: {
  view: BodyMapView;
  highlighted?: MuscleGroup[];
  secondary?: MuscleGroup[];
  highlightedMuscles?: MuscleId[];
  secondaryMuscles?: MuscleId[];
  onSelect?: (group: MuscleGroup) => void;
  size?: number;
}) {
  const theme = useTheme();
  const parts: MusclePath[] = view === 'front' ? FRONT_PARTS : BACK_PARTS;
  const viewBox = view === 'front' ? '0 0 724 1448' : '724 0 724 1448';
  const height = size * 2;
  const muscleMode = !!highlightedMuscles;

  return (
    <View style={{ width: size, height, alignItems: 'center' }}>
      <Svg width={size} height={height} viewBox={viewBox}>
        {parts.map((part, i) => {
          let color = theme.cardSubtle;
          let opacity = 1;
          if (muscleMode) {
            const primaryMatch = part.muscle.find((m) => highlightedMuscles!.includes(m));
            const secondaryMatch = !primaryMatch && part.muscle.find((m) => secondaryMuscles?.includes(m));
            if (primaryMatch) color = MUSCLE_ID_COLORS[primaryMatch];
            else if (secondaryMatch) {
              color = MUSCLE_ID_COLORS[secondaryMatch];
              opacity = 0.4;
            }
          } else {
            const isPrimary = !!part.group && !!highlighted?.includes(part.group);
            const isSecondary = !!part.group && !isPrimary && !!secondary?.includes(part.group);
            if (isPrimary || isSecondary) color = MUSCLE_COLORS[part.group as MuscleGroup];
            opacity = isSecondary ? 0.4 : 1;
          }
          return (
            <Path
              key={i}
              d={part.d}
              fillOpacity={opacity}
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
