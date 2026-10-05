import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { Icon } from '@/components/icon';
import { MealPlanCard } from '@/components/meal-plan-card';
import { ProgramBody } from '@/components/program-body';
import { SchedulePlanCard } from '@/components/schedule-plan-card';
import { InfoLine, StatusPill } from '@/components/system';
import { Text } from '@/components/text';
import { Button, Card, MacroTile, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { usePlanGate } from '@/hooks/use-plan-gate';
import { useTheme } from '@/hooks/use-theme';
import { alertDestructive } from '@/lib/alerts';
import { isMockMode } from '@/lib/api';
import { successHaptic } from '@/lib/feedback';
import { programProgress, streakDays, totalsForDay, useAppStore, workoutStreakDays } from '@/lib/store';
import type { Program } from '@/lib/types';

function newProgramId(): string {
  return `program-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The AI program: a draft to start, tailor or redo; or the program you are
 * on, with progress against it. Building happens in /program-build (the
 * questions and "Calgym is thinking…"), tailoring in /program-tailor.
 *
 * Start does it all in one tap: the program's week becomes a new saved
 * schedule and the active one, and its targets and meal plan take effect.
 * The week you had stays in Schedules, so switching back is one tap there.
 */
export default function ProgramScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { started } = useLocalSearchParams<{ started?: string }>();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';

  const profile = useAppStore((s) => s.profile);
  const meals = useAppStore((s) => s.meals);
  const workouts = useAppStore((s) => s.workouts);
  const activeProgram = useAppStore((s) => s.activeProgram);
  const draft = useAppStore((s) => s.programDraft);
  const savedSchedules = useAppStore((s) => s.savedSchedules);
  const activeScheduleId = useAppStore((s) => s.activeScheduleId);
  const setActiveProgram = useAppStore((s) => s.setActiveProgram);
  const setProgramDraft = useAppStore((s) => s.setProgramDraft);
  const startProgram = useAppStore((s) => s.startProgram);
  const gate = usePlanGate();
  const canBuild = gate.isOpen('program');

  const openBuild = () => {
    if (!gate.guard('program')) return;
    router.push('/program-build');
  };

  const start = () => {
    if (!draft) return;
    const p = draft.program;
    const date = new Date().toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    const program: Program = {
      id: newProgramId(),
      createdAt: new Date().toISOString(),
      goal: draft.answers?.goal ?? profile?.goal ?? 'maintain',
      durationWeeks: p.durationWeeks,
      summary: p.summary,
      targets: p.targets,
      schedule: p.schedule,
      mealPlan: p.mealPlan,
      scope: draft.answers?.scope ?? 'both',
    };
    startProgram(
      program,
      { schedule: t('program.scheduleName', { date }), previous: t('program.previousName', { date }) },
      draft.answers && !draft.answers.skipped ? draft.answers : null,
    );
    successHaptic();
    router.replace('/program?started=1');
  };

  const startOver = () =>
    alertDestructive(t('program.startOverTitle'), t('program.startOverBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      ...(activeProgram
        ? [{ text: t('program.discardDraft'), onPress: () => setProgramDraft(null) }]
        : []),
      {
        text: t('program.answerAgain'),
        style: 'destructive' as const,
        onPress: () => {
          setProgramDraft(null);
          openBuild();
        },
      },
    ]);

  const endProgram = () => {
    alertDestructive(t('program.endConfirmTitle'), t('program.endConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('program.endConfirmCta'), style: 'destructive', onPress: () => setActiveProgram(null) },
    ]);
  };

  // ── Draft: built, not started ──────────────────────────────────────────
  if (draft) {
    const p = draft.program;
    const scope = draft.answers?.scope ?? 'both';
    const allergies = [...(draft.answers?.allergies ?? []).map((a) => t(`allergy.${a}`)), ...(draft.answers?.allergyOther ? [draft.answers.allergyOther] : [])];
    return (
      <Screen
        header={<PageHeader title={t('program.yourProgram')} />}
        footer={
          <View style={{ gap: Spacing.xs }}>
            <Button label={t('program.start')} icon="checkmark-circle" onPress={start} />
            <Button
              label={draft.freeLeft > 0 ? t('program.tailorFree', { count: draft.freeLeft }) : t('program.tailor')}
              icon="chatbubbles-outline"
              variant="secondary"
              onPress={() => router.push('/program-tailor')}
            />
            <Button label={t('program.startOver')} variant="ghost" onPress={startOver} />
          </View>
        }
      >
        <View style={styles.draftRow}>
          <StatusPill label={t('program.draft')} tone="review" icon="create-outline" />
          <Text style={{ color: theme.textSecondary, fontSize: 13, flex: 1 }}>{t('program.draftNote')}</Text>
        </View>
        <ProgramBody program={p} scope={scope} locale={locale} />
        {allergies.length > 0 && scope !== 'training' && (
          <View style={{ marginTop: Spacing.md }}>
            <InfoLine icon="shield-checkmark-outline">{t('program.allergyChecked', { list: allergies.join(', ') })}</InfoLine>
          </View>
        )}
        {draft.chat.length > 0 && (
          <Pressable onPress={() => router.push('/program-tailor')} accessibilityRole="button" style={[styles.chatLink, { backgroundColor: theme.surfaceTint }]}>
            <Icon name="chatbubbles-outline" size={16} color={theme.primaryDark} />
            <Text style={{ color: theme.primaryDark, fontWeight: '700', flex: 1 }}>{t('program.changesMade', { count: draft.chat.filter((m) => m.changes?.length).length })}</Text>
            <Icon name="chevron-forward" size={16} color={theme.primaryDark} />
          </Pressable>
        )}
      </Screen>
    );
  }

  // ── Active: a started program, with progress against it ────────────────
  if (activeProgram) {
    const { daysLeft, weekNumber, pct } = programProgress(activeProgram);
    const todayTotals = totalsForDay(meals, new Date());
    const programSchedule = savedSchedules.find((s) => s.id === activeProgram.scheduleId);
    const onProgramWeek = !!programSchedule && programSchedule.id === activeScheduleId;
    const scope = activeProgram.scope ?? 'both';

    return (
      <Screen header={<PageHeader title={t('program.title')} />}>
        {started === '1' && (
          <View style={[styles.started, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
            <View style={[styles.startedIcon, { backgroundColor: theme.success }]}>
              <Icon name="checkmark" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{t('program.startedTitle')}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 }}>
                {[
                  activeProgram.schedule && scope !== 'food' ? t('program.startedTraining') : null,
                  scope !== 'training' ? t('program.startedFood') : null,
                  activeProgram.schedule && scope !== 'food' ? t('program.startedKept') : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
              </Text>
            </View>
          </View>
        )}

        <Card style={{ marginBottom: Spacing.md }}>
          <Text style={{ color: theme.text, fontSize: 15, lineHeight: 21 }}>{activeProgram.summary}</Text>
          <View style={styles.progressRow}>
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>
              {t('program.weekProgress', { current: weekNumber, total: activeProgram.durationWeeks })}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('program.daysLeft', { count: daysLeft })}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: theme.border }]}>
            <View style={[styles.trackFill, { backgroundColor: theme.primary, width: `${pct}%` }]} />
          </View>
        </Card>

        <View style={styles.streakRow}>
          <View style={[styles.streakCard, { backgroundColor: theme.card }]}>
            <Icon name="flame" size={18} color={theme.primary} />
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>{streakDays(meals)}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{t('program.streak')}</Text>
          </View>
          <View style={[styles.streakCard, { backgroundColor: theme.card }]}>
            <Icon name="barbell" size={18} color={theme.primary} />
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>{workoutStreakDays(workouts)}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{t('program.workoutStreak')}</Text>
          </View>
        </View>

        <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.sm }]}>{t('program.todayProgress')}</Text>
        {/* Two to a row: four on a phone split "/2100 kcal" across lines. */}
        <View style={{ gap: Spacing.sm }}>
          <View style={styles.macroRow}>
            <MacroTile label={t('home.calories')} value={todayTotals.calories} target={activeProgram.targets.calories} color={theme.primary} unit={t('common.kcal')} />
            <MacroTile label={t('home.protein')} value={todayTotals.proteinG} target={activeProgram.targets.proteinG} color={theme.protein} unit={t('common.grams')} />
          </View>
          <View style={styles.macroRow}>
            <MacroTile label={t('home.carbs')} value={todayTotals.carbsG} target={activeProgram.targets.carbsG} color={theme.carbs} unit={t('common.grams')} />
            <MacroTile label={t('home.fat')} value={todayTotals.fatG} target={activeProgram.targets.fatG} color={theme.fat} unit={t('common.grams')} />
          </View>
        </View>

        {activeProgram.schedule && (
          <>
            <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: Spacing.sm }]}>{t('program.schedule')}</Text>
            <SchedulePlanCard plan={activeProgram.schedule} locale={locale} added onAdd={() => {}} hideAction style={{ maxWidth: '100%', alignSelf: 'stretch' }} />
          </>
        )}
        {/* The program's week is one saved schedule among others: switch freely. */}
        <Pressable onPress={() => router.push('/schedules')} accessibilityRole="button" style={[styles.chatLink, { backgroundColor: theme.surfaceTint }]}>
          <Icon name="albums-outline" size={16} color={theme.primaryDark} />
          <Text style={{ color: theme.primaryDark, fontWeight: '700', flex: 1 }}>
            {programSchedule && !onProgramWeek ? t('program.backToProgramWeek', { name: programSchedule.name }) : t('program.otherWeeks')}
          </Text>
          <Icon name="chevron-forward" size={16} color={theme.primaryDark} />
        </Pressable>

        {activeProgram.mealPlan && (
          <>
            <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: Spacing.sm }]}>{t('program.mealPlan')}</Text>
            <MealPlanCard plan={activeProgram.mealPlan} schedule={activeProgram.schedule} locale={locale} />
          </>
        )}

        <Button label={t('program.buildNew')} variant="secondary" icon={canBuild ? 'sparkles' : 'lock-closed'} onPress={openBuild} style={{ marginTop: Spacing.md }} />
        <Button label={t('program.endProgram')} variant="ghost" onPress={endProgram} style={{ marginTop: Spacing.xs }} />
      </Screen>
    );
  }

  // ── Nothing yet: intro + build ─────────────────────────────────────────
  return (
    <Screen
      header={<PageHeader title={t('program.title')} />}
      footer={<Button label={t('program.build')} icon={canBuild ? 'sparkles' : 'lock-closed'} onPress={openBuild} />}
    >
      <Card>
        <Icon name="sparkles" size={24} color={theme.primary} style={{ marginBottom: Spacing.sm }} />
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16, marginBottom: 4 }}>{t('program.introTitle')}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>{t('program.introBody')}</Text>
      </Card>
      <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
        {(['ask', 'think', 'draft', 'start'] as const).map((k, i) => (
          <View key={k} style={styles.howRow}>
            <View style={[styles.howNum, { backgroundColor: theme.surfaceTint }]}>
              <Text style={{ color: theme.primaryDark, fontWeight: '800' }}>{i + 1}</Text>
            </View>
            <Text style={{ color: theme.text, fontSize: 14, flex: 1, lineHeight: 20 }}>{t(`program.how.${k}`)}</Text>
          </View>
        ))}
      </View>
      {isMockMode && <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: Spacing.sm }}>{t('scan.mockBadge')}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  macroRow: { flexDirection: 'row', gap: Spacing.sm },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  track: { height: 6, borderRadius: 3, marginTop: 6, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3 },
  streakRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  streakCard: { flex: 1, alignItems: 'center', borderRadius: 16, paddingVertical: Spacing.sm, gap: 2 },
  draftRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  chatLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.ms, borderRadius: Radius.md, marginTop: Spacing.md, minHeight: 48 },
  started: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, marginBottom: Spacing.md, alignItems: 'flex-start' },
  startedIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  howRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  howNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
