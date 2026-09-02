import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Ring } from '@/components/ring';
import { Button, Field, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { normalizeDigits } from '@/lib/numbers';
import { FASTING_PROTOCOL_HOURS, fastingStreakDays, useAppStore } from '@/lib/store';
import type { FastingProtocol } from '@/lib/types';

const PRESETS: Exclude<FastingProtocol, 'custom'>[] = ['16:8', '18:6', '20:4', 'omad'];

/** H:MM:SS — ticking display for the active ring, seconds included since
 * this is the one number the screen is built around. */
function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Coarser "Xh Ym" — for the secondary remaining/over line, where seconds
 * would just be noise. */
function formatHoursMinutes(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

function protocolLabel(protocol: FastingProtocol, t: (key: string) => string): string {
  if (protocol === 'omad') return t('fasting.protocolOmad');
  if (protocol === 'custom') return t('fasting.protocolCustom');
  return protocol;
}

export default function Fasting() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const activeFast = useAppStore((s) => s.activeFast);
  const history = useAppStore((s) => s.fastingHistory);
  const startFast = useAppStore((s) => s.startFast);
  const endFast = useAppStore((s) => s.endFast);
  const cancelFast = useAppStore((s) => s.cancelFast);
  const deleteFastingSession = useAppStore((s) => s.deleteFastingSession);

  const [selected, setSelected] = useState<FastingProtocol>('16:8');
  const [customHours, setCustomHours] = useState('14');
  const [now, setNow] = useState(() => Date.now());

  // Only ticks while a fast is actually running and this screen is open —
  // no background timer, the ring just recomputes from real timestamps
  // (startedAt) next time it's shown, so nothing drifts.
  useEffect(() => {
    if (!activeFast) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeFast]);

  const streak = fastingStreakDays(history);

  const startTargetHours = selected === 'custom' ? Number(normalizeDigits(customHours)) || 0 : FASTING_PROTOCOL_HOURS[selected];

  const confirmEnd = () => {
    if (!activeFast) return;
    const elapsedHours = (now - new Date(activeFast.startedAt).getTime()) / 3600000;
    if (elapsedHours < activeFast.targetHours) {
      Alert.alert(t('fasting.endConfirmTitle'), t('fasting.endConfirmEarly'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('fasting.end'), style: 'destructive', onPress: endFast },
      ]);
      return;
    }
    endFast();
  };

  const confirmCancel = () => {
    Alert.alert(t('fasting.cancelConfirmTitle'), t('fasting.cancelConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('fasting.cancel'), style: 'destructive', onPress: cancelFast },
    ]);
  };

  const confirmDelete = (id: string) =>
    Alert.alert(t('fasting.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteFastingSession(id) },
    ]);

  const elapsedMs = activeFast ? now - new Date(activeFast.startedAt).getTime() : 0;
  const targetMs = activeFast ? activeFast.targetHours * 3600000 : 0;
  const overGoal = activeFast != null && elapsedMs >= targetMs;

  return (
    <Screen
      footer={
        activeFast ? (
          <View>
            <Button label={t('fasting.end')} onPress={confirmEnd} />
            <Button label={t('fasting.cancel')} variant="ghost" onPress={confirmCancel} style={{ marginTop: Spacing.xs }} />
          </View>
        ) : (
          <Button label={t('fasting.start')} onPress={() => startFast(selected, startTargetHours)} disabled={startTargetHours <= 0} />
        )
      }
    >
      <View style={styles.header}>
        <Title>{t('fasting.title')}</Title>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>

      {streak > 0 && (
        <View style={[styles.streakRow, { backgroundColor: theme.cardSubtle }]}>
          <Ionicons name="flame" size={16} color="#FF9F45" />
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
            {t('fasting.streak', { count: streak })}
          </Text>
        </View>
      )}

      {activeFast ? (
        <View style={{ alignItems: 'center', marginVertical: Spacing.lg }}>
          <Ring
            size={190}
            strokeWidth={14}
            progress={targetMs > 0 ? elapsedMs / targetMs : 0}
            color={overGoal ? theme.success : theme.primary}
            trackColor={theme.cardSubtle}
          >
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.ringValue, { color: theme.text }]}>{formatElapsed(elapsedMs)}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{protocolLabel(activeFast.protocol, t)}</Text>
            </View>
          </Ring>
          <Text style={{ color: overGoal ? theme.success : theme.textSecondary, marginTop: Spacing.md, textAlign: 'center', fontSize: 14 }}>
            {overGoal
              ? t('fasting.goalReached')
              : t('fasting.remaining', { time: formatHoursMinutes(targetMs - elapsedMs) })}
          </Text>
        </View>
      ) : (
        <View style={{ marginBottom: Spacing.lg }}>
          <Text style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>{t('fasting.chooseProtocol')}</Text>
          <View style={styles.chipRow}>
            {[...PRESETS, 'custom' as const].map((p) => {
              const active = selected === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setSelected(p)}
                  style={[
                    styles.chip,
                    { backgroundColor: active ? theme.primary : theme.cardSubtle, borderColor: theme.border },
                  ]}
                >
                  <Text style={{ color: active ? theme.onPrimary : theme.text, fontWeight: '700', fontSize: 13 }}>
                    {protocolLabel(p, t)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {selected === 'custom' && (
            <Field
              label={t('fasting.customHours')}
              value={customHours}
              onChangeText={(v) => setCustomHours(normalizeDigits(v))}
              keyboardType="number-pad"
              maxLength={2}
              suffix={t('fasting.hoursSuffix')}
            />
          )}
        </View>
      )}

      {history.length > 0 && (
        <>
          <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.sm }]}>
            {t('fasting.historyTitle')}
          </Text>
          <View style={[styles.historyCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
            {history.slice(0, 10).map((f, i) => {
              const durationMs = new Date(f.endedAt!).getTime() - new Date(f.startedAt).getTime();
              const met = durationMs >= f.targetHours * 3600000;
              return (
                <View
                  key={f.id}
                  style={[
                    styles.historyRow,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '600' }}>
                      {new Date(f.endedAt!).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      {'  ·  '}
                      {protocolLabel(f.protocol, t)}
                    </Text>
                    <Text style={{ color: met ? theme.success : theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {formatHoursMinutes(durationMs)}
                      {'  '}
                      {met ? t('fasting.goalMet') : t('fasting.goalShort')}
                    </Text>
                  </View>
                  <Pressable onPress={() => confirmDelete(f.id)} hitSlop={10}>
                    <Ionicons name="trash-outline" size={16} color={theme.textTertiary} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    marginBottom: Spacing.md,
  },
  ringValue: { fontSize: 28, fontWeight: '800' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  historyCard: { borderRadius: Radius.md, overflow: 'hidden' },
  historyRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
});
