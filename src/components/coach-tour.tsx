import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';

import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TourRect = { x: number; y: number; width: number; height: number };
export type TourStep = { rect: TourRect | null; title: string; body: string };

/**
 * Skippable spotlight overlay. Dims the screen, cuts a rounded hole around the
 * current step's measured rect (SVG mask) and shows a tooltip. All positions
 * are absolute window coordinates, so it's unaffected by RTL layout mirroring.
 */
export function CoachTour({
  steps,
  index,
  onNext,
  onSkip,
}: {
  steps: TourStep[];
  index: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const t = useTranslation().t;
  const theme = useTheme();
  const { width: W, height: H } = useWindowDimensions();
  const step = steps[index];
  if (!step) return null;

  const isLast = index === steps.length - 1;
  const pad = 8;
  const hole = step.rect
    ? {
        x: step.rect.x - pad,
        y: step.rect.y - pad,
        width: step.rect.width + pad * 2,
        height: step.rect.height + pad * 2,
      }
    : null;

  // Place the tooltip below the highlight when there's room, else above; centered when no rect.
  const TOOLTIP_EST = 168;
  let tooltipTop: number;
  if (!hole) {
    tooltipTop = H / 2 - TOOLTIP_EST / 2;
  } else if (hole.y + hole.height + TOOLTIP_EST + 24 < H) {
    tooltipTop = hole.y + hole.height + 16;
  } else {
    tooltipTop = Math.max(Spacing.xl, hole.y - TOOLTIP_EST - 16);
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onSkip} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        {/* Tap anywhere on the dim area to advance */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onNext} />

        <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Mask id="hole">
              <Rect x={0} y={0} width={W} height={H} fill="white" />
              {hole && (
                <Rect x={hole.x} y={hole.y} width={hole.width} height={hole.height} rx={18} fill="black" />
              )}
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={W} height={H} fill="rgba(0,0,0,0.78)" mask="url(#hole)" />
          {hole && (
            <Rect
              x={hole.x}
              y={hole.y}
              width={hole.width}
              height={hole.height}
              rx={18}
              fill="none"
              stroke={theme.primary}
              strokeWidth={2.5}
            />
          )}
        </Svg>

        <View
          style={[
            styles.tooltip,
            { top: tooltipTop, backgroundColor: theme.card },
            cardShadow(theme.shadow),
          ]}
        >
          <Text style={[Type.caption, { color: theme.textTertiary, marginBottom: 4 }]}>
            {index + 1} / {steps.length}
          </Text>
          <Text style={[styles.title, { color: theme.text }]}>{step.title}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{step.body}</Text>
          <View style={styles.row}>
            <Pressable onPress={onSkip} hitSlop={8} style={styles.skip}>
              <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>{t('tutorial.skip')}</Text>
            </Pressable>
            <Pressable
              onPress={onNext}
              style={({ pressed }) => [
                styles.next,
                { backgroundColor: theme.primary },
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>
                {isLast ? t('common.done') : t('tutorial.next')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  body: { fontSize: 15, lineHeight: 21, marginBottom: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skip: { paddingVertical: 8, paddingHorizontal: 4 },
  next: {
    borderRadius: Radius.full,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
    minWidth: 96,
    alignItems: 'center',
  },
});
