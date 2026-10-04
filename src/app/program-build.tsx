import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { AnswersSummary, FoodQuestions, GoalQuestions, ScopeQuestion, TrainingQuestions } from '@/components/plan-questions';
import { ProgramThinking, type ThinkingStep } from '@/components/program-thinking';
import { InfoLine } from '@/components/system';
import { Button, Screen } from '@/components/ui';
import { Spacing, Type } from '@/constants/theme';
import { usePlanGate } from '@/hooks/use-plan-gate';
import { useTheme } from '@/hooks/use-theme';
import { alertProblem } from '@/lib/alerts';
import { generateProgram } from '@/lib/api';
import { aiFailureAction } from '@/lib/api-errors';
import { buildCoachContext } from '@/lib/coach-context';
import { useEntitlement } from '@/lib/entitlement';
import { successHaptic } from '@/lib/feedback';
import { includesFood, includesTraining, startingAnswers } from '@/lib/plan-answers';
import { useAppStore } from '@/lib/store';
import type { PlanAnswers } from '@/lib/types';

type Step = 'scope' | 'training' | 'food' | 'goal' | 'review';

/**
 * Before a program is built: a few short questions, one group per screen —
 * what to plan, the training week, how you eat, the goal — then a review.
 * Building shows "Calgym is thinking…" and ends on a draft: nothing in the
 * app changes until Start on the program screen.
 */
