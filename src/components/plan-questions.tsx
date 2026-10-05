import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Field } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ALLERGEN_IDS } from '@/lib/allergens';
import { selectionHaptic } from '@/lib/feedback';
import { includesFood, includesTraining, toggleWeekday, withDayCount } from '@/lib/plan-answers';
import type { PlanAnswers } from '@/lib/types';

type Props = { answers: PlanAnswers; onChange: (next: PlanAnswers) => void };

/**
 * The questions asked before a program is built, one group per step — and
 * all of them together on Plan preferences. Big chips, nothing to type
 * unless you want to. Allergies are orange so they read as different from
 * a taste.
 */

function Choice({
  label,
  selected,
  onPress,
  tone,
  square,
  sub,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  tone?: 'warn';
  square?: boolean;
  sub?: string;
}) {
  const theme = useTheme();
  const warn = tone === 'warn';
  const bg = selected ? (warn ? theme.surfaceTint : theme.primary) : theme.card;
  const border = selected ? (warn ? theme.warning : theme.primary) : theme.border;
  const ink = selected ? (warn ? theme.warningText : theme.onPrimary) : theme.text;
  return (
    <Pressable
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      accessibilityRole={warn ? 'checkbox' : 'button'}
      accessibilityState={warn ? { checked: selected } : { selected }}
      // The web build reads ARIA, not accessibilityState, for a checkbox.
      aria-checked={warn ? selected : undefined}
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      style={({ pressed }) => [
        styles.choice,
        square && styles.square,
        { backgroundColor: bg, borderColor: border },
        warn && selected && { backgroundColor: 'rgba(232,149,74,0.16)' },
        pressed && { opacity: 0.85 },
      ]}
    >
      {warn && selected && <Icon name="alert-circle" size={14} color={theme.warningText} />}
      <View style={square ? { alignItems: 'center' } : undefined}>
        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit={square} style={{ color: ink, fontWeight: '700', fontSize: square ? 13 : 14 }}>
          {label}
        </Text>
        {sub ? <Text maxFontSizeMultiplier={1.3} style={{ color: selected ? ink : theme.textSecondary, fontSize: 12, marginTop: 1 }}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

function Label({ children, first }: { children: string; first?: boolean }) {
  const theme = useTheme();
  return <Text style={[Type.caption, { color: theme.textSecondary, marginTop: first ? 0 : Spacing.md, marginBottom: Spacing.xs }]}>{children}</Text>;
}

function Row({ children, nowrap }: { children: React.ReactNode; nowrap?: boolean }) {
  return <View style={[styles.row, nowrap && { flexWrap: 'nowrap' }]}>{children}</View>;
}

/** Step 1: what the program should plan. */
export function ScopeQuestion({ answers, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const options: { id: PlanAnswers['scope']; icon: 'barbell-outline' | 'restaurant-outline' | 'sparkles-outline' }[] = [
    { id: 'training', icon: 'barbell-outline' },
    { id: 'food', icon: 'restaurant-outline' },
    { id: 'both', icon: 'sparkles-outline' },
  ];
  return (
    <View style={{ gap: Spacing.sm }}>
      {options.map((o) => {
        const on = answers.scope === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => {
              selectionHaptic();
              onChange({ ...answers, scope: o.id });
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={({ pressed }) => [
              styles.bigOption,
              { backgroundColor: theme.card, borderColor: on ? theme.primary : theme.border },
              cardShadow(theme.shadow),
              pressed && { opacity: 0.9 },
            ]}
          >
            <View style={[styles.bigIcon, { backgroundColor: on ? theme.primary : theme.surfaceTint }]}>
              <Icon name={o.icon} size={22} color={on ? theme.onPrimary : theme.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{t(`planQ.scope.${o.id}`)}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>{t(`planQ.scope.${o.id}Body`)}</Text>
            </View>
            <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? theme.primary : theme.textTertiary} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Step 2: the training week. */
export function TrainingQuestions({ answers, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const chosen = answers.weekdays ?? [];
  const short = (d: number) => new Date(2024, 0, 7 + d).toLocaleDateString(locale, { weekday: locale === 'ar' ? 'long' : 'short' }).replace(/^ال/, '');
  return (
    <View>
      <Label first>{t('planQ.howManyDays')}</Label>
      <Row nowrap>
        {[2, 3, 4, 5, 6].map((n) => (
          <Choice key={n} square label={String(n)} selected={chosen.length === n} onPress={() => onChange(withDayCount(answers, n))} />
        ))}
      </Row>
      <Label>{t('planQ.whichDays')}</Label>
      <Row nowrap>
        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
          <Choice key={d} square label={short(d)} selected={chosen.includes(d)} onPress={() => onChange(toggleWeekday(answers, d))} />
        ))}
      </Row>
      <Label>{t('planQ.sessionLength')}</Label>
      <Row>
        {[30, 45, 60, 90].map((m) => (
          <Choice key={m} label={t('planQ.minutes', { n: m })} selected={answers.sessionMinutes === m} onPress={() => onChange({ ...answers, sessionMinutes: m })} />
        ))}
      </Row>
      <Label>{t('planQ.where')}</Label>
      <Row>
        {(['gym', 'home', 'both'] as const).map((p) => (
          <Choice key={p} label={t(`planQ.place.${p}`)} selected={answers.place === p} onPress={() => onChange({ ...answers, place: p })} />
        ))}
      </Row>
      <Label>{t('planQ.experience')}</Label>
      <Row>
        {(['beginner', 'intermediate', 'advanced'] as const).map((x) => (
          <Choice key={x} label={t(`planQ.level.${x}`)} selected={answers.experience === x} onPress={() => onChange({ ...answers, experience: x })} />
        ))}
      </Row>
      <View style={{ height: Spacing.md }} />
      <Field
        label={t('planQ.injuries')}
        placeholder={t('planQ.injuriesHint')}
        value={answers.injuries ?? ''}
        onChangeText={(v) => onChange({ ...answers, injuries: v.slice(0, 200) || undefined })}
        maxLength={200}
      />
    </View>
  );
}

/** Step 3: how you eat — allergies saved to your profile. */
export function FoodQuestions({ answers, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const allergies = answers.allergies ?? [];
  const toggle = (id: string) =>
    onChange({ ...answers, allergies: allergies.includes(id) ? allergies.filter((a) => a !== id) : [...allergies, id] });
  return (
    <View>
      <Label first>{t('planQ.mealsPerDay')}</Label>
      <Row>
        {(['2', '3', '3+snack'] as const).map((m) => (
          <Choice key={m} label={t(`planQ.meals.${m === '3+snack' ? 'snack' : m}`)} selected={answers.mealsPerDay === m} onPress={() => onChange({ ...answers, mealsPerDay: m })} />
        ))}
      </Row>
      <Label>{t('planQ.eatingStyle')}</Label>
      <Row>
        {(['any', 'high_protein', 'vegetarian', 'low_carb'] as const).map((x) => (
          <Choice key={x} label={t(`planQ.style.${x}`)} selected={answers.eatingStyle === x} onPress={() => onChange({ ...answers, eatingStyle: x })} />
        ))}
      </Row>
      <Label>{t('planQ.allergies')}</Label>
      <Row>
        {ALLERGEN_IDS.map((a) => (
          <Choice key={a} tone="warn" label={t(`allergy.${a}`)} selected={allergies.includes(a)} onPress={() => toggle(a)} />
        ))}
      </Row>
      <View style={{ height: Spacing.sm }} />
      <Field
        label={t('planQ.allergyOther')}
        placeholder={t('planQ.allergyOtherHint')}
        value={answers.allergyOther ?? ''}
        onChangeText={(v) => onChange({ ...answers, allergyOther: v.slice(0, 120) || undefined })}
        maxLength={120}
      />
      <View style={[styles.note, { backgroundColor: theme.surfaceTint }]}>
        <Icon name="shield-checkmark-outline" size={16} color={theme.primaryDark} />
        <Text style={{ color: theme.text, fontSize: 13, flex: 1, lineHeight: 18 }}>{t('planQ.allergySaved')}</Text>
      </View>
      <Field
        label={t('planQ.dislikes')}
        placeholder={t('planQ.dislikesHint')}
        value={answers.dislikes ?? ''}
        onChangeText={(v) => onChange({ ...answers, dislikes: v.slice(0, 200) || undefined })}
        maxLength={200}
      />
      <Label first>{t('planQ.mostly')}</Label>
      <Row>
        {(['home', 'out', 'mix'] as const).map((x) => (
          <Choice key={x} label={t(`planQ.cooking.${x}`)} selected={answers.cooking === x} onPress={() => onChange({ ...answers, cooking: x })} />
        ))}
      </Row>
    </View>
  );
}

/** Step 4: the goal and how fast. */
export function GoalQuestions({ answers, onChange }: Props) {
  const { t } = useTranslation();
  const goal = answers.goal ?? 'maintain';
  return (
    <View>
      <Label first>{t('planQ.goal')}</Label>
      <Row nowrap>
        {(['lose', 'maintain', 'gain'] as const).map((g) => (
          <View key={g} style={{ flex: 1 }}>
            <Choice square label={t(`planQ.goals.${g}`)} selected={goal === g} onPress={() => onChange({ ...answers, goal: g })} />
          </View>
        ))}
      </Row>
      {goal !== 'maintain' && (
        <>
          <Label>{t('planQ.pace')}</Label>
          <View style={{ gap: Spacing.xs }}>
            {(['gentle', 'steady', 'faster'] as const).map((p) => (
              <Choice
                key={p}
                label={t(`planQ.paces.${p}`) + (p === 'steady' ? ` · ${t('planQ.recommended')}` : '')}
                sub={t(`planQ.paceKg.${goal}_${p}`)}
                selected={(answers.pace ?? 'steady') === p}
                onPress={() => onChange({ ...answers, pace: p })}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

/** Step 5 (and Plan preferences): what will be used, one line per area, each editable. */
export function AnswersSummary({ answers, onEdit }: { answers: PlanAnswers; onEdit?: (step: 'scope' | 'training' | 'food' | 'goal') => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const lines = answerLines(answers, t, locale);
  return (
    <View style={[styles.summary, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
      {lines.map((l, i) => (
        <Pressable
          key={l.step}
          disabled={!onEdit}
          onPress={() => onEdit?.(l.step)}
          accessibilityRole={onEdit ? 'button' : undefined}
          accessibilityLabel={onEdit ? `${l.title}: ${l.body}. ${t('common.edit')}` : undefined}
          style={[styles.summaryRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
        >
          <Icon name={l.icon} size={18} color={l.warn ? theme.warning : theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700' }}>{l.title}</Text>
            <Text style={{ color: l.warn ? theme.warningText : theme.text, fontSize: 14, marginTop: 2, lineHeight: 19 }}>{l.body}</Text>
          </View>
          {onEdit && <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>{t('common.edit')}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

type Line = { step: 'scope' | 'training' | 'food' | 'goal'; icon: 'apps-outline' | 'barbell-outline' | 'restaurant-outline' | 'alert-circle-outline' | 'flag-outline'; title: string; body: string; warn?: boolean };

/** The answers in words — for the review step and Plan preferences. */
export function answerLines(a: PlanAnswers, t: (k: string, o?: Record<string, unknown>) => string, locale: string): Line[] {
  const lines: Line[] = [{ step: 'scope', icon: 'apps-outline', title: t('planQ.summary.plan'), body: t(`planQ.scope.${a.scope}`) }];
  if (includesTraining(a)) {
    const days = (a.weekdays ?? []).map((d) => new Date(2024, 0, 7 + d).toLocaleDateString(locale, { weekday: 'short' })).join(' · ');
    const bits = [
      t('planQ.summary.daysCount', { count: a.weekdays?.length ?? a.days ?? 0 }) + (days ? ` (${days})` : ''),
      a.sessionMinutes ? t('planQ.minutes', { n: a.sessionMinutes }) : '',
      a.place ? t(`planQ.place.${a.place}`) : '',
      a.experience ? t(`planQ.level.${a.experience}`) : '',
    ].filter(Boolean);
    lines.push({ step: 'training', icon: 'barbell-outline', title: t('planQ.summary.training'), body: bits.join(' · ') + (a.injuries ? `\n${t('planQ.summary.injuries', { text: a.injuries })}` : '') });
  }
  if (includesFood(a)) {
    const bits = [
      a.mealsPerDay ? t(`planQ.meals.${a.mealsPerDay === '3+snack' ? 'snack' : a.mealsPerDay}`) : '',
      a.eatingStyle && a.eatingStyle !== 'any' ? t(`planQ.style.${a.eatingStyle}`) : '',
      a.cooking ? t(`planQ.cooking.${a.cooking}`) : '',
    ].filter(Boolean);
    lines.push({ step: 'food', icon: 'restaurant-outline', title: t('planQ.summary.food'), body: (bits.join(' · ') || t('planQ.style.any')) + (a.dislikes ? `\n${t('planQ.summary.dislikes', { text: a.dislikes })}` : '') });
  }
  const allergies = [...(a.allergies ?? []).map((x) => t(`allergy.${x}`)), ...(a.allergyOther ? [a.allergyOther] : [])];
  lines.push({
    step: 'food',
    icon: 'alert-circle-outline',
    title: t('planQ.summary.allergies'),
    body: allergies.length > 0 ? allergies.join(' · ') : t('planQ.summary.none'),
    warn: allergies.length > 0,
  });
  if (a.goal) {
    lines.push({
      step: 'goal',
      icon: 'flag-outline',
      title: t('planQ.summary.goal'),
      body: t(`planQ.goals.${a.goal}`) + (a.goal !== 'maintain' && a.pace ? ` · ${t(`planQ.paces.${a.pace}`)} (${t(`planQ.paceKg.${a.goal}_${a.pace}`)})` : ''),
    });
  }
  return lines;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  square: { flex: 1, borderRadius: Radius.md, paddingHorizontal: 2, justifyContent: 'center' },
  bigOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5 },
  bigIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', gap: 8, padding: Spacing.sm, borderRadius: Radius.md, marginBottom: Spacing.md, alignItems: 'flex-start' },
  summary: { borderRadius: Radius.lg, paddingHorizontal: Spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 2 },
});
