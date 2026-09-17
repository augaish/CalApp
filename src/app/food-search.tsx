import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { illustrationFor, PhotoFallback } from '@/components/photo-fallback';
import { EmptyState, IconTile, InfoLine, SearchField, StatusPill } from '@/components/system';
import { Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic } from '@/lib/feedback';
import { pastFoods, suggestFoods } from '@/lib/food-history';
import { usePending } from '@/lib/pending';
import { perServing } from '@/lib/recipes';
import { useAppStore } from '@/lib/store';
import { useAllRecipes } from '@/lib/use-recipes';

/** Same folding as the history search so Arabic spellings match either way. */
function fold(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[آأإ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

/**
 * S29 entry — Search food. Searches what this person has already logged and
 * their recipe library (Calgym originals included). A history hit opens the
 * manual form pre-filled for review; a recipe opens Log eaten. A public
 * catalogue search is a separate service dependency (an Open Food Facts
 * text-search proxy on our server) that is not connected yet, and the empty
 * state says so instead of pretending to search the world.
 */
export default function FoodSearch() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();
  const meals = useAppStore((s) => s.meals);
  const recipes = useAllRecipes();
  const [query, setQuery] = useState('');

  const history = useMemo(() => pastFoods(meals), [meals]);
  const q = fold(query);
  const foods = useMemo(() => (q.length >= 2 ? suggestFoods(history, query, 12) : history.slice(0, 8)), [history, query, q.length]);
  const matchedRecipes = useMemo(() => (q.length >= 2 ? recipes.filter((r) => fold(r.name).includes(q)).slice(0, 8) : []), [recipes, q]);
  const nothing = q.length >= 2 && foods.length === 0 && matchedRecipes.length === 0;

  return (
    <Screen header={<PageHeader title={t('foodSearch.title')} variant="plain" close />}>
      <SearchField value={query} onChangeText={setQuery} placeholder={t('foodSearch.placeholder')} clearLabel={t('common.close')} autoFocus />
      {q.length < 2 && history.length > 0 && (
        <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>{t('foodSearch.recent')}</Text>
      )}
      {q.length >= 2 && foods.length > 0 && (
        <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>{t('foodSearch.fromHistory')}</Text>
      )}

      {foods.map((item, i) => (
        <Pressable
          key={`${item.name}-${i}`}
          onPress={() => {
            lightHaptic();
            usePending.getState().setFoodDraft(item);
            router.replace('/food-edit');
          }}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${Math.round(item.calories)} ${t('common.kcal')}`}
          style={({ pressed }) => [styles.row, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.7 }]}
        >
          <IconTile icon="time-outline" size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={1}>
              {item.portion ? `${item.portion} · ` : ''}
              {Math.round(item.calories).toLocaleString(locale)} {t('common.kcal')}
            </Text>
          </View>
          {item.basePer100 && <StatusPill label={t('foodEdit.per100')} tone="neutral" />}
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </Pressable>
      ))}

      {matchedRecipes.length > 0 && (
        <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>{t('foodSearch.recipes')}</Text>
      )}
      {matchedRecipes.map((r) => {
        const ps = perServing(r);
        return (
          <Pressable
            key={r.id}
            onPress={() => {
              lightHaptic();
              router.replace(`/log-portion?recipeId=${encodeURIComponent(r.id)}`);
            }}
            accessibilityRole="button"
            accessibilityLabel={r.name}
            style={({ pressed }) => [styles.row, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.7 }]}
          >
            <PhotoFallback uri={r.photoUri} illustration={illustrationFor(r.name)} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={1}>
                {Math.round(ps.calories).toLocaleString(locale)} {t('common.kcal')} · {t('recipe.perServing')}
              </Text>
            </View>
            {r.source === 'calgym' && <StatusPill label={t('recipes.calgymLabel')} tone="planned" />}
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </Pressable>
        );
      })}

      {nothing && (
        <View style={{ marginTop: Spacing.md }}>
          <EmptyState
            icon="search-outline"
            title={t('foodSearch.emptyTitle', { query: query.trim() })}
            body={t('foodSearch.emptyBody')}
            action={{
              label: t('foodSearch.enterManually'),
              icon: 'pencil',
              onPress: () => {
                usePending.getState().setFoodDraft({ name: query.trim(), portion: '', calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
                router.replace('/food-edit');
              },
            }}
            secondary={{ label: t('foodSearch.scanBarcode'), icon: 'barcode-outline', onPress: () => router.replace('/scan?mode=barcode') }}
          />
        </View>
      )}
      {q.length < 2 && history.length === 0 && (
        <View style={{ marginTop: Spacing.md }}>
          <EmptyState
            icon="search-outline"
            title={t('foodSearch.noHistoryTitle')}
            body={t('foodSearch.noHistoryBody')}
            action={{ label: t('foodSearch.enterManually'), icon: 'pencil', onPress: () => router.replace('/food-edit') }}
            secondary={{ label: t('foodSearch.scanBarcode'), icon: 'barcode-outline', onPress: () => router.replace('/scan?mode=barcode') }}
          />
        </View>
      )}

      <InfoLine>{t('foodSearch.catalogueNote')}</InfoLine>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.control, padding: Spacing.ms, marginBottom: Spacing.sm },
});
