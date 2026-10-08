import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TFunction } from 'i18next';

import { Icon } from '@/components/icon';
import { Chip } from '@/components/system';
import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { alertDestructive } from '@/lib/alerts';
import { SETUP_INPUTS, SETUP_SUGGESTIONS, cleanFields, currentSetup, sameFields, setupSince, type SetupKind } from '@/lib/exercise-setup';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { useAppStore } from '@/lib/store';
import type { SetupField } from '@/lib/types';

/** A setting's name in the app's language, or the person's own for 'other'. */
export function setupFieldName(f: SetupField, t: TFunction): string {
  return f.key === 'other' ? (f.label ?? '') : t(`setup.field.${f.key}`);
}

/** A setting's value as shown: a choice in the app's language, anything else as typed. */
export function setupFieldValue(f: SetupField, t: TFunction): string {
  return SETUP_INPUTS[f.key]?.input === 'choice' ? t(`setup.choice.${f.value}`) : f.value;
}

/** "Seat 4 · Back pad 2 · Handle V-bar". */
export function setupSummary(fields: SetupField[], t: TFunction): string {
  return fields.map((f) => `${setupFieldName(f, t)} ${setupFieldValue(f, t)}`).join(' · ');
}

interface Props {
  exerciseId: string;
  exerciseName: string;
  /** The equipment kind, when the exercise has one; decides the "Add my setup" line up top. */
  kind: SetupKind | null;
}

/**
 * "My setup" on the workout screen, right under the exercise name: the
 * saved settings (Seat 4 · Back pad 2), or for a machine with none yet a
 * quiet dashed "Add my setup". Exercises with nothing to set show nothing
 * here; they get a link further down (SetupAddLink). Editing never touches
 * sets or the rest timer.
 */
