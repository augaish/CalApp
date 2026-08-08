import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollView,
} from 'react-native';
import { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { Button, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SERVER_URL } from '@/lib/api';
import { useViewDay } from '@/lib/day';
import { exerciseName, findExercise } from '@/lib/exercises';
import { lightHaptic } from '@/lib/feedback';
import { encodeSchedule } from '@/lib/share';
import { useAppStore } from '@/lib/store';

/** Labels for weekdays 0–6 in the active locale (Jan 7 2024 was a Sunday). */
function weekdayLabel(i: number, locale: string, format: 'short' | 'long'): string {
  return new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: format });
}

export default function ScheduleScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const lang = locale;

  const schedule = useAppStore((s) => s.schedule);
  const custom = useAppStore((s) => s.exercises);
  const workouts = useAppStore((s) => s.workouts);
  const addToSchedule = useAppStore((s) => s.addToSchedule);
  const removeFromSchedule = useAppStore((s) => s.removeFromSchedule);
  const reorderSchedule = useAppStore((s) => s.reorderSchedule);
  const setScheduleTitle = useAppStore((s) => s.setScheduleTitle);
  const viewDay = useViewDay((s) => s.day);

  const [weekday, setWeekday] = useState<number>(viewDay.getDay());
  const pageRef = useAnimatedRef<ScrollView>();
  const day = schedule[weekday] ?? { exerciseIds: [] };

  const sharePlan = async () => {
    const hasAny = Object.values(schedule).some((d) => d.exerciseIds.length > 0);
    if (!hasAny) {
      Alert.alert(t('schedule.shareEmpty'));
      return;
    }
    // Carry along only the custom / scan exercises the plan actually uses.
    const referenced = new Set<string>();
    Object.values(schedule).forEach((d) => d.exerciseIds.forEach((exId) => referenced.add(exId)));
    const exported = custom.filter((e) => referenced.has(e.id));
    const data = encodeSchedule({ v: 1, schedule, exercises: exported });
    const url = `${SERVER_URL}/s?d=${data}`;
    lightHaptic();
    try {
      await Share.share({ message: `${t('schedule.shareMessage')}\n${url}` });
    } catch {
      // user cancelled the share sheet — no-op
    }
  };

  // Distinct exercises the user has actually logged, newest first — the
  // one-tap "add from history" source. Excludes ones already on this day.
  const historyExercises = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const w of workouts) {
      if (seen.has(w.exerciseId)) continue;
      seen.add(w.exerciseId);
      out.push({ id: w.exerciseId, name: w.exerciseName });
    }
    return out;
  }, [workouts]);
  const historyToAdd = historyExercises.filter((h) => !day.exerciseIds.includes(h.id));

  return (
    <Screen
      scrollRef={pageRef}
      footer={<Button label={t('common.done')} onPress={() => router.back()} />}
    >
      <View style={styles.header}>
        <Ionicons name="calendar" size={22} color={theme.text} />
        <Text style={[Type.title, { color: theme.text, flex: 1 }]}>{t('schedule.title')}</Text>
        <Pressable onPress={sharePlan} hitSlop={10} style={{ marginEnd: Spacing.sm }}>
          <Ionicons name="share-outline" size={22} color={theme.primary} />
        </Pressable>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>

      <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: Spacing.sm }}>
        {t('schedule.subtitle')}
      </Text>

      {/* Weekday selector */}
      <View style={styles.weekRow}>
        {Array.from({ length: 7 }, (_, i) => {
          const active = weekday === i;
          const has = (schedule[i]?.exerciseIds.length ?? 0) > 0;
          return (
            <Pressable
              key={i}
              onPress={() => setWeekday(i)}
              style={[
                styles.weekChip,
                { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border },
              ]}
            >
              <Text style={{ color: active ? theme.onPrimary : theme.textSecondary, fontWeight: '700', fontSize: 12 }}>
                {weekdayLabel(i, locale, 'short')}
              </Text>
              {has && <View style={[styles.hasDot, { backgroundColor: active ? theme.onPrimary : theme.primary }]} />}
            </Pressable>
          );
        })}
      </View>

      {/* Day title */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6, marginTop: Spacing.sm }]}>
        {t('schedule.dayName')}
      </Text>
      <View style={[styles.inputWrap, { backgroundColor: theme.card, borderColor: theme.border }, cardShadow(theme.shadow)]}>
        <TextInput
          value={day.title ?? ''}
          onChangeText={(txt) => setScheduleTitle(weekday, txt)}
          placeholder={t('schedule.dayNamePlaceholder', { weekday: weekdayLabel(weekday, locale, 'long') })}
          placeholderTextColor={theme.textTertiary}
          maxLength={40}
          style={{ flex: 1, color: theme.text, fontSize: 16, padding: 0 }}
        />
      </View>

      {/* Exercises for this weekday */}
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        {t('schedule.exercisesFor', { weekday: weekdayLabel(weekday, locale, 'long') })}
      </Text>
      {day.exerciseIds.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="barbell-outline" size={28} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>{t('schedule.emptyDay')}</Text>
        </View>
      ) : (
        <View style={[styles.listCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <Sortable.Grid
            columns={1}
            rowGap={0}
            data={day.exerciseIds}
            keyExtractor={(exId) => exId}
            dragActivationDelay={220}
            hapticsEnabled
            scrollableRef={pageRef}
            // Reordering here is the weekday's own order, so every later
            // occurrence of it follows — unlike dragging a single day, which
            // only overrides that date.
            onDragEnd={({ data }) => reorderSchedule(weekday, data)}
            renderItem={({ item: exId, index: i }) => {
            const ex = findExercise(exId, custom);
            const planned = day.plans?.[exId] ?? [];
            return (
              <View
                key={exId}
                style={[
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                ]}
              >
                <Pressable
                  style={({ pressed }) => [styles.rowTap, pressed && { opacity: 0.6 }]}
                  onPress={() =>
                    router.push(`/schedule-plan?weekday=${weekday}&id=${encodeURIComponent(exId)}`)
                  }
                >
                  <View style={[styles.rowIcon, { backgroundColor: theme.cardSubtle }]}>
                    <Ionicons name="barbell" size={15} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '600' }} numberOfLines={1}>
                      {ex ? exerciseName(ex, lang) : exId}
                    </Text>
                    <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                      {planned.length > 0
                        ? t('schedule.setsPlanned', { count: planned.length })
                        : t('schedule.addSets')}
                    </Text>
                  </View>
                  <Ionicons name="create-outline" size={17} color={theme.textSecondary} />
                </Pressable>
                <Pressable onPress={() => removeFromSchedule(weekday, exId)} hitSlop={8} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={20} color={theme.textTertiary} />
                </Pressable>
              </View>
            );
            }}
          />
        </View>
      )}

      {/* One-tap add from previously logged exercises */}
      {historyToAdd.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.md }]}>
            {t('schedule.fromHistory')}
          </Text>
          <View style={styles.chipWrap}>
            {historyToAdd.map((h) => {
              const ex = findExercise(h.id, custom);
              return (
                <Pressable
                  key={h.id}
                  onPress={() => addToSchedule(weekday, h.id)}
                  style={({ pressed }) => [
                    styles.historyChip,
                    { backgroundColor: theme.cardSubtle },
                    pressed && { transform: [{ scale: 0.95 }] },
                  ]}
                >
                  <Ionicons name="add" size={15} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                    {ex ? exerciseName(ex, lang) : h.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <Button
        label={t('schedule.addExercise')}
        icon="search"
        variant="secondary"
        onPress={() => router.push(`/exercise-library?pick=schedule&weekday=${weekday}`)}
        style={{ marginTop: Spacing.md }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  weekRow: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  weekChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingVertical: 10,
    gap: 4,
  },
  hasDot: { width: 5, height: 5, borderRadius: 2.5 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    marginBottom: Spacing.md,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: Spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  historyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  listCard: { borderRadius: Radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  rowTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  empty: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
});
