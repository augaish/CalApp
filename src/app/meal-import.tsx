import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, Subtitle, Title } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchSharedPlan } from '@/lib/api';
import { useCelebrate } from '@/lib/celebrate';
import { timestampFor, useViewDay } from '@/lib/day';
import { successHaptic } from '@/lib/feedback';
import { isSharedMeal, sharedMealTotals, type SharedMeal } from '@/lib/share';
import { useAppStore } from '@/lib/store';

export default function MealImport() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { c: code } = useLocalSearchParams<{ c?: string }>();

  const logMeal = useAppStore((s) => s.logMeal);
  const viewDay = useViewDay((s) => s.day);

  const [payload, setPayload] = useState<SharedMeal | null>(null);
  const [loading, setLoading] = useState(!!code);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    fetchSharedPlan(code)
      .then((raw) => {
        if (!alive) return;
        setPayload(isSharedMeal(raw) ? raw : null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [code]);

  // Everything lands on the day the recipient is looking at, as its own meal
  // per shared meal — so a shared whole day arrives as breakfast/lunch/dinner
  // rather than one giant entry.
  const apply = () => {
    if (!payload) return;
    for (const meal of payload.meals) {
      if (meal.items.length === 0) continue;
      logMeal(meal.items, undefined, meal.mealType, timestampFor(viewDay));
    }
    successHaptic();
    useCelebrate.getState().celebrate(t('mealImport.done'));
    router.replace('/(tabs)/food');
  };

  if (loading) {
    return (
      <Screen footer={<Button label={t('common.close')} onPress={() => router.back()} />}>
        <Title>{t('mealImport.title')}</Title>
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <ActivityIndicator color={theme.primary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
            {t('mealImport.loading')}
          </Text>
        </View>
      </Screen>
    );
  }

  const foodCount = payload?.meals.reduce((n, m) => n + m.items.length, 0) ?? 0;

  if (!payload || foodCount === 0) {
    return (
      <Screen
        footer={<Button label={t('common.close')} onPress={() => router.replace('/(tabs)/food')} />}
      >
        <Title>{t('mealImport.title')}</Title>
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="alert-circle-outline" size={32} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
            {t('mealImport.invalid')}
          </Text>
        </View>
      </Screen>
    );
  }

  const totals = sharedMealTotals(payload);

  return (
    <Screen
      footer={
        <View>
          <Button label={t('mealImport.apply')} icon="download-outline" onPress={apply} />
          <Button
            label={t('common.cancel')}
            variant="ghost"
            onPress={() => router.replace('/(tabs)/food')}
            style={{ marginTop: Spacing.xs }}
          />
        </View>
      }
    >
      <Title>{t('mealImport.title')}</Title>
      <Subtitle>{t('mealImport.summary', { count: foodCount })}</Subtitle>

      {payload.meals.map((meal, mi) => (
        <Card key={mi}>
          {!!meal.mealType && (
            <Text style={[styles.mealTitle, { color: theme.text }]}>
              {t(`home.mealTypes.${meal.mealType}`)}
            </Text>
          )}
          {meal.items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Ionicons name="restaurant-outline" size={15} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text }} numberOfLines={1}>
                  {item.name}
                </Text>
                {!!item.portion && (
                  <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{item.portion}</Text>
                )}
              </View>
              <Text style={{ color: theme.primary, fontWeight: '700' }}>
                {Math.round(item.calories)}
              </Text>
            </View>
          ))}
        </Card>
      ))}

      <View style={[styles.totalBar, { backgroundColor: theme.cardSubtle }]}>
        <Text style={{ color: theme.text, fontWeight: '700', flex: 1 }}>
          {t('mealShare.total')}
        </Text>
        <Text style={{ color: theme.primary, fontWeight: '800' }}>
          {Math.round(totals.calories)} {t('common.kcal')}
        </Text>
      </View>
      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
        {t('home.protein')} {Math.round(totals.proteinG)}g · {t('home.carbs')}{' '}
        {Math.round(totals.carbsG)}g · {t('home.fat')} {Math.round(totals.fatG)}g
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mealTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5 },
  totalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  empty: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
});
