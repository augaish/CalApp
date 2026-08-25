import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Field, MealTypePicker, Screen, Title } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCelebrate } from '@/lib/celebrate';
import { timestampFor, useViewDay } from '@/lib/day';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { pastFoods, suggestFoods } from '@/lib/food-history';
import { normalizeDigits } from '@/lib/numbers';
import { usePending } from '@/lib/pending';
import { mealTypeForNow, useAppStore } from '@/lib/store';
import type { FoodItem, MealType } from '@/lib/types';

export default function FoodEdit() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const logMeal = useAppStore((s) => s.logMeal);
  const meals = useAppStore((s) => s.meals);
  const viewDay = useViewDay((s) => s.day);
  const capturedPhoto = usePending((s) => s.capturedPhoto);
  const setCapturedPhoto = usePending((s) => s.setCapturedPhoto);

  const [name, setName] = useState('');
  const [portion, setPortion] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [mealType, setMealType] = useState<MealType>(
    () => usePending.getState().consumeMealTypeHint() ?? mealTypeForNow(),
  );
  // Set once a suggestion is taken, so per-100g scaling survives on packaged
  // foods that were originally added by barcode.
  const [basePer100, setBasePer100] = useState<FoodItem['basePer100']>(undefined);

  const history = useMemo(() => pastFoods(meals), [meals]);
  const suggestions = useMemo(() => suggestFoods(history, name), [history, name]);

  /** Refill the whole form from a food the user has logged before. */
  const applySuggestion = (item: FoodItem) => {
    lightHaptic();
    setName(item.name);
    setPortion(item.portion ?? '');
    setCalories(String(Math.round(item.calories)));
    setProtein(String(Math.round(item.proteinG)));
    setCarbs(String(Math.round(item.carbsG)));
    setFat(String(Math.round(item.fatG)));
    setBasePer100(item.basePer100);
  };

  const save = () => {
    if (name.trim().length < 2) {
      Alert.alert(t('foodEdit.nameRequired'));
      return;
    }
    logMeal(
      [
        {
          name: name.trim(),
          portion: portion.trim() || '1',
          calories: parseInt(calories, 10) || 0,
          proteinG: parseInt(protein, 10) || 0,
          carbsG: parseInt(carbs, 10) || 0,
          fatG: parseInt(fat, 10) || 0,
          ...(basePer100 ? { basePer100 } : {}),
        },
      ],
      capturedPhoto ?? undefined,
      mealType,
      timestampFor(viewDay),
    );
    successHaptic();
    useCelebrate.getState().celebrate(t('celebrate.mealLogged'));
    setCapturedPhoto(null);
    router.dismissTo('/(tabs)/food');
  };

  return (
    <Screen footer={<Button label={t('foodEdit.save')} icon="add" onPress={save} />}>
      <Title>{t('foodEdit.addTitle')}</Title>

      {capturedPhoto ? (
        <Pressable onPress={() => router.push('/scan?mode=photo')}>
          <Image source={{ uri: capturedPhoto }} style={styles.photo} contentFit="cover" />
        </Pressable>
      ) : (
        <Button
          label={t('foodEdit.addPhoto')}
          icon="camera"
          variant="secondary"
          onPress={() => router.push('/scan?mode=photo')}
          style={{ marginBottom: Spacing.md }}
        />
      )}

      <Field
        label={t('foodEdit.name')}
        value={name}
        onChangeText={(text) => {
          setName(text);
          // Typing over a filled-in suggestion means this is a different food.
          setBasePer100(undefined);
        }}
        placeholder={t('foodEdit.namePlaceholder')}
        maxLength={60}
        autoCorrect={false}
      />

      {suggestions.length > 0 && (
        <View style={{ marginTop: -Spacing.sm, marginBottom: Spacing.md }}>
          <Text style={{ color: theme.textTertiary, fontSize: 12, marginBottom: 6 }}>
            {t('foodEdit.fromHistory')}
          </Text>
          {suggestions.map((item, i) => (
            <Pressable
              key={`${item.name}-${i}`}
              onPress={() => applySuggestion(item)}
              style={({ pressed }) => [
                styles.suggestion,
                { backgroundColor: theme.card, borderColor: theme.border },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons name="time-outline" size={16} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '600' }} numberOfLines={1}>
                  {item.name}
                </Text>
                {!!item.portion && (
                  <Text style={{ color: theme.textTertiary, fontSize: 12 }} numberOfLines={1}>
                    {item.portion}
                  </Text>
                )}
              </View>
              <Text style={{ color: theme.primary, fontWeight: '800' }}>
                {Math.round(item.calories)}
              </Text>
              <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('common.kcal')}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Field
        label={t('foodEdit.portion')}
        value={portion}
        onChangeText={setPortion}
        placeholder={t('foodEdit.portionPlaceholder')}
        maxLength={30}
      />
      <Field
        label={t('foodEdit.calories')}
        value={calories}
        onChangeText={(v) => setCalories(normalizeDigits(v))}
        keyboardType="number-pad"
        maxLength={5}
        suffix={t('common.kcal')}
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label={t('home.protein')} value={protein} onChangeText={(v) => setProtein(normalizeDigits(v))} keyboardType="number-pad" maxLength={4} suffix={t('common.grams')} />
        </View>
        <View style={styles.flex}>
          <Field label={t('home.carbs')} value={carbs} onChangeText={(v) => setCarbs(normalizeDigits(v))} keyboardType="number-pad" maxLength={4} suffix={t('common.grams')} />
        </View>
        <View style={styles.flex}>
          <Field label={t('home.fat')} value={fat} onChangeText={(v) => setFat(normalizeDigits(v))} keyboardType="number-pad" maxLength={4} suffix={t('common.grams')} />
        </View>
      </View>

      <MealTypePicker value={mealType} onChange={setMealType} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.xs }}>
        <Ionicons name="information-circle-outline" size={14} color="#9CA3AF" />
        <Text style={{ color: '#9CA3AF', fontSize: 12, flex: 1 }}>{t('common.aiDisclaimer')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', height: 160, borderRadius: Radius.lg, marginBottom: Spacing.md },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: 6,
  },
  row: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
});