export default function ProgramBuild() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const language = useAppStore((s) => s.language) ?? 'en';
  const saved = useAppStore((s) => s.planPrefs);
  const schedule = useAppStore((s) => s.schedule);
  const profile = useAppStore((s) => s.profile);
  const setPlanPrefs = useAppStore((s) => s.setPlanPrefs);
  const setProgramDraft = useAppStore((s) => s.setProgramDraft);
  const programsCap = useEntitlement((s) => s.features?.programs);
  const programWeight = useEntitlement((s) => s.weights?.program) ?? 5;
  const gate = usePlanGate();
  const canBuild = gate.isOpen('program');

  const [answers, setAnswers] = useState<PlanAnswers>(() => startingAnswers(saved, schedule, profile));
  const steps: Step[] = useMemo(
    () => ['scope', ...(includesTraining(answers) ? (['training'] as const) : []), ...(includesFood(answers) ? (['food'] as const) : []), 'goal', 'review'],
    [answers],
  );
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const [phase, setPhase] = useState<'questions' | 'thinking'>('questions');
  const [arrived, setArrived] = useState(false);
  const [sent, setSent] = useState<PlanAnswers | null>(null);

  const back = () => (stepIndex > 0 ? setStepIndex(stepIndex - 1) : router.back());
  const next = () => setStepIndex(Math.min(stepIndex + 1, steps.length - 1));

  const build = async (skip = false) => {
    if (!gate.guard('program')) return;
    // Skipping the questions still never plans around an allergy we know.
    const sending: PlanAnswers = skip
      ? { scope: 'both', skipped: true, allergies: saved?.allergies, allergyOther: saved?.allergyOther }
      : answers;
    setSent(sending);
    setArrived(false);
    setPhase('thinking');
    try {
      const context = await buildCoachContext(language);
      const program = await generateProgram(language, context, sending);
      if (!skip) setPlanPrefs({ ...answers, skipped: undefined });
      setProgramDraft({
        program,
        answers: sending,
        draftId: program.draftId,
        freeLeft: program.freeChanges ?? 2,
        chat: [],
        createdAt: new Date().toISOString(),
      });
      void useEntitlement.getState().refresh();
      setArrived(true);
    } catch (err) {
      setPhase('questions');
      const action = aiFailureAction(err, { titleKey: 'program.unusableTitle', bodyKey: 'program.unusableBody' });
      if (action.kind === 'none') return;
      if (action.kind === 'upgrade') {
        void useEntitlement.getState().refresh();
        router.push(`/membership?reason=${action.reason}`);
        return;
      }
      alertProblem(t(action.titleKey), t(action.bodyKey, action.values));
    }
  };

  const onFinished = useCallback(() => {
    successHaptic();
    router.replace('/program');
  }, [router]);

  if (phase === 'thinking') {
    const a = sent ?? answers;
    const dayNames = (a.weekdays ?? []).map((d) => new Date(2024, 0, 7 + d).toLocaleDateString(locale, { weekday: 'short' })).join(' · ');
    const allergyNames = [...(a.allergies ?? []).map((x) => t(`allergy.${x}`)), ...(a.allergyOther ? [a.allergyOther] : [])];
    const thinking: ThinkingStep[] = [
      { title: t('program.steps.read'), sub: t('program.steps.readSub') },
      ...(!a.skipped && includesTraining(a)
        ? [{ title: t('program.steps.days', { count: a.weekdays?.length ?? a.days ?? 0 }), sub: dayNames }]
        : a.skipped ? [{ title: t('program.steps.week') }] : []),
      {
        title: t('program.steps.targets'),
        sub: a.goal ? t(`planQ.goals.${a.goal}`) + (a.goal !== 'maintain' && a.pace ? ` · ${t(`planQ.paceKg.${a.goal}_${a.pace}`)}` : '') : undefined,
      },
      ...(includesFood(a)
        ? [{ title: t('program.steps.meals'), sub: allergyNames.length > 0 ? t('program.steps.mealsWithout', { list: allergyNames.join(', ') }) : undefined }]
        : []),
      { title: t('program.steps.check'), sub: t('program.steps.checkSub') },
    ];
    return (
      <Screen header={<PageHeader title={t('program.title')} />}>
        <ProgramThinking steps={thinking} done={arrived} onFinished={onFinished} />
      </Screen>
    );
  }

  const costNote =
    typeof programsCap === 'number'
      ? t('planQ.costBuild', { month: new Date().toLocaleDateString(locale, { month: 'long' }) })
      : t('planQ.costActions', { count: programWeight });

  return (
    <Screen
      header={
        <PageHeader
          title={t('program.title')}
          subtitle={t('planQ.stepOf', { n: stepIndex + 1, total: steps.length })}
          onBack={back}
        />
      }
      footer={
        <View style={{ gap: Spacing.xs }}>
          {step === 'review' ? (
            <Button label={t('planQ.build')} icon={canBuild ? 'sparkles' : 'lock-closed'} onPress={() => build(false)} />
          ) : (
            <Button label={t('common.next')} onPress={next} />
          )}
          {step === 'scope' && <Button label={t('planQ.skip')} variant="ghost" onPress={() => build(true)} />}
        </View>
      }
    >
      <View style={[styles.track, { backgroundColor: theme.border }]}>
        <View style={[styles.fill, { backgroundColor: theme.primary, width: `${((stepIndex + 1) / steps.length) * 100}%` }]} />
      </View>
      <Text style={[Type.title, { color: theme.text }]} accessibilityRole="header">{t(`planQ.titles.${step}`)}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 15, marginTop: 4, marginBottom: Spacing.md, lineHeight: 21 }}>{t(`planQ.subs.${step}`)}</Text>

      {step === 'scope' && <ScopeQuestion answers={answers} onChange={setAnswers} />}
      {step === 'training' && <TrainingQuestions answers={answers} onChange={setAnswers} />}
      {step === 'food' && <FoodQuestions answers={answers} onChange={setAnswers} />}
      {step === 'goal' && <GoalQuestions answers={answers} onChange={setAnswers} />}
      {step === 'review' && (
        <>
          <AnswersSummary answers={answers} onEdit={(s) => setStepIndex(Math.max(0, steps.indexOf(s)))} />
          <View style={{ height: Spacing.md }} />
          <InfoLine icon="sparkles-outline">{`${costNote} ${t('planQ.costChanges')}`}</InfoLine>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: Spacing.md },
  fill: { height: 4, borderRadius: 2 },
});
