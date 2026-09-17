import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { IconTile, InfoLine, Segmented, StatusPill } from '@/components/system';
import { Button, Field, MealTypePicker, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { reportBarcode } from '@/lib/api';
import { useCelebrate } from '@/lib/celebrate';
import { timestampFor, useViewDay } from '@/lib/day';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { pastFoods, suggestFoods } from '@/lib/food-history';
import { normalizeDigits } from '@/lib/numbers';
import { usePending } from '@/lib/pending';
import { mealTypeForNow, useAppStore } from '@/lib/store';
import type { FoodItem, MealType } from '@/lib/types';

type Basis = 'serving' | 'per100';

const num = (s: string) => parseInt(s, 10) || 0;

/**
 * S29 Manual food entry — the structured review form behind "Enter food
 * manually", "Search food" and the barcode miss. The nutrition basis is
 * explicit: values are either for the portion eaten or per 100 g with a
 * serving mass, and the saved record keeps the basis so a later edit can
 * rescale it. Nothing is estimated for you here; unknown values stay empty.
 */
export default function FoodEdit() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();
  const { barcode } = useLocalSearchParams<{ barcode?: string }>();
  const logMeal = useAppStore((s) => s.logMeal);
  const meals = useAppStore((s) => s.meals);
  const viewDay = useViewDay((s) => s.day);
  const capturedPhoto = usePending((s) => s.capturedPhoto);
  const setCapturedPhoto = usePending((s) => s.setCapturedPhoto);
  const consent = usePending((s) => s.catalogueConsent);

  // A food chosen in Search arrives as a draft and fills the form once.
  const [draft] = useState<FoodItem | null>(() => usePending.getState().consumeFoodDraft());
  const [name, setName] = useState(draft?.name ?? '');
  const [portion, setPortion] = useState(draft?.portion ?? '');
  const [basis, setBasis] = useState<Basis>(draft?.basePer100 ? 'per100' : 'serving');
  const [grams, setGrams] = useState(draft?.gramsEaten ? String(Math.round(draft.gramsEaten)) : '');
  const base = draft?.basePer100;
  const [calories, setCalories] = useState(draft ? String(Math.round(base ? base.calories : draft.calories)) : '');
  const [protein, setProtein] = useState(draft ? String(Math.round(base ? base.proteinG : draft.proteinG)) : '');
  const [carbs, setCarbs] = useState(draft ? String(Math.round(base ? base.carbsG : draft.carbsG)) : '');
  const [fat, setFat] = useState(draft ? String(Math.round(base ? base.fatG : draft.fatG)) : '');
  const [mealType, setMealType] = useState<MealType>(
    () => usePending.getState().consumeMealTypeHint() ?? mealTypeForNow(),
  );

  const history = useMemo(() => pastFoods(meals), [meals]);
  const suggestions = useMemo(() => suggestFoods(history, name), [history, name]);

  /** Refill the whole form from a food the user has logged before. */
  const applySuggestion = (item: FoodItem) => {
    lightHaptic();
    setName(item.name);
    setPortion(item.portion ?? '');
    if (item.basePer100) {
      setBasis('per100');
      setGrams(item.gramsEaten ? String(Math.round(item.gramsEaten)) : '100');
      setCalories(String(Math.round(item.basePer100.calories)));
      setProtein(String(Math.round(item.basePer100.proteinG)));
      setCarbs(String(Math.round(item.basePer100.carbsG)));
      setFat(String(Math.round(item.basePer100.fatG)));
    } else {
      setBasis('serving');
      setCalories(String(Math.round(item.calories)));
      setProtein(String(Math.round(item.proteinG)));
      setCarbs(String(Math.round(item.carbsG)));
      setFat(String(Math.round(item.fatG)));
    }
  };

  const gramsN = num(grams);
  const factor = basis === 'per100' ? gramsN / 100 : 1;
  const totals = {
    calories: Math.round(num(calories) * factor),
    proteinG: Math.round(num(protein) * factor),
    carbsG: Math.round(num(carbs) * factor),
    fatG: Math.round(num(fat) * factor),
  };

  const save = () => {
    if (name.trim().length < 2) {
      Alert.alert(t('foodEdit.nameRequired'));
      return;
    }
    if (basis === 'per100' && gramsN <= 0) {
      Alert.alert(t('foodEdit.servingGramsRequired'));
      return;
    }
    const item: FoodItem = {
      name: name.trim(),
      portion: portion.trim() || (basis === 'per100' ? `${gramsN} ${t('common.grams')}` : '1'),
      ...totals,
      ...(basis === 'per100'
        ? { basePer100: { calories: num(calories), proteinG: num(protein), carbsG: num(carbs), fatG: num(fat) }, gramsEaten: gramsN }
        : {}),
    };
    logMeal([item], capturedPhoto ?? undefined, mealType, timestampFor(viewDay));
    // The catalogue share happens only after a successful private save, and
    // only with the S16 opt-in. It never blocks the diary entry.
    if (barcode && usePending.getState().consumeCatalogueConsent()) void reportBarcode(barcode, item);
    successHaptic();
    useCelebrate.getState().celebrate(t('celebrate.mealLogged'));
    setCapturedPhoto(null);
    router.dismissTo('/(tabs)/food');
  };

  const dateLabel = viewDay.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Screen
      header={<PageHeader title={t('foodEdit.addTitle')} close />}
      footer={<Button label={t('foodEdit.save')} icon="add" onPress={save} />}
    >
      {!!barcode && (
        <View style={[styles.barcode, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <IconTile icon="barcode-outline" size={44} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>{t('foodEdit.barcodeContext', { code: barcode })}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {consent ? t('foodEdit.willShare') : t('foodEdit.barcodePrivate')}
            </Text>
          </View>
        </View>
      )}

      {capturedPhoto ? (
        <Pressable onPress={() => router.push('/scan?mode=photo')} accessibilityRole="button" accessibilityLabel={t('foodEdit.addPhoto')}>
          <Image source={{ uri: capturedPhoto }} style={styles.photo} contentFit="cover" />
        </Pressable>
      ) : null}

      <Field
        label={t('foodEdit.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('foodEdit.namePlaceholder')}
        maxLength={60}
        autoCorrect={false}
      />

      {suggestions.length > 0 && (
        <View style={{ marginTop: -Spacing.sm, marginBottom: Spacing.md }}>
          <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6 }]}>{t('foodEdit.fromHistory')}</Text>
          {suggestions.map((item, i) => (
            <Pressable
              key={`${item.name}-${i}`}
              onPress={() => applySuggestion(item)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.suggestion, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.6 }]}
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
              <Text style={{ color: theme.primary, fontWeight: '800' }}>{Math.round(item.calories)}</Text>
              <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('common.kcal')}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Field label={t('foodEdit.portion')} value={portion} onChangeText={setPortion} placeholder={t('foodEdit.portionPlaceholder')} maxLength={30} />

      <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6 }]}>{t('foodEdit.basis')}</Text>
      <Segmented<Basis>
        options={[
          { key: 'serving', label: t('foodEdit.perServing') },
          { key: 'per100', label: t('foodEdit.per100') },
        ]}
        value={basis}
        onChange={(b) => {
          lightHaptic();
          setBasis(b);
        }}
        style={{ marginBottom: Spacing.md }}
      />
      {basis === 'per100' && (
        <Field
          label={t('foodEdit.servingGrams')}
          value={grams}
          onChangeText={(v) => setGrams(normalizeDigits(v))}
          keyboardType="number-pad"
          maxLength={4}
          suffix={t('common.grams')}
          placeholder={t('foodEdit.servingGramsPlaceholder')}
        />
      )}

      <Field
        label={basis === 'per100' ? t('foodEdit.caloriesPer100') : t('foodEdit.calories')}
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

      {basis === 'per100' && gramsN > 0 && (
        <View style={[styles.totals, { backgroundColor: theme.surfaceTint }]}>
          <Text style={{ color: theme.primaryDark, fontWeight: '700', fontSize: 14 }}>
            {t('foodEdit.thisServing', { grams: gramsN, kcal: totals.calories })}
          </Text>
          <Text style={{ color: theme.primaryDark, fontSize: 13 }}>
            {t('home.protein')} {totals.proteinG} {t('common.grams')} · {t('home.carbs')} {totals.carbsG} {t('common.grams')} · {t('home.fat')} {totals.fatG} {t('common.grams')}
          </Text>
        </View>
      )}

      <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6 }]}>{t('foodEdit.meal')}</Text>
      <MealTypePicker value={mealType} onChange={setMealType} />

      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
        <Text style={{ color: theme.textSecondary, fontSize: 14, flex: 1 }}>{t('foodEdit.loggingTo', { date: dateLabel })}</Text>
        <StatusPill label={t('foodEdit.manualPill')} tone="neutral" icon="pencil-outline" />
      </View>

      {!capturedPhoto && (
        <Button label={t('foodEdit.addPhoto')} icon="camera" variant="ghost" onPress={() => router.push('/scan?mode=photo')} style={{ marginTop: Spacing.xs }} />
      )}
      <InfoLine>{t('foodEdit.noEstimate')}</InfoLine>
    </Screen>
  );
}

const styles = StyleSheet.create({
  barcode: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.module, padding: Spacing.ms, marginBottom: Spacing.md },
  photo: { width: '100%', height: 160, borderRadius: Radius.module, marginBottom: Spacing.md },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: 6,
  },
  row: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
  totals: { borderRadius: Radius.control, padding: Spacing.ms, marginBottom: Spacing.md, gap: 2 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.md, minHeight: 32 },
});
