import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';

import { Button, Screen, Subtitle, Title } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { analyzeText, isMockMode, QuotaError } from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import { usePending } from '@/lib/pending';
import { useAppStore } from '@/lib/store';

export default function Describe() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const language = useAppStore((s) => s.language) ?? 'en';
  const setMeal = usePending((s) => s.setMeal);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const analyze = async () => {
    if (text.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      const analysis = await analyzeText(text.trim(), language);
      useEntitlement.getState().spend();
      setMeal(analysis, null);
      router.replace('/meal-result');
    } catch (err) {
      if (err instanceof QuotaError) {
        useEntitlement.getState().refresh();
        router.replace('/upgrade?reason=quota');
        return;
      }
      Alert.alert(t('common.error'));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        scroll={false}
        footer={
          <View>
            <Button
              label={t('describe.analyze')}
              icon="sparkles"
              onPress={analyze}
              loading={busy}
              disabled={text.trim().length < 3}
            />
            <Button
              label={t('common.cancel')}
              variant="ghost"
              onPress={() => router.back()}
              style={{ marginTop: Spacing.xs }}
            />
          </View>
        }
      >
        <Title>{t('describe.title')}</Title>
        <Subtitle>{t('describe.tip')}</Subtitle>
        {isMockMode && <Subtitle>{t('scan.mockBadge')}</Subtitle>}
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('describe.placeholder')}
          placeholderTextColor={theme.textTertiary}
          multiline
          autoFocus
          maxLength={500}
          style={[
            styles.input,
            { backgroundColor: theme.card, borderColor: theme.border, color: theme.text },
          ]}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: 17,
    minHeight: 120,
    textAlignVertical: 'top',
  },
});
