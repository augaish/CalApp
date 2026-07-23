import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePending } from '@/lib/pending';

export default function GymResult() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const analysis = usePending((s) => s.equipment);
  const photoUri = usePending((s) => s.photoUri);

  useEffect(() => {
    if (!analysis && router.canGoBack()) router.back();
  }, [analysis, router]);

  if (!analysis) return null;

  // "Log this exercise" opens the entry page (prefilled from the scan) so the
  // user records the actual sets/reps/weight lifted before it's saved.
  const save = () => {
    const params = new URLSearchParams({
      name: analysis.name,
      sets: String(analysis.suggestion.sets),
      reps: analysis.suggestion.reps,
    });
    router.push(`/workout-edit?${params.toString()}`);
  };

  return (
    <Screen
      footer={
        <View>
          <Button label={t('gymResult.logWorkout')} onPress={save} />
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
