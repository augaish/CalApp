import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { ActionButton, EmptyState, IconTile, InfoLine, StatusPill } from '@/components/system';
import { Button, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { successHaptic } from '@/lib/feedback';
import { useAppStore } from '@/lib/store';

const WEEK = [0, 1, 2, 3, 4, 5, 6];
type Week = Record<number, { title?: string; exerciseIds: string[] }>;

/** How many exercises a week holds — the quickest honest summary of a plan. */
export function weekSize(days: Week): { trainingDays: number; exercises: number } {
  let trainingDays = 0;
  let exercises = 0;
  for (const weekday of WEEK) {
    const n = days[weekday]?.exerciseIds?.length ?? 0;
    if (n > 0) trainingDays += 1;
    exercises += n;
  }
  return { trainingDays, exercises };
}

/** A glyph for a schedule from its name — home, travel, otherwise the gym. */
export function scheduleIcon(name: string): 'barbell-outline' | 'home-outline' | 'briefcase-outline' {
  const n = name.toLowerCase();
  if (/home|house|بيت|منزل/.test(n)) return 'home-outline';
  if (/travel|trip|hotel|سفر|رحلة/.test(n)) return 'briefcase-outline';
  return 'barbell-outline';
}

/**
 * S07 Schedule library — several saved weeks (Gym, Home, Travel), one
 * Active. Preview opens the activation review; nothing here activates
 * silently. Deleting a saved copy never touches history or the week you
 * are training; the active one stays the working schedule.
 */
export default function Schedules() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const schedule = useAppStore((s) => s.schedule);
  const saved = useAppStore((s) => s.savedSchedules);
  const activeId = useAppStore((s) => s.activeScheduleId);
  const saveScheduleAs = useAppStore((s) => s.saveScheduleAs);
  const updateSavedSchedule = useAppStore((s) => s.updateSavedSchedule);
  const renameSchedule = useAppStore((s) => s.renameSchedule);
  const deleteSchedule = useAppStore((s) => s.deleteSchedule);

  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const current = weekSize(schedule);
  const nameOf = (s: { name: string }) => s.name || t('schedules.defaultName');
  const activeSaved = saved.find((s) => s.id === activeId);
  // The working week differs from its saved copy once it has been edited.
  const drifted = !!activeSaved && JSON.stringify(activeSaved.days) !== JSON.stringify(schedule);

  const confirmDelete = (id: string) => {
    const target = saved.find((s) => s.id === id);
    if (!target) return;
    Alert.alert(t('schedules.deleteTitle'), t('schedules.deleteBody', { name: nameOf(target) }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteSchedule(id) },
    ]);
  };

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
    <Screen
      header={<PageHeader title={t('schedules.title')} />}
      footer={
        naming ? (
          <View style={{ gap: Spacing.xs }}>
            <View style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder={t('schedules.namePlaceholder')}
                placeholderTextColor={theme.textTertiary}
                autoFocus
                maxLength={30}
                accessibilityLabel={t('schedules.namePlaceholder')}
                style={{ flex: 1, color: theme.text, fontSize: 16, padding: 0 }}
              />
            </View>
            <Button
              label={t('schedules.saveAs')}
              icon="bookmark-outline"
              disabled={newName.trim().length < 1 || current.exercises === 0}
              onPress={() => {
                saveScheduleAs(newName);
                setNewName('');
                setNaming(false);
                successHaptic();
              }}
            />
            <Button label={t('common.cancel')} variant="ghost" onPress={() => setNaming(false)} />
          </View>
        ) : (
          <Button label={t('schedules.newSchedule')} icon="add" onPress={() => setNaming(true)} />
        )
      }
    >
      <Text style={[Type.title, { color: theme.text }]}>{t('schedules.title')}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 15, marginBottom: Spacing.md }}>{t('schedules.chooseWeek')}</Text>

      {saved.length === 0 && (
        <EmptyState
          icon="calendar-outline"
          title={t('schedules.emptyTitle')}
          body={current.exercises === 0 ? t('schedules.emptyWeek') : t('schedules.empty')}
          action={current.exercises === 0 ? { label: t('schedules.editWeek'), icon: 'create-outline', onPress: () => router.push('/schedule') } : { label: t('schedules.newSchedule'), icon: 'add', onPress: () => setNaming(true) }}
        />
      )}

      {saved.map((s) => {
        const size = weekSize(s.days);
        const isActive = s.id === activeId;
        return (
          <View key={s.id} style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
            <Pressable onPress={() => router.push(`/schedule-activate?id=${encodeURIComponent(s.id)}`)} accessibilityRole="button" style={({ pressed }) => [styles.head, pressed && { opacity: 0.7 }]}>
              <IconTile icon={scheduleIcon(s.name)} size={52} />
              <View style={{ flex: 1 }}>
                {renaming === s.id ? (
                  <TextInput
                    value={renameDraft}
                    onChangeText={setRenameDraft}
                    autoFocus
                    selectTextOnFocus
                    maxLength={30}
                    onBlur={() => commitRename(s.id)}
                    onSubmitEditing={() => commitRename(s.id)}
                    accessibilityLabel={t('schedules.renameTitle')}
                    style={{ color: theme.text, fontWeight: '800', fontSize: 18, padding: 0, borderBottomWidth: 1, borderBottomColor: theme.primary }}
                  />
                ) : (
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }} numberOfLines={1}>
                    {nameOf(s)}
                  </Text>
                )}
                <Text style={{ color: theme.textSecondary, fontSize: 14 }}>{t('schedules.trainingDays', { count: size.trainingDays })}</Text>
              </View>
              {isActive && <StatusPill label={t('schedules.activeLabel')} tone="active" />}
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </Pressable>

            <View style={styles.actions}>
              {isActive ? (
                <>
                  <ActionButton label={t('schedules.viewWeek')} onPress={() => router.push('/schedule')} style={{ flex: 1 }} />
                  <ActionButton label={t('schedules.editBtn')} variant="secondary" onPress={() => router.push('/schedule')} style={{ flex: 1 }} />
                </>
              ) : (
                <ActionButton label={t('schedules.previewBtn')} variant="secondary" onPress={() => router.push(`/schedule-activate?id=${encodeURIComponent(s.id)}`)} style={{ flex: 1 }} />
              )}
            </View>

            <View style={styles.tools}>
              {isActive && drifted && (
                <Pressable onPress={() => { updateSavedSchedule(s.id); successHaptic(); }} accessibilityRole="button" hitSlop={6} style={styles.tool}>
                  <Ionicons name="save-outline" size={15} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>{t('schedules.update')}</Text>
                </Pressable>
              )}
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => startRename(s.id)} accessibilityRole="button" accessibilityLabel={t('schedules.renameTitle')} hitSlop={8} style={styles.tool}>
                <Ionicons name="pencil-outline" size={16} color={theme.textTertiary} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(s.id)} accessibilityRole="button" accessibilityLabel={t('common.delete')} hitSlop={8} style={styles.tool}>
                <Ionicons name="trash-outline" size={16} color={theme.textTertiary} />
              </Pressable>
            </View>
          </View>
        );
      })}

      {saved.length > 0 && !activeSaved && (
        <InfoLine icon="alert-circle-outline">{t('schedules.unsavedWeek', { days: current.trainingDays, exercises: current.exercises })}</InfoLine>
      )}
      <InfoLine>{t('schedules.historyNote')}</InfoLine>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.ms },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, minHeight: 52 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.ms },
  tools: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: 4 },
  input: { borderWidth: 1, borderRadius: Radius.control, paddingHorizontal: Spacing.md, minHeight: 48, justifyContent: 'center' },
});
