import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { generateRecipe, QuotaError } from '@/lib/api';
import { successHaptic } from '@/lib/feedback';
import { perServing, roundMacros } from '@/lib/recipes';
import { useAppStore } from '@/lib/store';

/** A few starting points, so an empty box is not the first thing you meet. */
const SUGGESTIONS = ['recipes.ideaHighProtein', 'recipes.ideaQuick', 'recipes.ideaGulf'] as const;

/**
 * Saved recipes, and the one box that makes a new one.
 *
 * Everything generated is stored, so opening a recipe again never costs
 * another AI call — the cost is in writing it, not in reading it back.
 */
export default function Recipes() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();

  const recipes = useAppStore((s) => s.recipes);
  const addRecipe = useAppStore((s) => s.addRecipe);
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (text: string) => {
    const ask = text.trim();
    if (ask.length < 2 || busy) return;
    setBusy(true);
    try {
      const written = await generateRecipe(ask, lang);
      const id = addRecipe({ ...written, language: lang, source: 'ai' });
      successHaptic();
      setRequest('');
      router.push(`/recipe?id=${encodeURIComponent(id)}`);
    } catch (err) {
      if (err instanceof QuotaError) Alert.alert(t('upgrade.quotaTitle'), t('upgrade.quotaBody'));
      else Alert.alert(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{t('recipes.title')}</Title>

      <Card style={{ gap: Spacing.sm }}>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('recipes.askBody')}</Text>
        <View style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <TextInput
            value={request}
            onChangeText={setRequest}
            placeholder={t('recipes.askPlaceholder')}
            placeholderTextColor={theme.textTertiary}
            style={{ flex: 1, color: theme.text, fontSize: 15, padding: 0 }}
            maxLength={200}
            multiline
          />
        </View>
        <View style={styles.chips}>
          {SUGGESTIONS.map((key) => (
            <Pressable
              key={key}
              onPress={() => setRequest(t(key))}
              style={({ pressed }) => [
                styles.chip,
                { borderColor: theme.border, backgroundColor: theme.cardSubtle },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>{t(key)}</Text>
            </Pressable>
          ))}
        </View>
        <Button
          label={t('recipes.write')}
          icon="sparkles"
          loading={busy}
          onPress={() => create(request)}
          disabled={request.trim().length < 2}
        />
      </Card>

      {recipes.length > 0 && (
        <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>
          {t('recipes.saved')}
        </Text>
      )}

      {recipes.map((r) => {
        const m = roundMacros(perServing(r));
        return (
          <Pressable
            key={r.id}
            onPress={() => router.push(`/recipe?id=${encodeURIComponent(r.id)}`)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.card, borderColor: theme.border },
              cardShadow(theme.shadow),
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '700' }} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                {t('recipes.perServingShort', { kcal: m.calories, protein: m.proteinG })}
                {' · '}
                {t('recipes.servingsCount', { count: r.servings })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </Pressable>
        );
      })}

      {recipes.length === 0 && (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="restaurant-outline" size={30} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>{t('recipes.empty')}</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.md, minHeight: 64 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 7 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.sm,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
});
