import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { allExercises, exerciseName, MUSCLE_GROUPS } from '@/lib/exercises';
import { useAppStore } from '@/lib/store';
import type { Exercise, MuscleGroup } from '@/lib/types';

export default function ExerciseLibrary() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const custom = useAppStore((s) => s.exercises);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<MuscleGroup | 'all'>('all');

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = allExercises(custom).filter((ex) => {
      if (category !== 'all' && ex.category !== category) return false;
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
  }, [custom, query, category, lang]);

  const total = grouped.reduce((n, g) => n + g.items.length, 0);

  return (
    <Screen
      footer={
        <Button
          label={t('exercises.newExercise')}
          icon="add"
          onPress={() => router.push('/exercise-edit')}
        />
      }
    >
      <View style={styles.header}>
        <Ionicons name="barbell" size={22} color={theme.text} />
        <Text style={[Type.title, { color: theme.text, flex: 1 }]}>{t('exercises.title')}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>

      {/* Search */}
      <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }, cardShadow(theme.shadow)]}>
        <Ionicons name="search" size={18} color={theme.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('exercises.searchPlaceholder')}
          placeholderTextColor={theme.textTertiary}
          style={[styles.searchInput, { color: theme.text }]}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={{ marginBottom: Spacing.sm }}
      >
        {(['all', ...MUSCLE_GROUPS] as const).map((cat) => {
          const active = category === cat;
          return (
            <Pressable
              key={cat}
              onPress={() => setCategory(cat)}
              style={[
                styles.filterChip,
                { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border },
              ]}
            >
              <Text style={{ color: active ? theme.onPrimary : theme.textSecondary, fontWeight: '700', fontSize: 13 }}>
                {cat === 'all' ? t('exercises.all') : t(`muscles.${cat}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={{ color: theme.textTertiary, fontSize: 12, marginBottom: Spacing.sm }}>
        {t('exercises.count', { count: total })}
      </Text>

      {grouped.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="search" size={30} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>{t('exercises.noResults')}</Text>
        </View>
      ) : (
        grouped.map((g) => (
          <View key={g.cat} style={{ marginBottom: Spacing.sm }}>
            <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>{t(`muscles.${g.cat}`)}</Text>
            <View style={[styles.groupCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
              {g.items.map((ex, i) => (
                <Pressable
                  key={ex.id}
                  onPress={() => router.push(`/exercise-detail?id=${encodeURIComponent(ex.id)}`)}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: theme.cardSubtle }]}>
                    <Ionicons
                      name={ex.source === 'builtin' ? 'barbell-outline' : ex.source === 'scan' ? 'camera-outline' : 'create-outline'}
                      size={16}
                      color={theme.primary}
                    />
                  </View>
                  <Text style={{ color: theme.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                    {exerciseName(ex, lang)}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
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
  filterRow: { gap: Spacing.xs, paddingEnd: Spacing.md },
  filterChip: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  groupTitle: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: Spacing.xs, textTransform: 'uppercase', letterSpacing: 0.4 },
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
