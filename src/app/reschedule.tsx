import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { ChangeSummary, Chip, IconTile, InfoLine } from '@/components/system';
import { Button, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { addDays, dateKey, keyToDate, resolvePlan, revisionOf, type OccurrenceMove } from '@/lib/occurrences';
import { usePending } from '@/lib/pending';
import { useAppStore } from '@/lib/store';

/** Today and the next six days. Module-level so the clock is never read during render. */
function upcoming(): Date[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => addDays(today, i));
}
const newOpId = () => `op:${Date.now()}`;

type Resolution = { kind: 'move'; to: string } | { kind: 'skip' } | { kind: 'keep' };

/**
 * S42 Reschedule a workout occurrence — the S14 review pattern: original
 * date → new date, the sessions affected, and any collision on the target
 * resolved explicitly. Selecting and resolving only change the preview.
 * Apply commits every selected move atomically against the revisions this
 * preview was built on; Cancel writes nothing; Undo lives on Training.
 */
export default function Reschedule() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();
  const { date: originalDate = '', to: toParam } = useLocalSearchParams<{ date?: string; to?: string }>();

  const schedule = useAppStore((s) => s.schedule);
  const occurrences = useAppStore((s) => s.occurrences);
  const skips = useAppStore((s) => s.skips);
  const activeSession = useAppStore((s) => s.activeSession);
  const applyOccurrenceMoves = useAppStore((s) => s.applyOccurrenceMoves);
  const startSession = useAppStore((s) => s.startSession);
  const setLastOp = usePending((s) => s.setLastOccurrenceOp);

  const [days] = useState(upcoming);
  const todayKey = dateKey(days[0]);
  const [to, setTo] = useState<string>(toParam && days.some((d) => dateKey(d) === toParam) ? toParam : todayKey);
  const [resolution, setResolution] = useState<Resolution>({ kind: 'keep' });
  // The state this preview was built against (version guard).
  const [scheduleAtOpen] = useState(() => JSON.stringify(schedule));
  const [revisionsAtOpen] = useState(() => ({ ...Object.fromEntries(Object.entries(occurrences).map(([k, v]) => [k, v.revision])) }));

  const original = originalDate ? keyToDate(originalDate) : null;
  const moving = original ? resolvePlan(schedule, occurrences, original) : null;
  if (!original || !moving) {
    return (
      <Screen header={<PageHeader title={t('reschedule.title')} variant="plain" />}>
        <InfoLine>{t('reschedule.gone')}</InfoLine>
      </Screen>
    );
  }

  const long = (key: string) => keyToDate(key).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' });
  const name = moving.day.title || t('training.todaysWorkout');
  const movingIds = moving.day.exerciseIds.filter((id) => !(skips[originalDate] ?? []).includes(id));

  // What already sits on the target date — the collision to resolve.
  const target = to !== originalDate ? resolvePlan(schedule, occurrences, keyToDate(to)) : null;
  const collision = target && target.originalDate !== moving.originalDate ? target : null;
  const collisionName = collision ? collision.day.title || t('training.todaysWorkout') : '';
  const collisionDates = days.filter((d) => dateKey(d) !== to && dateKey(d) !== originalDate);

  const moves: OccurrenceMove[] = [{ originalDate: moving.originalDate, weekday: moving.weekday, to }];
  if (collision && resolution.kind === 'move') moves.push({ originalDate: collision.originalDate, weekday: collision.weekday, to: resolution.to });
  if (collision && resolution.kind === 'skip') moves.push({ originalDate: collision.originalDate, weekday: collision.weekday, to: null });

  // One stacked block per affected workout: name, original date, then the
  // new date or outcome — separate lines, so an Arabic title and an English
  // date never share (and fight over) one row.
  const affected = [
    {
      key: 'moving',
      title: name,
      from: { label: t('reschedule.fromLabel'), value: long(moving.originalDate) },
      to: { label: t('reschedule.toLabel'), value: to === originalDate ? t('reschedule.unchanged') : long(to) },
      emphasis: true,
    },
    ...(collision
      ? [
          {
            key: 'collision',
            title: collisionName,
            from: { label: t('reschedule.fromLabel'), value: long(collision.originalDate) },
            to:
              resolution.kind === 'move'
                ? { label: t('reschedule.toLabel'), value: long(resolution.to) }
                : { label: t('reschedule.outcomeLabel'), value: resolution.kind === 'skip' ? t('reschedule.skip') : t('reschedule.keepBoth') },
          },
        ]
      : []),
  ];

  const stale = () =>
    JSON.stringify(useAppStore.getState().schedule) !== scheduleAtOpen ||
    moves.some((m) => revisionOf(useAppStore.getState().occurrences, m.originalDate) !== (revisionsAtOpen[m.originalDate] ?? 0)) ||
    !!useAppStore.getState().activeSession;

  const apply = (andStart: boolean) => {
    if (to === originalDate) {
      router.back();
      return;
    }
    if (stale()) {
      Alert.alert(t('reschedule.staleTitle'), t('reschedule.staleBody'), [{ text: t('common.close'), onPress: () => router.back() }]);
      return;
    }
    const opId = newOpId();
    const expected = Object.fromEntries(moves.map((m) => [m.originalDate, revisionsAtOpen[m.originalDate] ?? 0]));
    const ok = applyOccurrenceMoves(moves, expected, opId);
    if (!ok) {
      Alert.alert(t('reschedule.staleTitle'), t('reschedule.staleBody'), [{ text: t('common.close'), onPress: () => router.back() }]);
      return;
    }
    successHaptic();
    setLastOp({ opId, label: t('reschedule.movedLabel', { name, date: long(to) }) });
    if (andStart) {
      startSession(keyToDate(to), movingIds, `occ:${moving.originalDate}`);
      router.replace('/session');
      return;
    }
    router.back();
  };

  const canStart = to === todayKey && !activeSession;
  const unresolved = !!collision && resolution.kind === 'keep';

  return (
    <Screen
      header={<PageHeader title={t('reschedule.title')} variant="plain" />}
      footer={
        <View style={{ gap: Spacing.xs }}>
          <Button label={canStart ? t('reschedule.applyStart') : t('planMeal.applyChange')} icon={canStart ? 'play' : undefined} onPress={() => apply(canStart)} />
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {canStart && <Button label={t('planMeal.applyChange')} variant="secondary" onPress={() => apply(false)} style={{ flex: 1 }} />}
            <Button label={t('common.cancel')} variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
          </View>
        </View>
      }
    >
      <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 20 }}>{name}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 2 }}>{t('training.exerciseCount', { count: movingIds.length })}</Text>

        <Text style={{ color: theme.text, fontWeight: '700', marginTop: Spacing.md, marginBottom: 6 }}>
          {t('planMeal.before')} <Text style={{ color: theme.textSecondary, fontWeight: '500' }}>{t('reschedule.originalDate')}</Text>
        </Text>
        <View style={[styles.dish, { backgroundColor: theme.surfaceTint }]}>
          <IconTile icon="calendar-outline" size={48} />
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15, flex: 1 }}>{long(moving.originalDate)}</Text>
        </View>
        <View style={{ alignItems: 'center', marginVertical: 4 }}>
          <Ionicons name="arrow-down" size={18} color={theme.primary} />
        </View>
        <Text style={{ color: theme.text, fontWeight: '700', marginBottom: 6 }}>
          {t('planMeal.after')} <Text style={{ color: theme.textSecondary, fontWeight: '500' }}>{t('reschedule.newDate')}</Text>
        </Text>
        <View style={[styles.dish, { backgroundColor: theme.surfaceTint, borderWidth: 1, borderColor: theme.primary }]}>
          <IconTile icon="calendar" size={48} />
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15, flex: 1 }}>{to === originalDate ? t('reschedule.unchanged') : long(to)}</Text>
        </View>
        <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.ms, marginBottom: 6 }]}>{t('planMeal.day')}</Text>
        <View style={styles.chips}>
          {days.map((d, i) => (
            <Chip
              key={dateKey(d)}
              label={i === 0 ? t('home.today') : d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
              selected={dateKey(d) === to}
              onPress={() => {
                lightHaptic();
                setTo(dateKey(d));
                setResolution({ kind: 'keep' });
              }}
            />
          ))}
        </View>
      </View>

      <ChangeSummary items={affected} note={unresolved ? t('reschedule.keepBothNote') : t('reschedule.thisOccurrenceOnly')} />

      {collision && (
        <View style={[styles.card, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.warningText }, cardShadow(theme.shadow)]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Ionicons name="alert-circle-outline" size={20} color={theme.warningText} />
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, flex: 1 }}>{t('reschedule.collisionTitle', { date: long(to), name: collisionName })}</Text>
          </View>
          <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 4, marginBottom: Spacing.sm }}>{t('reschedule.collisionBody')}</Text>
          <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6 }]}>{t('reschedule.moveOther', { name: collisionName })}</Text>
          <View style={styles.chips}>
            {collisionDates.map((d) => (
              <Chip
                key={dateKey(d)}
                label={d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
                selected={resolution.kind === 'move' && resolution.to === dateKey(d)}
                onPress={() => {
                  lightHaptic();
                  setResolution({ kind: 'move', to: dateKey(d) });
                }}
              />
            ))}
          </View>
          <View style={[styles.chips, { marginTop: Spacing.sm }]}>
            <Chip label={t('reschedule.skipOther', { name: collisionName })} icon="close-circle-outline" selected={resolution.kind === 'skip'} onPress={() => setResolution({ kind: 'skip' })} />
            <Chip label={t('reschedule.keepBoth')} icon="layers-outline" selected={resolution.kind === 'keep'} onPress={() => setResolution({ kind: 'keep' })} />
          </View>
        </View>
      )}

      <InfoLine>{t('reschedule.performedNote')}</InfoLine>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dish: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.control, padding: Spacing.ms },
});
