import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { allExercises, exerciseIcon, exerciseName, findExercise, MUSCLE_COLORS } from '@/lib/exercises';
import { successHaptic } from '@/lib/feedback';
import { useAppStore } from '@/lib/store';

/**
 * Pick the exercise a duplicate should be folded into.
 *
 * A scan or a typo can leave two entries for the same movement — an Arabic
 * machine label read slightly wrong, say, sitting apart from the built-in it
 * means. No matcher catches those, because the two names genuinely differ, so
 * the person has to say which is which. What they must never lose in the
 * process is the sets they already logged, which is why this merges rather
 * than deletes.
 */
export default function ExerciseMerge() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const custom = useAppStore((s) => s.exercises);
  const workouts = useAppStore((s) => s.workouts);
  const language = useAppStore((s) => s.language) ?? 'en';
  const mergeExercise = useAppStore((s) => s.mergeExercise);
  const [query, setQuery] = useState('');

  const source = id ? findExercise(id, custom) : undefined;
  const loggedSets = useMemo(
    () => workouts.filter((w) => w.exerciseId === id).reduce((n, w) => n + w.sets.length, 0),
    [workouts, id],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allExercises(custom)
      .filter((ex) => ex.id !== id)
      .filter((ex) => !q || exerciseName(ex, language).toLowerCase().includes(q))
      .slice(0, 40);
  }, [custom, id, query, language]);

  if (!source) return null;

  const confirm = (targetId: string, targetName: string) => {
    Alert.alert(
      t('exerciseMerge.confirmTitle'),
      t('exerciseMerge.confirmBody', {
        from: exerciseName(source, language),
        into: targetName,
        count: loggedSets,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('exerciseMerge.action'),
          onPress: () => {
            mergeExercise(source.id, targetId);
            successHaptic();
            router.dismissTo('/exercise-library');
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Title>{t('exerciseMerge.title')}</Title>

      <Card style={{ backgroundColor: theme.cardSubtle, gap: 4 }}>
        <Text style={{ color: theme.text, fontWeight: '700' }}>{exerciseName(source, language)}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
          {loggedSets > 0
            ? t('exerciseMerge.keepsSets', { count: loggedSets })
            : t('exerciseMerge.noSets')}
        </Text>
      </Card>

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

      <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6 }]}>
        {t('exerciseMerge.pickTarget')}
      </Text>

      {matches.map((ex) => {
        const name = exerciseName(ex, language);
        return (
          <Pressable
            key={ex.id}
            onPress={() => confirm(ex.id, name)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.card, borderColor: theme.border },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: MUSCLE_COLORS[ex.category] }]}>
              <Ionicons name={exerciseIcon(ex)} size={15} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '600' }}>{name}</Text>
              <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                {t(`muscles.${ex.category}`)}
              </Text>
            </View>
            <Ionicons name="git-merge-outline" size={18} color={theme.textTertiary} />
          </Pressable>
        );
      })}

      {matches.length === 0 && (
        <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.lg }}>
          {t('exercises.noResults')}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 16, padding: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
