import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { matchExerciseByName } from '@/lib/exercises';
import { usePending } from '@/lib/pending';
import { useAppStore } from '@/lib/store';

export default function GymResult() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const analysis = usePending((s) => s.equipment);
  const photoUri = usePending((s) => s.photoUri);
  const custom = useAppStore((s) => s.exercises);
  const addExercise = useAppStore((s) => s.addExercise);

  // Whether this machine was ALREADY in the library (built-in or saved from
  // an earlier scan) before this screen ever ran — computed once, from the
  // library as it stood on arrival, so auto-saving a brand-new machine below
  // doesn't retroactively flip this to "already knew it" and misreport what
  // just happened.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const matched = useMemo(() => (analysis ? matchExerciseByName(analysis.name, custom) : undefined), [analysis]);

  useEffect(() => {
    if (!analysis && router.canGoBack()) router.back();
  }, [analysis, router]);

  // Turn the scan into (or reuse) a reusable library exercise.
  const ensureExercise = (): string => {
    if (matched) return matched.id;
    const description = [...analysis!.setupSteps, ...analysis!.formCues].map((s) => `• ${s}`).join('\n');
    return addExercise({
      name: analysis!.name,
      category: 'fullBody',
      type: 'weight_reps',
      photoUri: photoUri ?? undefined,
      description,
      source: 'scan',
    });
  };

  // The scan itself is the save — a machine you looked up here must be in
  // the library next time regardless of which button (if any) you tap to
  // leave, not only if you happen to tap a dedicated "save" action. Guarded
  // by a ref (not just the effect's own dependency array) so a duplicate
  // isn't created if the effect ever fires twice for one screen instance.
  const savedRef = useRef(false);
  useEffect(() => {
    if (analysis && !savedRef.current) {
      savedRef.current = true;
      ensureExercise();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);

  if (!analysis) return null;

  // "Log this exercise" → opens the per-set Track page for this exercise.
  const logIt = () => {
    const id = ensureExercise();
    router.replace(`/exercise-detail?id=${encodeURIComponent(id)}`);
  };

  return (
    <Screen
      footer={
        <View>
          <Button label={t('gymResult.logWorkout')} icon="add" onPress={logIt} />
          <Button
            label={t('common.done')}
            variant="ghost"
            onPress={() => {
              if (router.canGoBack()) router.back();
            }}
            style={{ marginTop: Spacing.xs }}
          />
        </View>
      }
    >
      <Title>{analysis.name}</Title>

      <Card style={{ backgroundColor: theme.cardSubtle }}>
        <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
          <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>
              {t(matched ? 'gymResult.matchedTitle' : 'gymResult.savedTitle')}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {t(matched ? 'gymResult.matchedBody' : 'gymResult.savedToLibrary')}
            </Text>
          </View>
        </View>
      </Card>

      {photoUri && <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />}

      <View style={styles.muscleRow}>
        {analysis.primaryMuscles.map((m) => (
          <Chip key={m} label={m} color={theme.primary} textColor={theme.onPrimary} />
        ))}
        {analysis.secondaryMuscles.map((m) => (
          <Chip key={m} label={m} color={theme.card} textColor={theme.textSecondary} bordered />
        ))}
      </View>

      <Button
        label={t('gymResult.watchVideo')}
        icon="logo-youtube"
        variant="secondary"
        onPress={() => {
          const query = encodeURIComponent(t('gymResult.videoQuery', { name: analysis.name }));
          Linking.openURL(`https://www.youtube.com/results?search_query=${query}`);
        }}
        style={styles.videoBtn}
      />

      <Section icon="options" title={t('gymResult.setup')} items={analysis.setupSteps} numbered />
      <Section icon="checkmark-circle" title={t('gymResult.formCues')} items={analysis.formCues} />
      <Section icon="warning" title={t('gymResult.mistakes')} items={analysis.commonMistakes} warning />

      <Card style={[styles.suggestCard, { borderColor: theme.primary }]}>
        <Text style={[styles.suggestTitle, { color: theme.primary }]}>
          {t('gymResult.suggestion')}
        </Text>
        <Text style={[styles.suggestValue, { color: theme.text }]}>
          {analysis.suggestion.sets} {t('gymResult.sets')} × {analysis.suggestion.reps}{' '}
          {t('gymResult.reps')}
        </Text>
        {analysis.suggestion.note ? (
          <Text style={{ color: theme.textSecondary, fontSize: 14 }}>{analysis.suggestion.note}</Text>
        ) : null}
      </Card>

      <Text style={[styles.disclaimer, { color: theme.textTertiary }]}>
        {t('common.aiDisclaimer')}
      </Text>
    </Screen>
  );
}

function Chip({
  label,
  color,
  textColor,
  bordered,
}: {
  label: string;
  color: string;
  textColor: string;
  bordered?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: color, borderColor: bordered ? theme.border : 'transparent', borderWidth: bordered ? 1 : 0 },
      ]}
    >
      <Text style={{ color: textColor, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function Section({
  icon,
  title,
  items,
  numbered,
  warning,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  items: string[];
  numbered?: boolean;
  warning?: boolean;
}) {
  const theme = useTheme();
  const titleColor = warning ? theme.warning : theme.text;
  return (
    <Card>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={18} color={warning ? theme.warning : theme.primary} />
        <Text style={[styles.sectionTitle, { color: titleColor }]}>{title}</Text>
      </View>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={{ color: theme.primary, fontWeight: '700' }}>
            {numbered ? `${i + 1}.` : '•'}
          </Text>
          <Text style={[styles.bulletText, { color: theme.text }]}>{item}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  photo: {
    width: '100%',
    height: 140,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
  },
  muscleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  videoBtn: { marginBottom: Spacing.md },
  disclaimer: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: Spacing.xs },
  bulletRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: 6 },
  bulletText: { fontSize: 15, lineHeight: 21, flex: 1 },
  suggestCard: { borderWidth: 2 },
  suggestTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  suggestValue: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
});
