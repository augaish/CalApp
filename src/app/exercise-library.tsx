import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { BodyMap, BodyMapViewSwitch, type BodyMapView } from '@/components/body-map';
import { Text, TextInput } from '@/components/text';
import { Button, Card, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow, tracking } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic } from '@/lib/feedback';
import { allExercises, exerciseIcon, exerciseName, MUSCLE_COLORS, MUSCLE_GROUPS } from '@/lib/exercises';
import { dayExerciseIds } from '@/lib/day-plan';
import { keyToDate } from '@/lib/occurrences';
import { isSameDay, useAppStore } from '@/lib/store';
import type { Exercise, MuscleGroup, MuscleId } from '@/lib/types';

/** Groups with more than one distinct muscle worth separating out. Groups
 * absent here (chest, biceps, triceps, forearms, glutes, calves, cardio,
 * fullBody) are already 1:1 with a single MuscleId, so a sub-filter would
 * just repeat the category chip. */
const SUB_MUSCLES: Partial<Record<MuscleGroup, MuscleId[]>> = {
  back: ['lats', 'traps', 'rhomboids', 'lower_back'],
  shoulders: ['front_delts', 'side_delts', 'rear_delts'],
  legs: ['quads', 'hamstrings', 'adductors', 'hip_flexors'],
  core: ['abs', 'obliques'],
};

