import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { SchedulePlanCard, weekdayLabel } from '@/components/schedule-plan-card';
import { Button, Card, MacroTile, Screen, Title } from '@/components/ui';
import { Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FeatureLockedError, generateProgram, isMockMode, QuotaError } from '@/lib/api';
import { buildCoachContext } from '@/lib/coach-context';
import { resolveCoachSchedule } from '@/lib/coach-schedule';
import { useEntitlement } from '@/lib/entitlement';
import { successHaptic } from '@/lib/feedback';
import { streakDays, totalsForDay, useAppStore, workoutStreakDays } from '@/lib/store';
import type { GeneratedProgram, Program } from '@/lib/types';

function newProgramId(): string {
  return `program-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * One AI-designed program: calorie/macro targets and a weekly schedule,
 * proposed together and only committed once the user taps Accept — same
 * "propose, preview, one tap to apply" shape as the coach's schedule card,
 * just for the fuller bundle a program represents.
 */
export default function ProgramScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';

  const language = useAppStore((s) => s.language) ?? 'en';
  const profile = useAppStore((s) => s.profile);
  const meals = useAppStore((s) => s.meals);
  const workouts = useAppStore((s) => s.workouts);
  const schedule = useAppStore((s) => s.schedule);
  const customExercises = useAppStore((s) => s.exercises);
  const activeProgram = useAppStore((s) => s.activeProgram);
  const setTargets = useAppStore((s) => s.setTargets);
  const applyCoachScheduleAction = useAppStore((s) => s.applyCoachSchedule);
  const setActiveProgram = useAppStore((s) => s.setActiveProgram);

  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<GeneratedProgram | null>(null);

  const build = async () => {
    setBusy(true);
    try {
      const context = await buildCoachContext(language);
      const result = await generateProgram(language, context);
      useEntitlement.getState().spend();
      setPreview(result);
    } catch (err) {
      if (err instanceof QuotaError || err instanceof FeatureLockedError) {
        useEntitlement.getState().refresh();
        router.push(`/upgrade?reason=${err instanceof QuotaError ? 'quota' : 'coach'}`);
        return;
      }
      Alert.alert(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    if (!preview) return;
    const resolved = resolveCoachSchedule(preview.schedule, customExercises, schedule);
    const commit = () => {
      applyCoachScheduleAction({ newExercises: resolved.newExercises, days: resolved.days });
      setTargets(preview.targets);
      const program: Program = {
        id: newProgramId(),
        createdAt: new Date().toISOString(),
        goal: profile?.goal ?? 'maintain',
        durationWeeks: preview.durationWeeks,
        summary: preview.summary,
        targets: preview.targets,
        schedule: preview.schedule,
      };
      setActiveProgram(program);
      setPreview(null);
      successHaptic();
    };
    if (resolved.overlapWeekdays.length === 0) {
      commit();
      return;
    }
    const days = resolved.overlapWeekdays.map((wd) => weekdayLabel(wd, locale)).join(' · ');
    Alert.alert(
      t('coach.schedulePlan.overwriteTitle'),
      t('coach.schedulePlan.overwriteBody', { days }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('coach.schedulePlan.overwriteCta'), style: 'destructive', onPress: commit },
      ],
    );
  };

  const endProgram = () => {
    Alert.alert(t('program.endConfirmTitle'), t('program.endConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('program.endConfirmCta'), style: 'destructive', onPress: () => setActiveProgram(null) },
    ]);
  };

  // ── Preview: a just-generated program awaiting Accept ──────────────────
  if (preview) {
    return (
      <Screen
        footer={
          <View>
            <Button label={t('program.accept')} icon="checkmark-circle" onPress={accept} />
            <Button
              label={t('program.discard')}
              variant="ghost"
              onPress={() => setPreview(null)}
              style={{ marginTop: Spacing.xs }}
            />
          </View>
        }
      >
        <View style={styles.header}>
          <Title>{t('program.title')}</Title>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </Pressable>
        </View>
        <Card style={{ marginBottom: Spacing.md }}>
          <Text style={{ color: theme.text, fontSize: 15, lineHeight: 21 }}>{preview.summary}</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: Spacing.xs }}>
            {t('program.weeks', { count: preview.durationWeeks })}
          </Text>
        </Card>
        <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.sm }]}>
          {t('program.targets')}
        </Text>
        <View style={styles.macroGrid}>
          <MacroTile label={t('home.calories')} value={preview.targets.calories} target={preview.targets.calories} color={theme.primary} unit={t('common.kcal')} />
          <MacroTile label={t('home.protein')} value={preview.targets.proteinG} target={preview.targets.proteinG} color={theme.protein} unit={t('common.grams')} />
          <MacroTile label={t('home.carbs')} value={preview.targets.carbsG} target={preview.targets.carbsG} color={theme.carbs} unit={t('common.grams')} />
          <MacroTile label={t('home.fat')} value={preview.targets.fatG} target={preview.targets.fatG} color={theme.fat} unit={t('common.grams')} />
        </View>
        <SchedulePlanCard
          plan={preview.schedule}
          locale={locale}
          added={false}
          onAdd={accept}
          style={{ maxWidth: '100%', alignSelf: 'stretch', marginTop: Spacing.md }}
        />
      </Screen>
    );
  }

  // ── Active: an accepted program, with progress against it ──────────────
  if (activeProgram) {
    const startedAt = new Date(activeProgram.createdAt);
    const daysElapsed = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 86400000));
    const totalDays = activeProgram.durationWeeks * 7;
    const daysLeft = Math.max(0, totalDays - daysElapsed);
    const weekNumber = Math.min(activeProgram.durationWeeks, Math.floor(daysElapsed / 7) + 1);
    const todayTotals = totalsForDay(meals, new Date());

    return (
      <Screen>
        <View style={styles.header}>
          <Title>{t('program.title')}</Title>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </Pressable>
        </View>

        <Card style={{ marginBottom: Spacing.md }}>
          <Text style={{ color: theme.text, fontSize: 15, lineHeight: 21 }}>{activeProgram.summary}</Text>
          <View style={styles.progressRow}>
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>
              {t('program.weekProgress', { current: weekNumber, total: activeProgram.durationWeeks })}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {t('program.daysLeft', { count: daysLeft })}
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: theme.border }]}>
            <View
              style={[
                styles.trackFill,
                { backgroundColor: theme.primary, width: `${Math.min(100, (daysElapsed / totalDays) * 100)}%` },
              ]}
            />
          </View>
        </Card>

        <View style={styles.streakRow}>
          <View style={[styles.streakCard, { backgroundColor: theme.card }]}>
            <Ionicons name="flame" size={18} color={theme.primary} />
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>{streakDays(meals)}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{t('program.streak')}</Text>
          </View>
          <View style={[styles.streakCard, { backgroundColor: theme.card }]}>
            <Ionicons name="barbell" size={18} color={theme.primary} />
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>{workoutStreakDays(workouts)}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{t('program.workoutStreak')}</Text>
          </View>
        </View>

        <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.sm }]}>
          {t('program.todayProgress')}
        </Text>
        <View style={styles.macroGrid}>
          <MacroTile label={t('home.calories')} value={todayTotals.calories} target={activeProgram.targets.calories} color={theme.primary} unit={t('common.kcal')} />
          <MacroTile label={t('home.protein')} value={todayTotals.proteinG} target={activeProgram.targets.proteinG} color={theme.protein} unit={t('common.grams')} />
          <MacroTile label={t('home.carbs')} value={todayTotals.carbsG} target={activeProgram.targets.carbsG} color={theme.carbs} unit={t('common.grams')} />
          <MacroTile label={t('home.fat')} value={todayTotals.fatG} target={activeProgram.targets.fatG} color={theme.fat} unit={t('common.grams')} />
        </View>

        <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: Spacing.sm }]}>
          {t('program.schedule')}
        </Text>
        <SchedulePlanCard
          plan={activeProgram.schedule}
          locale={locale}
          added
          onAdd={() => {}}
          style={{ maxWidth: '100%', alignSelf: 'stretch' }}
        />

        <Button
          label={busy ? t('program.building') : t('program.regenerate')}
          variant="secondary"
          icon="refresh"
          loading={busy}
          onPress={build}
          style={{ marginTop: Spacing.md }}
        />
        <Button label={t('program.endProgram')} variant="ghost" onPress={endProgram} style={{ marginTop: Spacing.xs }} />
      </Screen>
    );
  }

  // ── Nothing yet: intro + build CTA ──────────────────────────────────────
  return (
    <Screen
      footer={
        <Button
          label={busy ? t('program.building') : t('program.build')}
          icon="sparkles"
          loading={busy}
          onPress={build}
        />
      }
    >
      <View style={styles.header}>
        <Title>{t('program.title')}</Title>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>
      <Card>
        <Ionicons name="sparkles" size={24} color={theme.primary} style={{ marginBottom: Spacing.sm }} />
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16, marginBottom: 4 }}>
          {t('program.introTitle')}
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
          {t('program.introBody')}
        </Text>
      </Card>
      {isMockMode && (
        <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: Spacing.sm }}>
          {t('scan.mockBadge')}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  track: { height: 6, borderRadius: 3, marginTop: 6, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3 },
  streakRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  streakCard: { flex: 1, alignItems: 'center', borderRadius: 16, paddingVertical: Spacing.sm, gap: 2 },
});
