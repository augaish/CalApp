import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ThinkingStep {
  title: string;
  sub?: string;
}

/**
 * "Calgym is thinking…" while a program is built: a slowly breathing orb and
 * the steps it is working through, ticked off on a timer. The timer never
 * runs ahead of the truth — the last step ("Checking it against your
 * answers") stays open until the program has actually arrived. With Reduce
 * Motion on, the orb holds still; the steps still tick.
 */
export function ProgramThinking({ steps, done, onFinished }: { steps: ThinkingStep[]; done: boolean; onFinished: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  // How many steps are ticked. All but the last advance on their own.
  const [ticked, setTicked] = useState(0);
  const [breathe] = useState(() => new Animated.Value(0));
  const finished = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, reduceMotion]);

  // Steps tick every few seconds, slower as they go — a real build takes
  // 20–60 s — and wait at the last one.
  useEffect(() => {
    if (ticked >= steps.length - 1) return;
    const id = setTimeout(() => setTicked((n) => n + 1), 3500 + ticked * 1500);
    return () => clearTimeout(id);
  }, [ticked, steps.length]);

  // The program is here: finish the remaining steps quickly, then hand over.
  useEffect(() => {
    if (!done || finished.current) return;
    if (ticked < steps.length) {
      const id = setTimeout(() => setTicked((n) => n + 1), 350);
      return () => clearTimeout(id);
    }
    finished.current = true;
    const id = setTimeout(onFinished, 500);
    return () => clearTimeout(id);
  }, [done, ticked, steps.length, onFinished]);

  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.08] });
  const halo = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.5] });
  const current = Math.min(ticked, steps.length - 1);

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <View style={styles.orbBox}>
        <Animated.View style={[styles.halo, { backgroundColor: theme.primary, opacity: reduceMotion ? 0.3 : halo, transform: [{ scale: reduceMotion ? 1 : scale }] }]} />
        {/* Only the halo moves: scaling the orb itself left a square ghost on web. */}
        <View style={[styles.orb, { backgroundColor: theme.primary }]}>
          <Icon name="sparkles" size={34} color={theme.onPrimary} />
        </View>
      </View>
      <Text style={[Type.section, { color: theme.text, textAlign: 'center' }]} accessibilityRole="header">
        {t('program.thinking')}
      </Text>
      <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: Spacing.lg }}>
        {t('program.thinkingSub')}
      </Text>
      <View style={{ alignSelf: 'stretch', gap: Spacing.sm }}>
        {steps.map((s, i) => {
          const isDone = i < ticked;
          const isNow = i === current && !isDone;
          return (
            <View key={i} style={[styles.step, { opacity: isDone || isNow ? 1 : 0.45 }]} accessibilityState={{ busy: isNow }}>
              <View style={[styles.dot, { backgroundColor: isDone ? theme.success : isNow ? theme.surfaceTint : theme.cardSubtle }]}>
                {isDone ? (
                  <Icon name="checkmark" size={14} color="#fff" />
                ) : isNow ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: isNow ? '800' : '600', fontSize: 15 }}>{s.title}</Text>
                {!!s.sub && <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 1 }}>{s.sub}</Text>}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: Spacing.lg },
  orbBox: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  halo: { position: 'absolute', width: 150, height: 150, borderRadius: 75 },
  orb: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