export default function ExerciseLibrary() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const custom = useAppStore((s) => s.exercises);
  const addToSchedule = useAppStore((s) => s.addToSchedule);
  const removeFromSchedule = useAppStore((s) => s.removeFromSchedule);
  const schedule = useAppStore((s) => s.schedule);

  const { pick, weekday, date } = useLocalSearchParams<{ pick?: string; weekday?: string; date?: string }>();
  const pickForSchedule = pick === 'schedule';
  // Adding to one day's list (Training's "Add exercise"): nothing is logged,
  // the weekly schedule is untouched.
  const pickForDay = pick === 'day' && !!date;
  const picking = pickForSchedule || pickForDay;
  const wd = Number(weekday);
  const day = useMemo(() => (date ? keyToDate(date) : new Date()), [date]);
  const occurrences = useAppStore((s) => s.occurrences);
  const workouts = useAppStore((s) => s.workouts);
  const skips = useAppStore((s) => s.skips);
  const dayOrder = useAppStore((s) => s.dayOrder);
  const dayExtras = useAppStore((s) => s.dayExtras);
  const addToDay = useAppStore((s) => s.addToDay);
  const removeFromDay = useAppStore((s) => s.removeFromDay);
  const skipPlanToday = useAppStore((s) => s.skipPlanToday);
  const dayList = pickForDay ? dayExerciseIds({ schedule, occurrences, workouts, skips, dayOrder, dayExtras }, day) : null;
  const picked = pickForSchedule ? (schedule[wd]?.exerciseIds ?? []) : (dayList?.ids ?? []);
  // Already logged that day: it stays on the list (delete the sets to remove it).
  const locked = dayList ? dayList.unplannedIds : [];

  // In pick modes, tapping toggles the exercise in/out of that day and KEEPS
  // you here so you can add several in a row. Tap Done to go back.
  const onPickExercise = (ex: Exercise) => {
    if (pickForSchedule) {
      if (picked.includes(ex.id)) removeFromSchedule(wd, ex.id);
      else addToSchedule(wd, ex.id);
      lightHaptic();
    } else if (pickForDay && dayList) {
      if (locked.includes(ex.id)) return;
      if (dayList.addedIds.includes(ex.id)) removeFromDay(day, ex.id);
      else if (picked.includes(ex.id)) skipPlanToday(day, ex.id); // on the plan: off for this day only
      else addToDay(day, ex.id);
      lightHaptic();
    } else {
      router.push(`/exercise-detail?id=${encodeURIComponent(ex.id)}`);
    }
  };

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<MuscleGroup | 'all'>('all');
  const [subMuscle, setSubMuscle] = useState<MuscleId | 'all'>('all');
  const [pickerMode, setPickerMode] = useState<'chips' | 'map'>('chips');
  const [mapView, setMapView] = useState<BodyMapView>('front');

  const subOptions = category !== 'all' ? SUB_MUSCLES[category] : undefined;

  const setCategoryAndResetSub = (cat: MuscleGroup | 'all') => {
    setCategory(cat);
    setSubMuscle('all');
  };

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = allExercises(custom).filter((ex) => {
      if (category !== 'all' && ex.category !== category) return false;
      if (subMuscle !== 'all' && !ex.primaryMuscles?.includes(subMuscle)) return false;
      if (!q) return true;
      return [ex.name, ex.nameEn, ex.nameAr, ...(ex.aliases ?? [])]
        .filter(Boolean)
        .some((c) => (c as string).toLowerCase().includes(q));
    });
    const byCat = new Map<MuscleGroup, Exercise[]>();
    for (const ex of pool) {
      const arr = byCat.get(ex.category) ?? [];
      arr.push(ex);
      byCat.set(ex.category, arr);
    }
    return MUSCLE_GROUPS.map((cat) => ({
      cat,
      items: (byCat.get(cat) ?? []).sort((a, b) =>
        exerciseName(a, lang).localeCompare(exerciseName(b, lang), lang),
      ),
    })).filter((g) => g.items.length > 0);
  }, [custom, query, category, subMuscle, lang]);

  const total = grouped.reduce((n, g) => n + g.items.length, 0);

  return (
    <Screen
      footer={
        picking ? (
          <View style={{ gap: Spacing.xs }}>
            <Button
              label={pickForDay ? t('exercises.doneDay', { n: picked.length }) : t('exercises.doneAdding', { count: picked.length })}
              onPress={() => router.back()}
            />
            <Button
              label={t('exercises.newExercise')}
              icon="add"
              variant="secondary"
              onPress={() => router.push('/exercise-edit')}
            />
          </View>
        ) : (
          <Button
            label={t('exercises.newExercise')}
            icon="add"
            onPress={() => router.push('/exercise-edit')}
          />
        )
      }
    >
      <View style={styles.header}>
        <Icon name="barbell" size={22} color={theme.text} />
        <Text style={[Type.title, { color: theme.text, flex: 1 }]}>{t('exercises.title')}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Icon name="close" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>
      {pickForDay && (
        <Text style={{ color: theme.textSecondary, fontSize: 14, marginBottom: Spacing.sm }}>
          {isSameDay(new Date().toISOString(), day)
            ? t('exercises.dayHintToday')
            : t('exercises.dayHint', { day: day.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'short' }) })}
        </Text>
      )}

      {/* Search */}
      <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }, cardShadow(theme.shadow)]}>
        <Icon name="search" size={18} color={theme.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('exercises.searchPlaceholder')}
          placeholderTextColor={theme.textTertiary}
          style={[styles.searchInput, { color: theme.text }]}
        />
        {query.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.clear')} onPress={() => setQuery('')} hitSlop={8}>
            <Icon name="close-circle" size={18} color={theme.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* Category filter: chips (fast, scannable) or a tappable body map
          (visual, answers "what does this train"). Both just set `category`
          — the results below don't know or care which one was used. */}
      <View style={styles.modeRow}>
        {(['chips', 'map'] as const).map((mode) => {
          const active = pickerMode === mode;
          return (
            <Pressable accessibilityRole="button" key={mode} onPress={() => setPickerMode(mode)} hitSlop={6}>
              <View
                style={[
                  styles.modeChip,
                  { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border },
                ]}
              >
                <Icon
                  name={mode === 'chips' ? 'list-outline' : 'body-outline'}
                  size={14}
                  color={active ? theme.onPrimary : theme.textSecondary}
                />
                <Text style={{ color: active ? theme.onPrimary : theme.textSecondary, fontSize: 12, fontWeight: '700' }}>
                  {mode === 'chips' ? t('exercises.listView') : t('exercises.muscleMap')}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {pickerMode === 'chips' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          {(['all', ...MUSCLE_GROUPS] as const).map((cat) => {
            const active = category === cat;
            const accent = cat === 'all' ? theme.primary : MUSCLE_COLORS[cat];
            return (
              <Pressable accessibilityRole="button"
                key={cat}
                onPress={() => setCategoryAndResetSub(cat)}
                style={[
                  styles.filterChip,
                  { backgroundColor: active ? accent : theme.card, borderColor: active ? accent : theme.border },
                ]}
              >
                {cat !== 'all' && !active && (
                  <View style={[styles.chipDot, { backgroundColor: accent }]} />
                )}
                <Text style={{ color: active ? '#fff' : theme.textSecondary, fontWeight: '700', fontSize: 13 }}>
                  {cat === 'all' ? t('exercises.all') : t(`muscles.${cat}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Card style={styles.mapWrap}>
          <BodyMap
            view={mapView}
            highlighted={category === 'all' ? [] : [category]}
            onSelect={(g) => setCategoryAndResetSub(category === g ? 'all' : g)}
            size={150}
          />
          <BodyMapViewSwitch view={mapView} onChange={setMapView} />
        </Card>
      )}

      {/* Fine-grained sub-filter — only for categories with more than one
          distinct muscle worth separating (see SUB_MUSCLES above). */}
      {subOptions && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          {(['all', ...subOptions] as const).map((m) => {
            const active = subMuscle === m;
            const accent = category !== 'all' ? MUSCLE_COLORS[category] : theme.primary;
            return (
              <Pressable accessibilityRole="button"
                key={m}
                onPress={() => setSubMuscle(m)}
                style={[
                  styles.subChip,
                  { backgroundColor: active ? accent : theme.cardSubtle, borderColor: active ? accent : theme.border },
                ]}
              >
                <Text style={{ color: active ? '#fff' : theme.textSecondary, fontWeight: '600', fontSize: 12 }}>
                  {m === 'all' ? t('exercises.all') : t(`muscleIds.${m}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <Text style={{ color: theme.textTertiary, fontSize: 12, marginBottom: Spacing.sm }}>
        {t('exercises.count', { count: total })}
      </Text>

      {grouped.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Icon name="search" size={30} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>{t('exercises.noResults')}</Text>
        </View>
      ) : (
        grouped.map((g) => (
          <View key={g.cat} style={{ marginBottom: Spacing.sm }}>
            <View style={styles.groupTitleRow}>
              <View style={[styles.groupDot, { backgroundColor: MUSCLE_COLORS[g.cat] }]} />
              <Text style={[styles.groupTitle, { color: MUSCLE_COLORS[g.cat] }]}>{t(`muscles.${g.cat}`)}</Text>
            </View>
            <View style={[styles.groupCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
              {g.items.map((ex, i) => (
                <Pressable accessibilityRole="button"
                  key={ex.id}
                  accessibilityState={picking ? { selected: picked.includes(ex.id), disabled: locked.includes(ex.id) } : undefined}
                  onPress={() => onPickExercise(ex)}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: MUSCLE_COLORS[ex.category] + '22' }]}>
                    <Icon name={exerciseIcon(ex)} size={16} color={MUSCLE_COLORS[ex.category]} />
                  </View>
                  <Text style={{ color: theme.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                    {exerciseName(ex, lang)}
                  </Text>
                  {picking ? (
                    <Icon
                      name={locked.includes(ex.id) ? 'checkmark-done' : picked.includes(ex.id) ? 'checkmark-circle' : 'add-circle-outline'}
                      size={22}
                      color={picked.includes(ex.id) ? theme.primary : theme.textTertiary}
                    />
                  ) : (
                    <Icon name="chevron-forward" size={16} color={theme.textTertiary} />
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginBottom: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 16, padding: 0 },
  modeRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.sm },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    height: 32,
  },
  mapWrap: { alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  // flexGrow:0 stops this horizontal strip from absorbing the Screen's spare
  // vertical space (which stretched the chips into tall pills on short lists).
  filterScroll: { flexGrow: 0, marginBottom: Spacing.sm },
  filterRow: { gap: Spacing.xs, paddingEnd: Spacing.md, alignItems: 'center' },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  subChip: {
    height: 30,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginTop: Spacing.xs },
  groupDot: { width: 9, height: 9, borderRadius: 4.5 },
  groupTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: tracking(0.4) },
  groupCard: { borderRadius: Radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  rowIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  empty: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
});
