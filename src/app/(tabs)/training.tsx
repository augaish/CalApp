import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen } from '@/components/ui';
import { Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useViewDay } from '@/lib/day';
import { burnedForDay, isSameDay, useAppStore } from '@/lib/store';
import type { LoggedWorkout } from '@/lib/types';

/** Machines most frequently trained on the same weekday as `day`. */
function routineFor(workouts: LoggedWorkout[], day: Date): string[] {
  const weekday = day.getDay();
  const counts = new Map<string, number>();
  for (const w of workouts) {
    if (new Date(w.at).getDay() !== weekday) continue;
    counts.set(w.equipmentName, (counts.get(w.equipmentName) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);
}

/** Group workouts into date buckets, newest first. */
function groupByDay(workouts: LoggedWorkout[]): { key: string; date: Date; items: LoggedWorkout[] }[] {
  const groups: { key: string; date: Date; items: LoggedWorkout[] }[] = [];
  for (const w of workouts) {
    const d = new Date(w.at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, date: d, items: [] };
      groups.push(g);
    }
    g.items.push(w);
  }
  return groups;
}

export default function Training() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';

  const workouts = useAppStore((s) => s.workouts);
  const selected = useViewDay((s) => s.day);
  const shift = useViewDay((s) => s.shift);

  const selectedIsToday = isSameDay(new Date().toISOString(), selected);
  const burned = burnedForDay(workouts, selected);
  const routine = routineFor(workouts, selected);
  const groups = groupByDay(workouts);
  const weekday = selected.toLocaleDateString(locale, { weekday: 'long' });

  return (
    <Screen
      footer={
        <View style={styles.footerRow}>
          <Button
            label={t('training.scanCta')}
            icon="barbell"
            onPress={() => router.push('/scan?mode=gym')}
            style={{ flex: 1 }}
          />
          <Button
            label={t('training.addManual')}
            icon="create-outline"
            variant="secondary"
            onPress={() => router.push('/workout-edit')}
            style={{ flex: 1 }}
          />
        </View>
      }
    >
      <View style={styles.headerRow}>
        <Ionicons name="barbell" size={22} color={theme.text} />
        <Text style={[Type.title, { color: theme.text, flex: 1 }]}>{t('tabs.training')}</Text>
        <Pressable onPress={() => shift(-1)} hitSlop={10} style={styles.arrow}>
          <Ionicons name="chevron-back" size={22} color={theme.textSecondary} />
        </Pressable>
        <Pressable onPress={() => router.push('/calendar')} hitSlop={6}>
          <Text style={[styles.dayLabel, { color: theme.text }]}>
            {selectedIsToday
              ? t('home.today')
              : selected.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
          </Text>
        </Pressable>
        <Pressable onPress={() => shift(1)} hitSlop={10} disabled={selectedIsToday} style={styles.arrow}>
          <Ionicons
            name="chevron-forward"
            size={22}
            color={selectedIsToday ? theme.border : theme.textSecondary}
          />
        </Pressable>
      </View>

      <Card style={styles.burnCard}>
        <View style={[styles.burnIcon, { backgroundColor: 'rgba(245,166,35,0.15)' }]}>
          <Ionicons name="flame" size={26} color={theme.carbs} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.burnValue, { color: theme.text }]}>
            {burned} <Text style={styles.burnUnit}>{t('common.kcal')}</Text>
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            {t('training.burned')} · {t('training.estimated')}
          </Text>
        </View>
      </Card>

      {/* Routine insight */}
      <Card>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{t('training.routine')}</Text>
        {routine.length > 0 ? (
          <>
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: Spacing.sm }}>
              {t('training.routineHint', { weekday })}
            </Text>
            <View style={styles.chipWrap}>
              {routine.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => router.push(`/workout-edit?name=${encodeURIComponent(m)}`)}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: theme.cardSubtle },
                    pressed && { transform: [{ scale: 0.95 }] },
                  ]}
                >
                  <Ionicons name="add" size={14} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>{m}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <Text style={{ color: theme.textSecondary }}>{t('training.noRoutine')}</Text>
        )}
      </Card>

      {/* History grouped by day */}
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('training.history')}</Text>
      {groups.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="barbell-outline" size={36} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center', lineHeight: 22 }}>
            {t('progress.noWorkouts')}
          </Text>
        </View>
      ) : (
        groups.map((g) => {
          const dayBurn = g.items.reduce((s, w) => s + (w.caloriesBurned ?? 0), 0);
          return (
            <Card key={g.key}>
              <View style={styles.groupHead}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15, flex: 1 }}>
                  {isSameDay(g.date.toISOString(), new Date())
                    ? t('home.today')
                    : g.date.toLocaleDateString(locale, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'short',
                      })}
                </Text>
                <Text style={{ color: theme.carbs, fontWeight: '700', fontSize: 13 }}>
                  {dayBurn} {t('common.kcal')}
                </Text>
              </View>
              {g.items.map((w) => (
                <Pressable
                  key={w.id}
                  onPress={() => router.push(`/workout-edit?id=${w.id}`)}
                  style={({ pressed }) => [styles.workoutRow, pressed && { opacity: 0.6 }]}
                >
                  <View style={[styles.workoutIcon, { backgroundColor: theme.cardSubtle }]}>
                    <Ionicons name="barbell" size={16} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '600' }} numberOfLines={1}>
                      {w.equipmentName}
                    </Text>
                    {w.sets || w.weightLiftedKg ? (
                      <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                        {w.sets ? `${w.sets} × ${w.reps}` : ''}
                        {w.sets && w.weightLiftedKg ? ' · ' : ''}
                        {w.weightLiftedKg ? `${w.weightLiftedKg} ${t('progress.kg')}` : ''}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                </Pressable>
              ))}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  arrow: { padding: 4 },
  dayLabel: { fontSize: 15, fontWeight: '700', minWidth: 60, textAlign: 'center' },
  burnCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  burnIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burnValue: { fontSize: 26, fontWeight: '800' },
  burnUnit: { fontSize: 14, fontWeight: '600' },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: Spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.sm, marginTop: Spacing.xs },
  empty: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 8,
  },
  workoutIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerRow: { flexDirection: 'row', gap: Spacing.sm },
});
