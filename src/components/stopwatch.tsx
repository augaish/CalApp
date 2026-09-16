import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic, successHaptic } from '@/lib/feedback';

/**
 * Module-level on purpose. The React Compiler's purity rule forbids reading
 * the clock from a component body or from a handler declared inside one, so
 * every call to it has to sit out here (same reason as `daysSince` in
 * body-reading and `fastingCardLabel` in food).
 */
function nowMs(): number {
  return Date.now();
}

function secondsSince(startMs: number): number {
  return Math.max(0, Math.round((Date.now() - startMs) / 1000));
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return h > 0
    ? `${h}:${mm}:${String(sec).padStart(2, '0')}`
    : `${mm}:${String(sec).padStart(2, '0')}`;
}

/**
 * Times an effort instead of asking someone to remember how long it took.
 * Nobody knows they planked for 47 seconds; they know they planked until they
 * couldn't. Running counts up rather than down, because the honest question is
 * how long you actually lasted, not how long you meant to.
 *
 * `value` stays the source of truth — the stopwatch writes into it as it runs
 * and the stepper beside it can still be used instead, so a session logged
 * from memory afterwards works exactly as before.
 */
export function Stopwatch({
  value,
  onChange,
  compact,
}: {
  /** Current seconds, owned by the parent. */
  value: number;
  onChange: (seconds: number) => void;
  /** Smaller presentation, for the in-session card. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [running, setRunning] = useState(false);
  // Where this run started, offset by whatever was already on the clock, so
  // resuming continues rather than restarting.
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => onChange(secondsSince(startedAtRef.current)), 200);
    return () => clearInterval(id);
  }, [running, onChange]);

  const toggle = () => {
    if (running) {
      successHaptic();
      setRunning(false);
      return;
    }
    lightHaptic();
    startedAtRef.current = nowMs() - value * 1000;
    setRunning(true);
  };

  const reset = () => {
    lightHaptic();
    setRunning(false);
    onChange(0);
  };

  return (
    <View style={[styles.wrap, compact && { paddingVertical: Spacing.sm }]}>
      <Text
        style={[
          styles.clock,
          compact && { fontSize: 34 },
          { color: running ? theme.primary : theme.text },
        ]}
      >
        {formatClock(value)}
      </Text>
      <View style={styles.buttons}>
        <Pressable
          onPress={toggle}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: running ? theme.danger : theme.primary },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Ionicons name={running ? 'pause' : 'play'} size={18} color={theme.onPrimary} />
          <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>
            {t(running ? 'stopwatch.pause' : value > 0 ? 'stopwatch.resume' : 'stopwatch.start')}
          </Text>
        </Pressable>
        {value > 0 && !running && (
          <Pressable
            onPress={reset}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="refresh" size={16} color={theme.textSecondary} />
            <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>
              {t('stopwatch.reset')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  clock: { fontSize: 46, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 1 },
  buttons: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.full,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
});
