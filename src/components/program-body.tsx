import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { MealPlanCard } from '@/components/meal-plan-card';
import { SchedulePlanCard } from '@/components/schedule-plan-card';
import { Card } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { GeneratedProgram } from '@/lib/types';

/** A program's contents: summary, targets, week and meals — shared by the draft and tailoring. */
export function ProgramBody({ program, scope, locale }: { program: GeneratedProgram; scope: 'training' | 'food' | 'both'; locale: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <>
      <Card style={{ marginBottom: Spacing.md }}>
        <Text style={{ color: theme.text, fontSize: 15, lineHeight: 21 }}>{program.summary}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: Spacing.xs }}>{t('program.weeks', { count: program.durationWeeks })}</Text>
      </Card>
      {scope !== 'training' && (
        <>
          <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.sm }]}>{t('program.targets')}</Text>
          <View style={styles.macroGrid}>
            <TargetTile label={t('home.calories')} value={program.targets.calories} unit={t('common.kcal')} color={theme.primary} />
            <TargetTile label={t('home.protein')} value={program.targets.proteinG} unit={t('common.grams')} color={theme.protein} />
            <TargetTile label={t('home.carbs')} value={program.targets.carbsG} unit={t('common.grams')} color={theme.carbs} />
            <TargetTile label={t('home.fat')} value={program.targets.fatG} unit={t('common.grams')} color={theme.fat} />
          </View>
        </>
      )}
      {program.schedule && (
        <View style={{ marginTop: Spacing.md }}>
          <WeekStrip program={program} locale={locale} />
          <SchedulePlanCard plan={program.schedule} locale={locale} added onAdd={() => {}} hideAction style={{ maxWidth: '100%', alignSelf: 'stretch', marginTop: Spacing.sm }} />
        </View>
      )}
      {program.mealPlan && (
        <>
          <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: Spacing.sm }]}>{t('program.mealPlan')}</Text>
          <MealPlanCard plan={program.mealPlan} schedule={program.schedule} locale={locale} />
        </>
      )}
    </>
  );
}

/** One daily target, as a number — a draft has nothing eaten to track against. */
function TargetTile({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.target, { backgroundColor: theme.card }, cardShadow(theme.shadow)]} accessible accessibilityLabel={`${label} ${value} ${unit}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text numberOfLines={1} style={[Type.caption, { color: theme.textSecondary, flexShrink: 1 }]}>{label}</Text>
      </View>
      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, marginTop: 4 }}>
        {value}
        <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: '600' }}> {unit}</Text>
      </Text>
    </View>
  );
}

/** Seven days at a glance: which train, which rest. */
function WeekStrip({ program, locale }: { program: GeneratedProgram; locale: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.week} accessible accessibilityLabel={(program.schedule?.days ?? []).map((d) => new Date(2024, 0, 7 + d.weekday).toLocaleDateString(locale, { weekday: 'long' }) + (d.title ? ` — ${d.title}` : '')).join(', ')}>
      {[0, 1, 2, 3, 4, 5, 6].map((wd) => {
        const day = program.schedule?.days.find((d) => d.weekday === wd);
        return (
          <View key={wd} style={[styles.weekDay, { backgroundColor: day ? theme.primary : theme.card, borderColor: day ? theme.primary : theme.border }]}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: day ? theme.onPrimary : theme.textSecondary, fontWeight: '800', fontSize: 12 }}>
              {new Date(2024, 0, 7 + wd).toLocaleDateString(locale, { weekday: 'short' })}
            </Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: day ? theme.onPrimary : theme.textTertiary, fontSize: 10, marginTop: 2 }}>
              {day ? day.title || t('program.train') : t('today.restDay')}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  target: { flexGrow: 1, flexBasis: '22%', minWidth: 74, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  week: { flexDirection: 'row', gap: 5 },
  weekDay: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 2 },
});