export function ExerciseSetupCard(props: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const versions = useAppStore((s) => s.exerciseSetups[props.exerciseId]);
  const [open, setOpen] = useState(false);
  const setup = currentSetup(versions);
  if (!setup && !props.kind) return null;

  const sheet = open && <SetupSheet {...props} current={setup?.fields ?? []} onClose={() => setOpen(false)} />;

  if (!setup) {
    return (
      <>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${t('setup.add')}. ${t('setup.addHint')}`}
          style={({ pressed }) => [styles.addRow, { borderColor: theme.primary + '66' }, pressed && { opacity: 0.7 }]}
        >
          <Icon name="add-circle-outline" size={20} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: theme.primaryDark,
                fontWeight: '800',
                fontSize: 14,
              }}
            >
              {t('setup.add')}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{t('setup.addHint')}</Text>
          </View>
        </Pressable>
        {sheet}
      </>
    );
  }

  const since = setupSince(versions)!;
  const sinceToday = new Date(since).toDateString() === new Date().toDateString();
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('setup.a11yCard', {
          fields: setupSummary(setup.fields, t),
        })}
        style={({ pressed }) => [styles.card, { backgroundColor: theme.card, borderColor: theme.primary + '40' }, cardShadow(theme.shadow), pressed && { opacity: 0.8 }]}
      >
        <View style={styles.head}>
          <Icon name="build-outline" size={15} color={theme.primary} />
          <Text style={[Type.eyebrow, { color: theme.primaryDark, flex: 1 }]}>{t('setup.title')}</Text>
          <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }}>{t('setup.edit')}</Text>
        </View>
        <View style={styles.values}>
          {setup.fields.map((f, i) => (
            <View key={`${f.key}:${f.label ?? ''}:${i}`} style={[styles.value, { backgroundColor: theme.surfaceTint }]}>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 13,
                  fontWeight: '600',
                }}
              >
                {`${setupFieldName(f, t)} `}
                <Text style={{ color: theme.text, fontWeight: '800' }}>{setupFieldValue(f, t)}</Text>
              </Text>
            </View>
          ))}
        </View>
        <Text
          style={{
            color: theme.textTertiary,
            fontSize: 11,
            fontWeight: '600',
            marginTop: 6,
          }}
        >
          {sinceToday
            ? t('setup.sinceToday')
            : t('setup.since', {
                date: new Date(since).toLocaleDateString(locale, {
                  month: 'short',
                  day: 'numeric',
                }),
              })}
        </Text>
      </Pressable>
      {sheet}
    </>
  );
}

/**
 * For an exercise with nothing to set up front (dumbbells, body weight), a
 * plain "Add my setup" link lower down, for the odd case that wants one: a
 * dumbbell bench at 30°.
 */
export function SetupAddLink(props: Omit<Props, 'kind'>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const versions = useAppStore((s) => s.exerciseSetups[props.exerciseId]);
  const [open, setOpen] = useState(false);
  if (currentSetup(versions)) return null;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={[styles.link, { borderColor: theme.border }]}>
        <Icon name="build-outline" size={18} color={theme.primary} />
        <Text style={{ color: theme.text, fontWeight: '700', flex: 1 }}>{t('setup.addLink')}</Text>
        <Icon name="add" size={18} color={theme.textTertiary} />
      </Pressable>
      {open && <SetupSheet {...props} kind={null} current={[]} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The editor: one row per setting. Numbers get − and +, words a short box,
 * set choices (handle, bench angle) a row of chips. Settings that fit the
 * machine are a tap away; Other… takes any name. Typing state lives here so
 * the workout screen and its rest countdown don't redraw on every key.
 */
function SetupSheet({ exerciseId, exerciseName, kind, current, onClose }: Props & { current: SetupField[]; onClose: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const saveExerciseSetup = useAppStore((s) => s.saveExerciseSetup);
  const suggestions = SETUP_SUGGESTIONS[kind ?? 'general'];
  // A first setup starts with the two settings almost every machine of its kind has.
  const [draft, setDraft] = useState<SetupField[]>(() =>
    current.length ? current.map((f) => ({ ...f })) : kind ? suggestions.slice(0, 2).map((key) => ({ key, value: '' })) : [],
  );
  const changed = !sameFields(cleanFields(draft), current);

  const patch = (i: number, p: Partial<SetupField>) => setDraft((d) => d.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const remove = (i: number) => {
    lightHaptic();
    setDraft((d) => d.filter((_, j) => j !== i));
  };
  const add = (key: string) => {
    lightHaptic();
    setDraft((d) => [...d, key === 'other' ? { key, label: '', value: '' } : { key, value: '' }]);
  };
  const close = () => {
    if (!changed) return onClose();
    alertDestructive(t('setup.discardTitle'), undefined, [
      { text: t('notes.keepEditing'), style: 'cancel' },
      { text: t('notes.discard'), style: 'destructive', onPress: onClose },
    ]);
  };
  const save = () => {
    saveExerciseSetup(exerciseId, draft);
    successHaptic();
    onClose();
  };

  const offered = suggestions.filter((key) => !draft.some((f) => f.key === key));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Pressable style={styles.backdrop} onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.card,
              paddingBottom: insets.bottom + Spacing.md,
            },
          ]}
          accessibilityViewIsModal
        >
          <View style={[styles.grab, { backgroundColor: theme.border }]} />
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 20 }} accessibilityRole="header">
                {t('setup.title')}
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 13,
                  marginTop: 2,
                }}
              >{`${exerciseName} · ${t('setup.sheetSub')}`}</Text>
            </View>
            <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Icon name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 360, marginTop: Spacing.sm }} keyboardShouldPersistTaps="handled">
            {draft.map((f, i) => {
              const input = SETUP_INPUTS[f.key]?.input ?? 'text';
              const name = f.key === 'other' ? f.label || t('setup.other') : setupFieldName(f, t);
              const removeBtn = (
                <Pressable onPress={() => remove(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('setup.remove', { name })} style={styles.x}>
                  <Icon name="close" size={17} color={theme.textTertiary} />
                </Pressable>
              );
              const border = i > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.border,
              };
              if (input === 'number') {
                const n = Number(f.value);
                const has = f.value !== '' && Number.isFinite(n);
                return (
                  <View key={i} style={[styles.row, border]}>
                    <Text
                      style={{
                        color: theme.text,
                        fontWeight: '700',
                        fontSize: 15,
                        flex: 1,
                      }}
                    >
                      {name}
                    </Text>
                    <Pressable
                      onPress={() => has && n > 0 && patch(i, { value: String(n - 1) })}
                      accessibilityRole="button"
                      accessibilityLabel={`${name} −`}
                      style={[styles.pm, { borderColor: theme.border }]}
                    >
                      <Icon name="remove" size={17} color={theme.primary} />
                    </Pressable>
                    <Text
                      style={{
                        color: theme.text,
                        fontWeight: '800',
                        fontSize: 20,
                        minWidth: 36,
                        textAlign: 'center',
                      }}
                      accessibilityLabel={`${name} ${has ? n : '–'}`}
                    >
                      {has ? String(n) : '–'}
                    </Text>
                    <Pressable
                      onPress={() => patch(i, { value: String(has ? n + 1 : 1) })}
                      accessibilityRole="button"
                      accessibilityLabel={`${name} +`}
                      style={[styles.pm, { borderColor: theme.border }]}
                    >
                      <Icon name="add" size={17} color={theme.primary} />
                    </Pressable>
                    {removeBtn}
                  </View>
                );
              }
              if (input === 'choice') {
                return (
                  <View key={i} style={[styles.choiceRow, border]}>
                    <View style={styles.rowHead}>
                      <Text
                        style={{
                          color: theme.text,
                          fontWeight: '700',
                          fontSize: 15,
                          flex: 1,
                        }}
                      >
                        {name}
                      </Text>
                      {removeBtn}
                    </View>
                    <View style={styles.chips}>
                      {(SETUP_INPUTS[f.key].choices ?? []).map((c) => (
                        <Chip key={c} label={t(`setup.choice.${c}`)} selected={f.value === c} onPress={() => patch(i, { value: c })} />
                      ))}
                    </View>
                  </View>
                );
              }
              return (
                <View key={i} style={[styles.row, border]}>
                  {f.key === 'other' ? (
                    <TextInput
                      value={f.label ?? ''}
                      onChangeText={(v) => patch(i, { label: v.slice(0, 40) })}
                      placeholder={t('setup.otherName')}
                      placeholderTextColor={theme.textTertiary}
                      accessibilityLabel={t('setup.otherName')}
                      style={[
                        styles.input,
                        {
                          flex: 1,
                          color: theme.text,
                          borderColor: theme.border,
                        },
                      ]}
                    />
                  ) : (
                    <Text
                      style={{
                        color: theme.text,
                        fontWeight: '700',
                        fontSize: 15,
                        flex: 1,
                      }}
                    >
                      {name}
                    </Text>
                  )}
                  <TextInput
                    value={f.value}
                    onChangeText={(v) => patch(i, { value: v.slice(0, 60) })}
                    placeholder={t('setup.value')}
                    placeholderTextColor={theme.textTertiary}
                    accessibilityLabel={name}
                    style={[
                      styles.input,
                      {
                        flex: 1.2,
                        color: theme.text,
                        borderColor: theme.border,
                      },
                    ]}
                  />
                  {removeBtn}
                </View>
              );
            })}

            <Text style={[Type.eyebrow, { color: theme.textSecondary, marginTop: Spacing.md }]}>{t('setup.addSetting')}</Text>
            <View style={[styles.chips, { marginTop: 8 }]}>
              {[...offered, 'other'].map((key) => (
                <Pressable
                  key={key}
                  onPress={() => add(key)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.suggest, { borderColor: theme.primary + '66' }, pressed && { opacity: 0.7 }]}
                >
                  <Text
                    style={{
                      color: theme.primaryDark,
                      fontWeight: '700',
                      fontSize: 13,
                    }}
                  >{`+ ${key === 'other' ? t('setup.other') : t(`setup.field.${key}`)}`}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Button label={t('setup.save')} onPress={save} disabled={!changed} style={{ marginTop: Spacing.md }} />
          <Button label={t('common.cancel')} variant="ghost" onPress={close} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.module,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.ms,
    paddingVertical: 10,
    marginTop: Spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  values: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  value: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.module,
    paddingHorizontal: Spacing.ms,
    paddingVertical: 10,
    marginTop: Spacing.sm,
    minHeight: 48,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.ms,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,16,33,0.45)' },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: Spacing.page,
    paddingTop: 10,
    ...cardShadow('#000'),
  },
  grab: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    minHeight: 52,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  choiceRow: { paddingVertical: 9, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pm: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  x: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 40,
  },
  suggest: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.full,
    paddingHorizontal: 11,
    paddingVertical: 7,
    minHeight: 36,
    justifyContent: 'center',
  },
});
