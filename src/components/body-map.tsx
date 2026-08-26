import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { BACK_PARTS, FRONT_PARTS, type MusclePath } from '@/components/body-map-parts';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MUSCLE_COLORS, MUSCLE_ID_COLORS } from '@/lib/exercises';
import type { MuscleGroup, MuscleId, SegmentalLeanMass, SegmentalStatus, ZoneStatus } from '@/lib/types';

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

export type BodyZone = 'arms' | 'trunk' | 'legs';

/** Which MuscleGroups fall under each of the three broad zones a body
 * reading's segmental lean mass can drive — arms/legs each average their
 * left+right figure, since individual muscle regions aren't reliably
 * addressable as anatomical left/right within the flat path data. */
const ZONE_GROUPS: Record<BodyZone, MuscleGroup[]> = {
  arms: ['biceps', 'triceps', 'forearms'],
  trunk: ['chest', 'back', 'core'],
  legs: ['legs', 'calves', 'glutes'],
};

/** Per-side keys a segmental reading is stored under — same shape as
 * SegmentalLeanMass, reused here as the label overlay's key type. */
export type BodySide = 'leftArm' | 'rightArm' | 'trunk' | 'leftLeg' | 'rightLeg';

/**
 * Roughly where each side's value actually sits on the figure — a leader
 * line's anatomical end, in the SVG's own 724x1448-per-view coordinate
 * space (back view's paths already live in x=724..1448, per
 * body-map-parts.ts). Read off the real path data's bounding areas, not
 * eyeballed — a front-facing figure is mirrored like any anatomical
 * diagram, so a screen-left position is the person's RIGHT side.
 */
const ZONE_TARGETS: Record<BodyMapView, Record<BodySide, { x: number; y: number }>> = {
  front: {
    rightArm: { x: 205, y: 420 },
    leftArm: { x: 520, y: 420 },
    trunk: { x: 362, y: 480 },
    rightLeg: { x: 290, y: 820 },
    leftLeg: { x: 420, y: 820 },
  },
  back: {
    rightArm: { x: 935, y: 460 },
    leftArm: { x: 1240, y: 460 },
    trunk: { x: 1086, y: 480 },
    rightLeg: { x: 1000, y: 750 },
    leftLeg: { x: 1160, y: 750 },
  },
};

/** Where each label itself sits, OUTSIDE the silhouette in the margin added
 * on either side — a tidy top/middle/bottom row per side rather than
 * hugging each target's exact height, so labels never crowd each other
 * regardless of how close two targets are. Same rows for front and back. */
const ZONE_LABEL_SLOTS: Record<BodySide, { side: 'left' | 'right'; y: number }> = {
  rightArm: { side: 'left', y: 380 },
  trunk: { side: 'left', y: 600 },
  rightLeg: { side: 'left', y: 900 },
  leftArm: { side: 'right', y: 380 },
  leftLeg: { side: 'right', y: 900 },
};

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
 * How a body reading's segmental lean mass splits across arms/trunk/legs,
 * scaled so the biggest zone reads fully saturated and the others sit
 * proportionally lighter — a purely descriptive "where your measured lean
 * mass concentrates" glance, not a judgment about any zone. Null when the
 * reading has no segmental breakdown at all (most manual entries and many
 * single-purpose scales).
 */
export function zoneIntensityFromSegmental(
  seg: SegmentalLeanMass | undefined,
): Partial<Record<BodyZone, number>> | null {
  if (!seg) return null;
  const zones: Record<BodyZone, number> = {
    arms: (seg.leftArm ?? 0) + (seg.rightArm ?? 0),
    trunk: seg.trunk ?? 0,
    legs: (seg.leftLeg ?? 0) + (seg.rightLeg ?? 0),
  };
  const max = Math.max(zones.arms, zones.trunk, zones.legs);
  if (max <= 0) return null;
  return { arms: zones.arms / max, trunk: zones.trunk / max, legs: zones.legs / max };
}

/** Worst-of-both-sides: a zone with either side flagged "high" reads as
 * high overall, then "low", then "normal" — so a single asymmetric flag
 * still surfaces rather than getting averaged away. */
function worseStatus(a: ZoneStatus | undefined, b: ZoneStatus | undefined): ZoneStatus | undefined {
  if (a === 'high' || b === 'high') return 'high';
  if (a === 'low' || b === 'low') return 'low';
  return a ?? b;
}

