import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { burnedForDay, useAppStore } from '@/lib/store';

export default function Training() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';

  const workouts = useAppStore((s) => s.workouts);
  const burnedToday = burnedForDay(workouts, new Date());

  return (
    <Screen
      footer={
        <Button
          label={t('training.scanCta')}
          icon="barbell"
          onPress={() => router.push('/scan?mode=gym')}
        />
      }
    >
      <Title>{t('tabs.training')}</Title>

      <Card style={styles.burnCard}>
        <View style={[styles.burnIcon, { backgroundColor: 'rgba(245,166,35,0.15)' }]}>
          <Ionicons name="flame" size={26} color={theme.carbs} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.burnValue, { color: theme.text }]}>
            {burnedToday} <Text style={styles.burnUnit}>{t('common.kcal')}</Text>
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            {t('training.burnedToday')} · {t('training.estimated')}
          </Text>
        </View>
      </Card>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('training.history')}</Text>
      {workouts.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="barbell-outline" size={36} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center', lineHeight: 22 }}>
            {t('progress.noWorkouts')}
          </Text>
        </View>
      ) : (
        workouts.map((w) => (
          <Card key={w.id} style={styles.workoutRow}>
            <View style={[styles.workoutIcon, { backgroundColor: theme.cardSubtle }]}>
              <Ionicons name="barbell" size={18} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '600' }} numberOfLines={1}>
                {w.equipmentName}
              </Text>
              <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                {new Date(w.at).toLocaleDateString(locale, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
                {w.sets ? ` · ${w.sets} × ${w.reps}` : ''}
              </Text>
            </View>
            {w.caloriesBurned ? (
              <Text style={{ color: theme.carbs, fontWeight: '800' }}>
                {w.caloriesBurned} {t('common.kcal')}
              </Text>
            ) : null}
          </Card>
        ))
      )}

      <Text style={[styles.syncNote, { color: theme.textTertiary }]}>
        {t('training.syncNote')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  burnCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  burnIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burnValue: { fontSize: 26, fontWeight: '800' },
  burnUnit: { fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.sm },
  empty: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 12,
    marginBottom: Spacing.sm,
  },
  workoutIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncNote: { fontSize: 12, textAlign: 'center', marginTop: Spacing.sm },
});
