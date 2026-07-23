import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic } from '@/lib/feedback';
import { useAppStore } from '@/lib/store';

const QUICK_ML = [250, 500, 750];

export default function WaterSheet() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const logWater = useAppStore((s) => s.logWater);
  const [custom, setCustom] = useState('');

  const add = (ml: number) => {
    if (!ml || ml <= 0 || ml > 5000) return;
    logWater(Math.round(ml));
    lightHaptic();
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable style={styles.backdrop} onPress={() => router.back()}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.lg },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <View style={styles.titleRow}>
            <Ionicons name="water" size={22} color={theme.water} />
            <Text style={[styles.title, { color: theme.text }]}>{t('waterSheet.title')}</Text>
          </View>

          <View style={styles.quickRow}>
            {QUICK_ML.map((ml) => (
              <Pressable
                key={ml}
                onPress={() => add(ml)}
                style={({ pressed }) => [
                  styles.quick,
                  { backgroundColor: theme.card },
                  cardShadow(theme.shadow),
                  pressed && { transform: [{ scale: 0.95 }] },
                ]}
              >
                <Text style={[styles.quickValue, { color: theme.water }]}>{ml}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{t('home.ml')}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.customLabel, { color: theme.textSecondary }]}>
            {t('waterSheet.custom')}
          </Text>
          <View style={styles.customRow}>
            <TextInput
              value={custom}
              onChangeText={setCustom}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="330"
              placeholderTextColor={theme.textTertiary}
              style={[
                styles.input,
                { backgroundColor: theme.card, borderColor: theme.border, color: theme.text },
              ]}
            />
            <Button
              label={t('waterSheet.add')}
              onPress={() => add(parseInt(custom, 10))}
              disabled={!parseInt(custom, 10)}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.md,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: Spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.md },
  title: { fontSize: 20, fontWeight: '700' },
  quickRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  quick: {
    flex: 1,
    alignItems: 'center',
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    minHeight: 64,
  },
  quickValue: { fontSize: 22, fontWeight: '800' },
  customLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  customRow: { flexDirection: 'row', gap: Spacing.sm },
  input: {
    width: 110,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
});
