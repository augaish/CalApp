import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Radius } from '@/constants/theme';

/**
 * A filling progress bar with a live percentage, for waits whose real
 * duration we cannot measure — an AI call reports nothing until it answers.
 *
 * So the number is honest about what it means rather than invented: it eases
 * toward 92% and slows as it approaches, never claiming to be finished on
 * its own, and only reaches 100% when `done` flips — i.e. when the answer
 * has actually arrived. A bar that crawls the last stretch and then completes
 * reads as "still working, nearly there"; one that hits 100% and sits there
 * reads as broken, which is exactly the impression to avoid.
 *
 * Mount it only while the work is running (the parent unmounting it is what
 * resets it), so it always starts from zero without an effect writing state.
 */
export function ProgressBar({
  done,
  label,
  trackColor,
  fillColor,
  textColor,
}: {
  done: boolean;
  label?: string;
  trackColor: string;
  fillColor: string;
  textColor: string;
}) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    // Eases toward 0.92: big early steps, ever-smaller ones after, so the
    // bar keeps visibly moving through a long wait without ever arriving.
    const id = setInterval(() => setPct((p) => p + (0.92 - p) * 0.09), 130);
    return () => clearInterval(id);
  }, []);

  // Derived, not stored — `done` reaching the component is what shows 100%.
  const shown = done ? 1 : pct;
  const percent = Math.round(shown * 100);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {!!label && (
          <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
            {label}
          </Text>
        )}
        <Text style={[styles.percent, { color: textColor }]}>{percent}%</Text>
      </View>
      <View style={[styles.track, { backgroundColor: trackColor }]}>
        <View style={[styles.fill, { backgroundColor: fillColor, width: `${percent}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1, fontSize: 13, fontWeight: '600' },
  percent: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: Radius.full, overflow: 'hidden' },
  fill: { height: 6, borderRadius: Radius.full },
});
