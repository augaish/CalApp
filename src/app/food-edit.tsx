import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Field, MealTypePicker, Screen, Title } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { timestampFor, useViewDay } from '@/lib/day';
import { successHaptic } from '@/lib/feedback';
import { usePending } from '@/lib/pending';
import { mealTypeForNow, useAppStore } from '@/lib/store';
import type { MealType } from '@/lib/types';

export default function FoodEdit() {
  const { t } = useTranslation();
  const router = useRouter();
  const logMeal = useAppStore((s) => s.logMeal);
  const viewDay = useViewDay((s) => s.day);
  const capturedPhoto = usePending((s) => s.capturedPhoto);
  const setCapturedPhoto = usePending((s) => s.setCapturedPhoto);

  const [name, setName] = useState('');
  const [portion, setPortion] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [mealType, setMealType] = useState<MealType>(mealTypeForNow());

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
        },
      ],
      capturedPhoto ?? undefined,
      mealType,
      timestampFor(viewDay),
    );
    successHaptic();
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
        onChangeText={setName}
        placeholder={t('foodEdit.namePlaceholder')}
        maxLength={60}
      />
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
        onChangeText={setCalories}
        keyboardType="number-pad"
        maxLength={5}
        suffix={t('common.kcal')}
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label={t('home.protein')} value={protein} onChangeText={setProtein} keyboardType="number-pad" maxLength={4} suffix={t('common.grams')} />
        </View>
        <View style={styles.flex}>
          <Field label={t('home.carbs')} value={carbs} onChangeText={setCarbs} keyboardType="number-pad" maxLength={4} suffix={t('common.grams')} />
        </View>
        <View style={styles.flex}>
          <Field label={t('home.fat')} value={fat} onChangeText={setFat} keyboardType="number-pad" maxLength={4} suffix={t('common.grams')} />
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
  row: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
});
