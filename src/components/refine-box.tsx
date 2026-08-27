import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, FeatureLockedError, QuotaError, refineMeal } from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import type { FoodItem, MealAnalysis } from '@/lib/types';

/**
 * A one-line correction box for a meal already estimated — on the fresh-scan
 * confirmation screen and on an already-logged meal being reopened alike.
 * Sends whatever's currently on screen (not the original photo) plus the
 * correction message, and hands the corrected item list back to the caller
 * to apply — this component never saves anything itself.
 */
export function RefineBox({
  items,
  onResult,
}: {
  items: FoodItem[];
  onResult: (analysis: MealAnalysis) => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = message.trim();
    if (!text || loading || items.length === 0) return;
    lightHaptic();
    setLoading(true);
    setError(null);
    try {
      const language = i18n.language === 'ar' ? 'ar' : 'en';
      const result = await refineMeal(items, text, language);
      onResult(result);
      setMessage('');
      successHaptic();
    } catch (err) {
      if (err instanceof QuotaError || err instanceof FeatureLockedError) {
        useEntitlement.getState().refresh();
        router.push(`/upgrade?reason=${err instanceof QuotaError ? 'quota' : 'coach'}`);
      } else if (err instanceof ApiError) {
        setError(t('refine.error'));
      } else {
        setError(t('refine.offline'));
      }
    } finally {
      setLoading(false);
    }
  };

  const canSend = !!message.trim() && !loading;

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, { backgroundColor: theme.cardSubtle, borderColor: theme.border }]}>
        <TextInput
          value={message}
          onChangeText={(v) => {
            setMessage(v);
            if (error) setError(null);
          }}
          placeholder={t('refine.placeholder')}
          placeholderTextColor={theme.textTertiary}
          style={[styles.input, { color: theme.text }]}
          editable={!loading}
          returnKeyType="send"
          onSubmitEditing={send}
          multiline
        />
        <Pressable onPress={send} disabled={!canSend} hitSlop={8} style={styles.sendBtn}>
          {loading ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Ionicons name="arrow-up-circle" size={30} color={canSend ? theme.primary : theme.textTertiary} />
          )}
        </Pressable>
      </View>
      {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingStart: Spacing.md,
    paddingEnd: Spacing.xs,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  input: { flex: 1, fontSize: 14, maxHeight: 80, paddingVertical: 6 },
  sendBtn: { padding: 4 },
  error: { fontSize: 12, marginTop: 4, marginStart: 4 },
});
