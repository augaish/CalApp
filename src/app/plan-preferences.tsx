import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { FoodQuestions, TrainingQuestions } from '@/components/plan-questions';
import { RowGroup, SectionTitle, SettingsRow } from '@/components/system';
import { Text } from '@/components/text';
import { Button, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { successHaptic } from '@/lib/feedback';
import { startingAnswers } from '@/lib/plan-answers';
import { useAppStore } from '@/lib/store';
import type { PlanAnswers } from '@/lib/types';

/**
 * Plan preferences — what the AI program asks before it builds, kept: your
 * training week, how you eat, and your allergies. The next build starts from
 * here, and allergies also warn on meal scans and recipes. Your goal and
 * pace live with your profile, so they are not repeated here.
 */
export default function PlanPreferences() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const saved = useAppStore((s) => s.planPrefs);
  const schedule = useAppStore((s) => s.schedule);
  const profile = useAppStore((s) => s.profile);
  const activeProgram = useAppStore((s) => s.activeProgram);
  const draft = useAppStore((s) => s.programDraft);
  const setPlanPrefs = useAppStore((s) => s.setPlanPrefs);
  const [answers, setAnswers] = useState<PlanAnswers>(() => startingAnswers(saved, schedule, profile));
  const [savedAt, setSavedAt] = useState(0);
  const dirty = JSON.stringify({ ...startingAnswers(saved, schedule, profile) }) !== JSON.stringify(answers);

  const save = () => {
    setPlanPrefs({ ...(saved ?? {}), ...answers, skipped: undefined });
    setSavedAt(Date.now());
    successHaptic();
  };

  return (
    <Screen
      header={<PageHeader title={t('profile.planPreferences')} backLabel={t('profile.title')} />}
      footer={<Button label={savedAt && !dirty ? t('planPrefs.saved') : t('common.save')} icon={savedAt && !dirty ? 'checkmark' : undefined} disabled={!dirty} onPress={save} />}
    >
      <Text style={{ color: theme.textSecondary, fontSize: 15, lineHeight: 21 }}>{t('planPrefs.intro')}</Text>

      <RowGroup style={{ marginTop: Spacing.md }}>
        <SettingsRow
          icon="sparkles-outline"
          title={draft ? t('planPrefs.openDraft') : activeProgram ? t('planPrefs.myProgram') : t('planPrefs.buildProgram')}
          onPress={() => router.push(draft || activeProgram ? '/program' : '/program-build')}
          last
        />
      </RowGroup>

      <SectionTitle>{t('planPrefs.food')}</SectionTitle>
      <FoodQuestions answers={answers} onChange={setAnswers} />

      <SectionTitle>{t('planPrefs.training')}</SectionTitle>
      <TrainingQuestions answers={answers} onChange={setAnswers} />
      <View style={{ height: Spacing.md }} />
    </Screen>
  );
}