/**
 * Collapses the report's per-side (left/right) status into one status per
 * drawn zone (arms/trunk/legs) — the figure colors a whole zone at once,
 * same as zoneIntensityFromSegmental, so a side split isn't drawable without
 * per-path left/right detection this doesn't have. The exact per-side value
 * still shows in the numeric labels next to the figure; only the fill color
 * is zone-level.
 */
export function zoneStatusFromSegmental(status: SegmentalStatus | undefined): Partial<Record<BodyZone, ZoneStatus>> | null {
  if (!status) return null;
  const arms = worseStatus(status.leftArm, status.rightArm);
  const legs = worseStatus(status.leftLeg, status.rightLeg);
  const trunk = status.trunk;
  if (!arms && !trunk && !legs) return null;
  return { arms, trunk, legs };
}

/**
 * Three ways to drive coloring, mutually exclusive (checked in this order):
 * - Muscle mode (`highlightedMuscles`/`secondaryMuscles`, MuscleId[]) — for
 *   one exercise's actual primary/secondary muscles.
 * - Zone mode (`zoneIntensity`, BodyZone -> 0..1) — for a body reading's
 *   relative arms/trunk/legs lean-mass split. Opacity is continuous instead
 *   of the binary primary/secondary split the other two modes use.
 * - Group mode (`highlighted`/`secondary`, MuscleGroup[]) — for browsing by
 *   broad category, e.g. the exercise library's picker. Supports `onSelect`
 *   since real anatomical regions tile against their neighbors with no gap,
 *   so no separate invisible hit-target is needed. This is the default.
 */
