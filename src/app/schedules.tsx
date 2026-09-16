import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { weekdayLabel } from '@/components/schedule-plan-card';
import { Button, Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { exerciseName, findExercise } from '@/lib/exercises';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { useAppStore } from '@/lib/store';

const WEEK = [0, 1, 2, 3, 4, 5, 6];

type Week = Record<number, { title?: string; exerciseIds: string[] }>;

/** How many exercises a week holds — the quickest honest summary of a plan. */
function weekSize(days: Week): { trainingDays: number; exercises: number } {
  let trainingDays = 0;
  let exercises = 0;
  for (const weekday of WEEK) {
    const n = days[weekday]?.exerciseIds?.length ?? 0;
    if (n > 0) trainingDays += 1;
    exercises += n;
  }
  return { trainingDays, exercises };
}

/**
 * Keep several weeks side by side — Gym, Home, Travel — and load one.
 *
 * These are saved copies, and both directions are explicit: activating
 * replaces the week you are training, "Update" captures it back. A schedule
 * that rewrote itself under you would be worse than one that asks.
 *
 * Nothing here touches what you have already done. Logged sets, personal
 * bests, "last time" and a session in progress are records of what happened,
 * and a plan is not allowed to rewrite them.
 */
export default function Schedules() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();

  const schedule = useAppStore((s) => s.schedule);
  const saved = useAppStore((s) => s.savedSchedules);
  const activeId = useAppStore((s) => s.activeScheduleId);
  const custom = useAppStore((s) => s.exercises);
  const saveScheduleAs = useAppStore((s) => s.saveScheduleAs);
  const updateSavedSchedule = useAppStore((s) => s.updateSavedSchedule);
  const activateSchedule = useAppStore((s) => s.activateSchedule);
  const renameSchedule = useAppStore((s) => s.renameSchedule);
  const deleteSchedule = useAppStore((s) => s.deleteSchedule);

  const [newName, setNewName] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const current = weekSize(schedule);
  const nameOf = (s: { name: string }) => s.name || t('schedules.defaultName');

  const confirmActivate = (id: string) => {
    const target = saved.find((s) => s.id === id);
    if (!target) return;
    Alert.alert(t('schedules.activateTitle', { name: nameOf(target) }), t('schedules.activateBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('schedules.activate'),
        onPress: () => {
          activateSchedule(id);
          successHaptic();
        },
      },
    ]);
  };

  const confirmDelete = (id: string) => {
    const target = saved.find((s) => s.id === id);
    if (!target) return;
    Alert.alert(t('schedules.deleteTitle'), t('schedules.deleteBody', { name: nameOf(target) }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteSchedule(id) },
    ]);
  };

  // Renaming is done inline rather than through Alert.prompt, which exists
  // only on iOS and would silently do nothing on Android.
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const startRename = (id: string) => {
    const target = saved.find((s) => s.id === id);
    if (!target) return;
    setRenameDraft(target.name);
    setRenaming(id);
  };
  const commitRename = (id: string) => {
    renameSchedule(id, renameDraft);
    setRenaming(null);
  };

  return (
    <Screen>
      <Title>{t('schedules.title')}</Title>
      <Text style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>{t('schedules.subtitle')}</Text>

      {/* What is on the plan right now, and how to keep it. */}
      <Card style={{ gap: Spacing.sm }}>
        <Text style={[Type.caption, { color: theme.textSecondary }]}>{t('schedules.current')}</Text>
        <Text style={{ color: theme.text, fontWeight: '700' }}>
          {t('schedules.summary', { days: current.trainingDays, exercises: current.exercises })}
        </Text>
        <View style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder={t('schedules.namePlaceholder')}
            placeholderTextColor={theme.textTertiary}
            style={{ flex: 1, color: theme.text, fontSize: 15, padding: 0 }}
            maxLength={30}
          />
        </View>
        <Button
          label={t('schedules.saveAs')}
          icon="bookmark-outline"
          variant="secondary"
          disabled={newName.trim().length < 1 || current.exercises === 0}
          onPress={() => {
            saveScheduleAs(newName);
            setNewName('');
            successHaptic();
          }}
        />
        {current.exercises === 0 && (
          <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('schedules.emptyWeek')}</Text>
        )}
      </Card>

      {saved.length > 0 && (
        <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>
          {t('schedules.saved')}
        </Text>
      )}

      {saved.map((s) => {
        const size = weekSize(s.days);
        const isActive = s.id === activeId;
        const open = preview === s.id;
        return (
          <Card key={s.id} style={{ gap: Spacing.sm, marginBottom: Spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {renaming === s.id ? (
                    <TextInput
                      value={renameDraft}
                      onChangeText={setRenameDraft}
                      autoFocus
                      selectTextOnFocus
                      maxLength={30}
                      onBlur={() => commitRename(s.id)}
                      onSubmitEditing={() => commitRename(s.id)}
                      style={{
                        color: theme.text,
                        fontWeight: '700',
                        fontSize: 15,
                        padding: 0,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.primary,
                        minWidth: 120,
                      }}
                    />
                  ) : (
                    <Text style={{ color: theme.text, fontWeight: '700' }}>{nameOf(s)}</Text>
                  )}
                  {isActive && (
                    <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                      <Text style={{ color: theme.onPrimary, fontSize: 11, fontWeight: '800' }}>
                        {t('schedules.active')}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                  {t('schedules.summary', { days: size.trainingDays, exercises: size.exercises })}
                  {isActive && s.activatedAt
                    ? ` · ${t('schedules.activeSince', {
                        date: new Date(s.activatedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
                      })}`
                    : ''}
                </Text>
              </View>
              <Pressable onPress={() => startRename(s.id)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="pencil" size={16} color={theme.textTertiary} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(s.id)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={16} color={theme.textTertiary} />
              </Pressable>
            </View>

            {/* What loading it would actually put on your week. */}
            <Pressable
              onPress={() => {
                lightHaptic();
                setPreview(open ? null : s.id);
              }}
              hitSlop={6}
            >
              <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600' }}>
                {open ? t('schedules.hidePreview') : t('schedules.preview')}
              </Text>
            </Pressable>
            {open && (
              <View style={{ gap: 4 }}>
                {WEEK.map((weekday) => {
                  const day = s.days[weekday];
                  const ids = day?.exerciseIds ?? [];
                  return (
                    <Text key={weekday} style={{ color: theme.textSecondary, fontSize: 12 }}>
                      <Text style={{ fontWeight: '700' }}>{weekdayLabel(weekday, locale)}</Text>
                      {'  '}
                      {ids.length === 0
                        ? t('today.restDay')
                        : ids
                            .map((exId) => {
                              const ex = findExercise(exId, custom);
                              return ex ? exerciseName(ex, lang) : exId;
                            })
                            .join(', ')}
                    </Text>
                  );
                })}
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
              {!isActive && (
                <Button
                  label={t('schedules.activate')}
                  icon="swap-horizontal"
                  onPress={() => confirmActivate(s.id)}
                  style={{ flex: 1 }}
                />
              )}
              <Button
                label={t('schedules.update')}
                icon="save-outline"
                variant="secondary"
                onPress={() => {
                  updateSavedSchedule(s.id);
                  successHaptic();
                }}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        );
      })}

      {saved.length === 0 && (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="calendar-outline" size={30} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>{t('schedules.empty')}</Text>
        </View>
      )}

      <Button
        label={t('schedules.editWeek')}
        variant="ghost"
        icon="create-outline"
        onPress={() => router.push('/schedule')}
        style={{ marginTop: Spacing.sm }}
      />
      <Text style={{ color: theme.textTertiary, fontSize: 12, textAlign: 'center', marginTop: Spacing.xs }}>
        {t('schedules.historyNote')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.md },
  badge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.sm,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
});
