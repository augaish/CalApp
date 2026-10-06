import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { alertDestructive } from '@/lib/alerts';
import { noteFor, previousNotes, type NoteEntry } from '@/lib/exercise-notes';
import { successHaptic } from '@/lib/feedback';
import { NOTE_MAX, useAppStore } from '@/lib/store';

interface Props {
  exerciseId: string;
  exerciseName: string;
  /** The workout day (store dateKey) and when it is, for a new note. */
  dayKey: string;
  at: string;
}

function dateLabel(entry: Pick<NoteEntry, 'at' | 'setNo'>, locale: string, setWord: (n: number) => string): string {
  const d = new Date(entry.at).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  return entry.setNo ? `${d} · ${setWord(entry.setNo)}` : d;
}

/**
 * Exercise notes on the workout screen: the last note from an earlier
 * workout, and today's. Notes belong to the exercise (by id), so "Keep
 * elbows close" written on Monday is here the next time it comes up, in any
 * routine. Writing one never touches sets, the rest timer or the workout.
 * Notes stay on the phone and in the person's own backup; they are never
 * sent to the AI.
 */
export function ExerciseNotesCard(props: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const notes = useAppStore((s) => s.exerciseNotes);
  const workouts = useAppStore((s) => s.workouts);
  const [open, setOpen] = useState(false);

  const previous = useMemo(() => previousNotes(notes, workouts, props.exerciseId, props.dayKey), [notes, workouts, props.exerciseId, props.dayKey]);
  const today = noteFor(notes, props.exerciseId, props.dayKey);
  const latest = previous[0];
  const setWord = (n: number) => t('notes.setN', { n });

  return (
    <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
      <View style={styles.head}>
        <Icon name="create-outline" size={17} color={theme.primary} />
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15, flex: 1 }}>{t('notes.title')}</Text>
        {previous.length > 0 && (
          <Pressable onPress={() => setOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${t('notes.history')} · ${t('notes.title')}`}>
            <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }}>{t('notes.history')}</Text>
          </Pressable>
        )}
      </View>

      {latest ? (
        <View style={[styles.prev, { backgroundColor: theme.surfaceTint }]}>
          <Text style={[Type.eyebrow, { color: theme.textSecondary }]}>{`${t('notes.previous')} · ${dateLabel(latest, locale, setWord)}`}</Text>
          <Text style={{ color: theme.text, fontSize: 14, lineHeight: 20, marginTop: 2 }} numberOfLines={3}>
            {latest.text}
          </Text>
        </View>
      ) : (
        !today && <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: Spacing.xs }}>{t('notes.firstTime')}</Text>
      )}

      {today ? (
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${t('notes.today')}: ${today.text}. ${t('common.edit')}`} style={styles.today}>
          <View style={{ flex: 1 }}>
            <Text style={[Type.eyebrow, { color: theme.textSecondary }]}>{t('notes.today')}</Text>
            <Text style={{ color: theme.text, fontSize: 14, lineHeight: 20, marginTop: 2 }} numberOfLines={3}>
              {today.text}
            </Text>
            <View style={styles.saved}>
              <Icon name="checkmark-circle" size={13} color={theme.successText} />
              <Text style={{ color: theme.successText, fontSize: 12, fontWeight: '600' }}>{t('notes.savedOnDevice')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }}>{t('common.edit')}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={({ pressed }) => [styles.add, pressed && { opacity: 0.7 }]}>
          <Icon name="add" size={17} color={theme.primary} />
          <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 14 }}>{t('notes.add')}</Text>
        </Pressable>
      )}

      {open && <NotesSheet {...props} previous={previous} current={today?.text ?? ''} onClose={() => setOpen(false)} />}
    </View>
  );
}

/**
 * The editor, as a sheet over the workout: earlier notes (dated, newest
 * first) and today's note. Its typing state lives here, so the workout
 * screen and its rest countdown don't redraw on every key.
 */
function NotesSheet({
  exerciseId,
  exerciseName,
  dayKey,
  at,
  previous,
  current,
  onClose,
}: Props & { previous: NoteEntry[]; current: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const saveExerciseNote = useAppStore((s) => s.saveExerciseNote);
  const [text, setText] = useState(current);
  const changed = text.trim() !== current.trim();
  const atLimit = text.length >= NOTE_MAX;

  const close = () => {
    if (!changed) return onClose();
    alertDestructive(t('notes.discardTitle'), undefined, [
      { text: t('notes.keepEditing'), style: 'cancel' },
      { text: t('notes.discard'), style: 'destructive', onPress: onClose },
    ]);
  };
  const save = () => {
    saveExerciseNote({ exerciseId, exerciseName, dayKey, at, text });
    successHaptic();
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Pressable style={styles.backdrop} onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: insets.bottom + Spacing.md }]} accessibilityViewIsModal>
          <View style={[styles.grab, { backgroundColor: theme.border }]} />
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 20 }} accessibilityRole="header">
                {t('notes.title')}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>{`${exerciseName} · ${t('notes.private')}`}</Text>
            </View>
            <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Icon name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>

          <Text style={[Type.eyebrow, { color: theme.textSecondary, marginTop: Spacing.md }]}>{t('notes.previousNotes')}</Text>
          {previous.length === 0 ? (
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 6 }}>{t('notes.noPrevious')}</Text>
          ) : (
            <ScrollView style={{ maxHeight: 220, marginTop: 6 }} contentContainerStyle={{ gap: 8 }}>
              {previous.map((p) => (
                <View key={p.key} style={[styles.prev, { backgroundColor: theme.surfaceTint, marginTop: 0 }]}>
                  <Text style={[Type.eyebrow, { color: theme.textSecondary }]}>{dateLabel(p, locale, (n) => t('notes.setN', { n }))}</Text>
                  <Text style={{ color: theme.text, fontSize: 14, lineHeight: 20, marginTop: 2 }}>{p.text}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          <Text style={[Type.eyebrow, { color: theme.textSecondary, marginTop: Spacing.md }]}>{t('notes.todaysNote')}</Text>
          <TextInput
            value={text}
            onChangeText={(v) => setText(v.slice(0, NOTE_MAX))}
            placeholder={t('notes.placeholder')}
            placeholderTextColor={theme.textTertiary}
            multiline
            maxLength={NOTE_MAX}
            accessibilityLabel={t('notes.todaysNote')}
            style={[styles.input, { color: theme.text, borderColor: theme.primary, backgroundColor: theme.background }]}
          />
          <Text style={{ color: atLimit ? theme.warningText : theme.textTertiary, fontSize: 12, textAlign: 'right', marginTop: 4 }}>
            {atLimit ? t('notes.limit', { max: NOTE_MAX.toLocaleString(locale) }) : `${text.length.toLocaleString(locale)} / ${NOTE_MAX.toLocaleString(locale)}`}
          </Text>

          <Button label={t('notes.save')} onPress={save} disabled={!changed} style={{ marginTop: Spacing.sm }} />
          <Button label={t('common.cancel')} variant="ghost" onPress={close} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.module, padding: Spacing.ms, marginTop: Spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prev: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, marginTop: Spacing.sm },
  today: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: Spacing.sm },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm, minHeight: 44 },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,16,33,0.45)' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: Spacing.page, paddingTop: 10, ...cardShadow('#000') },
  grab: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: Spacing.sm },
  input: { borderWidth: 1.5, borderRadius: 14, padding: 12, minHeight: 96, maxHeight: 180, fontSize: 15, lineHeight: 21, textAlignVertical: 'top', marginTop: 6 },
});