export function BodyMap({
  view,
  highlighted,
  secondary,
  highlightedMuscles,
  secondaryMuscles,
  zoneIntensity,
  zoneStatus,
  zoneColor,
  zoneLabels,
  onSelect,
  size = 200,
}: {
  view: BodyMapView;
  highlighted?: MuscleGroup[];
  secondary?: MuscleGroup[];
  highlightedMuscles?: MuscleId[];
  secondaryMuscles?: MuscleId[];
  zoneIntensity?: Partial<Record<BodyZone, number>>;
  /** When present, takes over coloring from zoneIntensity — a definitive
   * low/normal/high read off the report itself, shown at full opacity in a
   * fixed green/amber/red rather than a single accent color's intensity. */
  zoneStatus?: Partial<Record<BodyZone, ZoneStatus>>;
  zoneColor?: string;
  /** Pre-formatted per-side values (e.g. "3.1kg") shown next to their real
   * position on the figure — the actual numbers behind the zone coloring,
   * not just a relative intensity. */
  zoneLabels?: Partial<Record<BodySide, string>>;
  onSelect?: (group: MuscleGroup) => void;
  size?: number;
}) {
  const theme = useTheme();
  const parts: MusclePath[] = view === 'front' ? FRONT_PARTS : BACK_PARTS;
  const height = size * 2;
  const muscleMode = !!highlightedMuscles;
  const zoneMode = !muscleMode && !!(zoneIntensity || zoneStatus);
  // Plain relative-concentration shading (no printed status to color by)
  // defaults to the brand color, not warning/amber — amber is reserved for
  // an actual "low" status read off the report, and using it here too made
  // every unstatused reading look like it was flagging a problem.
  const accent = zoneColor ?? theme.primary;
  const statusColor: Record<ZoneStatus, string> = { normal: theme.success, low: theme.warning, high: theme.danger };
  const hasLabels = !!zoneLabels && Object.values(zoneLabels).some((v) => v != null);

  // Labels live outside the silhouette, in a margin added on both sides —
  // widening the viewBox by the same margin (converted to its own units)
  // keeps the body paths' real coordinates untouched while opening up room
  // for a leader line to actually clear the figure instead of overlapping it.
  const scale = size / 724;
  const MARGIN = 54;
  const marginVB = MARGIN / scale;
  const originX = view === 'front' ? 0 : 724;
  const outerWidth = hasLabels ? size + MARGIN * 2 : size;
  const viewBox = hasLabels
    ? `${originX - marginVB} 0 ${724 + marginVB * 2} 1448`
    : view === 'front'
      ? '0 0 724 1448'
      : '724 0 724 1448';
  const toPx = (vbX: number) => (vbX - originX) * scale + (hasLabels ? MARGIN : 0);

  return (
    <View style={{ width: outerWidth, height, alignItems: 'center' }}>
      <Svg width={outerWidth} height={height} viewBox={viewBox}>
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
          } else if (zoneMode) {
            const zone = (Object.keys(ZONE_GROUPS) as BodyZone[]).find(
              (z) => part.group && ZONE_GROUPS[z].includes(part.group),
            );
            const status = zone ? zoneStatus?.[zone] : undefined;
            const intensity = zone ? zoneIntensity?.[zone] : undefined;
            if (status) {
              color = statusColor[status];
              opacity = 1;
            } else if (intensity != null) {
              color = accent;
              // Floor at 0.15 so a low-intensity zone still reads as "measured"
              // rather than disappearing into the neutral, unmeasured regions.
              opacity = Math.max(0.15, Math.min(1, intensity));
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
        {hasLabels &&
          (Object.keys(zoneLabels!) as BodySide[]).map((side) => {
            if (!zoneLabels![side]) return null;
            const target = ZONE_TARGETS[view][side];
            const slot = ZONE_LABEL_SLOTS[side];
            const lineEndX = slot.side === 'left' ? originX - marginVB * 0.5 : originX + 724 + marginVB * 0.5;
            return (
              <Line
                key={side}
                x1={target.x}
                y1={target.y}
                x2={lineEndX}
                y2={slot.y}
                stroke={theme.textTertiary}
                strokeWidth={1.5}
              />
            );
          })}
      </Svg>
      {hasLabels && (
        <View style={{ position: 'absolute', width: outerWidth, height }} pointerEvents="none">
          {(Object.keys(zoneLabels!) as BodySide[]).map((side) => {
            const label = zoneLabels![side];
            if (!label) return null;
            const slot = ZONE_LABEL_SLOTS[side];
            const lineEndX = slot.side === 'left' ? originX - marginVB * 0.5 : originX + 724 + marginVB * 0.5;
            const px = toPx(lineEndX);
            const py = (slot.y / 1448) * height;
            return (
              <View
                key={side}
                style={{
                  position: 'absolute',
                  left: slot.side === 'left' ? px - MARGIN : px,
                  top: py - 8,
                  width: MARGIN,
                  alignItems: slot.side === 'left' ? 'flex-end' : 'flex-start',
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '800', color: theme.text }}>{label}</Text>
              </View>
            );
          })}
        </View>
      )}
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

export type BodyMapMetric = 'muscle' | 'fat';

/** Muscle/fat toggle — same pill styling as the front/back switch, for a
 * reading that has both a segmental lean-mass AND a segmental fat-mass
 * breakdown, so the same figure can show either. */
export function BodyMapMetricSwitch({
  metric,
  onChange,
}: {
  metric: BodyMapMetric;
  onChange: (metric: BodyMapMetric) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
      {(['muscle', 'fat'] as const).map((m) => (
        <Text
          key={m}
          onPress={() => onChange(m)}
          style={{
            fontSize: 13,
            fontWeight: '700',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            overflow: 'hidden',
            color: metric === m ? theme.onPrimary : theme.textSecondary,
            backgroundColor: metric === m ? theme.primary : theme.cardSubtle,
          }}
        >
          {m === 'muscle' ? t('progress.musclePercent') : t('bodyReading.bodyFat')}
        </Text>
      ))}
    </View>
  );
}

/** Explains the plain relative-concentration shading shown when a reading
 * has no printed low/normal/high status to color by — pairs with
 * BodyMapStatusLegend, shown instead of it rather than alongside it. */
export function BodyMapIntensityHint() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Text style={{ fontSize: 11, color: theme.textTertiary, textAlign: 'center' }}>
      {t('bodyReading.intensityHint')}
    </Text>
  );
}

/** Dot + label for each of the three zoneStatus colors — only meaningful
 * (and only rendered by callers) when a reading actually carries the
 * report's own printed status, since otherwise the figure isn't using
 * these colors at all. */
export function BodyMapStatusLegend() {
  const { t } = useTranslation();
  const theme = useTheme();
  const items: { status: ZoneStatus; label: string }[] = [
    { status: 'normal', label: t('bodyReading.statusNormal') },
    { status: 'low', label: t('bodyReading.statusLow') },
    { status: 'high', label: t('bodyReading.statusHigh') },
  ];
  const colors: Record<ZoneStatus, string> = { normal: theme.success, low: theme.warning, high: theme.danger };
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: Spacing.md, flexWrap: 'wrap' }}>
      {items.map((item) => (
        <View key={item.status} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[item.status] }} />
          <Text style={{ fontSize: 11, color: theme.textSecondary }}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
