import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { alertProblem } from '@/lib/alerts';
import { bringCandidates, bringChoices, bringMoves, canBring, weekAfterSwap, type BringCandidate, type BringChoice } from '@/lib/bring-day';
import { useCelebrate } from '@/lib/celebrate';
import { dayExerciseIds } from '@/lib/day-plan';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { dateKey, keyToDate, resolvePlan, revisionOf } from '@/lib/occurrences';
import { usePending } from '@/lib/pending';
import { useAppStore } from '@/lib/store';

type Keep = 'week' | 'update' | 'new';

/** Read once when the sheet opens: the React Compiler's purity rule keeps the clock out of render. */
const now = () => new Date();
const newOpId = () => `op:${Date.now()}`;

/**
 * "Do another day's workout": bring any day of the week to today. Pick a
 * day, answer one question (swap or just replace), and only after a swap,
 * whether to keep it for good. See lib/bring-day.ts for what each answer
 * writes. `date` opens straight on the question for that day (the missed
 * card's Do today).
 */
export function BringDaySheet({ date, onClose }: { date?: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const schedule = useAppStore((s) => s.schedule);
  const occurrences = useAppStore((s) => s.occurrences);
  const workouts = useAppStore((s) => s.workouts);
  const skips = useAppStore((s) => s.skips);
  const scheduleSince = useAppStore((s) => s.scheduleSince);
  const savedSchedules = useAppStore((s) => s.savedSchedules);
  const activeScheduleId = useAppStore((s) => s.activeScheduleId);
  const applyOccurrenceMoves = useAppStore((s) => s.applyOccurrenceMoves);
  const applyWeekChange = useAppStore((s) => s.applyWeekChange);
  const startSession = useAppStore((s) => s.startSession);
  const setLastOp = usePending((s) => s.setLastOccurrenceOp);

  const [today] = useState(now);
  const candidates = bringCandidates(schedule, occurrences, workouts, skips, today, scheduleSince);
  const todayPlan = resolvePlan(schedule, occurrences, today);
  const [src, setSrc] = useState<BringCandidate | null>(() => (date ? (candidates.find((c) => c.date === date && canBring(c)) ?? null) : null));
  const [choice, setChoice] = useState<BringChoice | null>(() => (src ? bringChoices(src, todayPlan)[0] : null));
  const [step, setStep] = useState<'pick' | 'choose' | 'keep'>(src ? 'choose' : 'pick');
  const [keep, setKeep] = useState<Keep>('week');

  const weekday = (key: string, style: 'long' | 'short' = 'long') => keyToDate(key).toLocaleDateString(locale, { weekday: style });
  const nameOf = (c: { plan: BringCandidate['plan'] } | null, key: string) => c?.plan?.day.title || t('bring.workoutOf', { day: weekday(key) });
  const todayKey = dateKey(today);
  const todayName = todayPlan ? todayPlan.day.title || t('bring.workoutOf', { day: weekday(todayKey) }) : '';

  const pick = (c: BringCandidate) => {
    lightHaptic();
    setSrc(c);
    setChoice(bringChoices(c, todayPlan)[0]);
    setStep('choose');
  };

  const finish = (start: boolean) => {
    if (!src?.plan || !choice) return;
    const name = nameOf(src, src.date);
    let occurrenceId: string | undefined;
    if (choice === 'swap' && keep !== 'week') {
      const active = savedSchedules.find((x) => x.id === activeScheduleId);
      const base = active ? active.name || t('schedules.defaultName') : t('today.myPlan');
      const day = today.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
      const newName = t('bring.newName', { name: base, date: day });
      applyWeekChange(weekAfterSwap(schedule, today, src, todayPlan), keep, { name: newName, previous: t('bring.previousName', { date: day }) });
      useCelebrate.getState().celebrate(keep === 'update' ? t('bring.weekUpdated') : t('bring.weekSaved', { name: newName }));
    } else {
      const moves = bringMoves(choice, src, today, todayPlan);
      const expected = Object.fromEntries(moves.map((m) => [m.originalDate, revisionOf(occurrences, m.originalDate)]));
      const opId = newOpId();
      if (!applyOccurrenceMoves(moves, expected, opId)) {
        alertProblem(t('bring.stale'));
        onClose();
        return;
      }
      const label =
        choice === 'swap' ? t('bring.swappedLabel', { name }) : choice === 'move' || src.status === 'missed' ? t('bring.movedLabel', { name }) : t('bring.replacedLabel', { name });
      setLastOp({ opId, label });
      occurrenceId = choice === 'replace' && src.status !== 'missed' ? `occ:${todayKey}` : choice === 'add' ? `occ:${todayKey}` : `occ:${src.plan.originalDate}`;
    }
    successHaptic();
    onClose();
    if (start) {
      const st = useAppStore.getState();
      const ids = dayExerciseIds({ schedule: st.schedule, occurrences: st.occurrences, workouts: st.workouts, skips: st.skips, dayOrder: st.dayOrder, dayExtras: st.dayExtras }, today).ids;
      if (ids.length === 0) return;
      startSession(today, ids, occurrenceId);
      router.push('/session');
    }
  };

  const option = (key: string, title: string, body: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={() => {
        lightHaptic();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}. ${body}`}
      style={[styles.option, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.surfaceTint : theme.card }]}
    >
      <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} size={21} color={theme.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{title}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{body}</Text>
      </View>
    </Pressable>
  );

  let content: React.ReactNode;
  let footer: React.ReactNode;
  if (step === 'pick' || !src?.plan) {
    content = (
      <>
        <Head title={t('bring.pickTitle')} sub={t('bring.pickSub')} onClose={onClose} />
        <ScrollView style={{ maxHeight: 440, marginTop: Spacing.sm }} contentContainerStyle={{ gap: 6 }}>
          {candidates.map((c) => {
            const ok = canBring(c);
            const badge =
              c.status === 'done'
                ? { text: `✓ ${t('bring.done')}`, bg: theme.success + '22', fg: theme.successText }
                : c.status === 'missed'
                  ? { text: t('bring.missed'), bg: theme.warning + '26', fg: theme.warningText }
                  : null;
            const label = c.plan ? nameOf(c, c.date) : t('bring.rest');
            return (
              <Pressable
                key={c.date}
                disabled={!ok}
                onPress={() => pick(c)}
                accessibilityRole="button"
                accessibilityState={{ disabled: !ok }}
                accessibilityLabel={`${weekday(c.date)} ${keyToDate(c.date).getDate()}: ${label}${badge ? ` · ${badge.text}` : ''}`}
                style={({ pressed }) => [styles.dayRow, { backgroundColor: theme.surfaceTint }, pressed && ok && { opacity: 0.7 }]}
              >
                <View style={{ width: 44 }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '800' }}>{weekday(c.date, 'short').toUpperCase()}</Text>
                  <Text style={{ color: theme.textTertiary, fontSize: 11, fontWeight: '600' }}>{keyToDate(c.date).getDate()}</Text>
                </View>
                <Text style={{ flex: 1, color: c.plan ? theme.text : theme.textTertiary, fontWeight: c.plan ? '800' : '600', fontSize: 15 }} numberOfLines={1}>
                  {label}
                </Text>
                {badge && (
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={{ color: badge.fg, fontSize: 11, fontWeight: '800' }}>{badge.text}</Text>
                  </View>
                )}
                {ok && <Icon name="chevron-forward" size={16} color={theme.primary} style={{ transform: [{ scaleX: locale === 'ar' ? -1 : 1 }] }} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </>
    );
    footer = <Button label={t('common.cancel')} variant="ghost" onPress={onClose} />;
  } else if (step === 'choose') {
    const name = nameOf(src, src.date);
    const day = weekday(src.date);
    const choices = bringChoices(src, todayPlan);
    const text: Record<BringChoice, [string, string]> = {
      swap: [t('bring.swap'), todayPlan ? t('bring.swapBody', { name, other: todayName, day }) : t('bring.swapRestBody', { name, day })],
      replace: [t('bring.replace'), src.status === 'missed' ? t('bring.replaceMissedBody', { day, other: todayName }) : t('bring.replaceBody', { other: todayName, day, name })],
      add: [t('bring.add'), t('bring.addBody', { day, name })],
      move: [t('bring.move'), t('bring.moveBody', { day })],
    };
    content = (
      <>
        <Head title={t('bring.title', { name })} sub={todayPlan ? t('bring.askToday', { name: todayName }) : t('bring.askRest')} onClose={onClose} />
        <View style={{ marginTop: Spacing.sm, gap: 8 }}>{choices.map((c) => option(c, text[c][0], text[c][1], choice === c, () => setChoice(c)))}</View>
      </>
    );
    footer =
      choice === 'swap' ? (
        <Button label={t('bring.next')} onPress={() => setStep('keep')} />
      ) : (
        <>
          <Button label={t('bring.start', { name })} icon="play" onPress={() => finish(true)} />
          <Button label={t('bring.later')} variant="ghost" onPress={() => finish(false)} />
        </>
      );
  } else {
    const name = nameOf(src, src.date);
    const active = savedSchedules.find((x) => x.id === activeScheduleId);
    const base = active ? active.name || t('schedules.defaultName') : t('today.myPlan');
    const newName = t('bring.newName', { name: base, date: today.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) });
    content = (
      <>
        <Head
          title={t('bring.keepTitle')}
          sub={t('bring.keepSub', { dayA: weekday(todayKey), nameA: name, dayB: weekday(src.date), nameB: todayPlan ? todayName : t('bring.rest') })}
          onClose={onClose}
        />
        <View style={{ marginTop: Spacing.sm, gap: 8 }}>
          {option('week', t('bring.keepWeek'), t('bring.keepWeekBody'), keep === 'week', () => setKeep('week'))}
          {option('update', t('bring.keepUpdate'), t('bring.keepUpdateBody'), keep === 'update', () => setKeep('update'))}
          {option('new', t('bring.keepNew'), t('bring.keepNewBody', { name: newName }), keep === 'new', () => setKeep('new'))}
        </View>
      </>
    );
    footer = (
      <>
        <Button label={t('bring.start', { name })} icon="play" onPress={() => finish(true)} />
        <Button label={t('bring.later')} variant="ghost" onPress={() => finish(false)} />
      </>
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: insets.bottom + Spacing.md }]} accessibilityViewIsModal>
          <View style={[styles.grab, { backgroundColor: theme.border }]} />
          {content}
          <View style={{ marginTop: Spacing.md, gap: 2 }}>{footer}</View>
        </View>
      </View>
    </Modal>
  );
}

function Head({ title, sub, onClose }: { title: string; sub: string; onClose: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.head}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 20 }} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[Type.caption, { color: theme.textSecondary, marginTop: 2 }]}>{sub}</Text>
      </View>
      <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
        <Icon name="close" size={22} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,16,33,0.45)' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: Spacing.page, paddingTop: 10, ...cardShadow('#000') },
  grab: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: Spacing.sm },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.control, paddingHorizontal: 12, minHeight: 52 },
  badge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1.5, borderRadius: Radius.control, padding: 12 },
});
