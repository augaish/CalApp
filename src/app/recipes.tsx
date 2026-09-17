import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { generateRecipe } from '@/lib/api';
import { aiFailureAction } from '@/lib/api-errors';
import { useEntitlement } from '@/lib/entitlement';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { resolveIngredientKey } from '@/lib/ingredients';
import { perServing, roundMacros } from '@/lib/recipes';
import { useAppStore } from '@/lib/store';
import type { Recipe } from '@/lib/types';

/** A few starting points, so an empty box is not the first thing you meet. */
const SUGGESTIONS = ['recipes.ideaHighProtein', 'recipes.ideaQuick', 'recipes.ideaGulf'] as const;

/** Show the filter box only once scrolling is the alternative. */
const SEARCH_FROM = 5;

/**
 * Favourites first, then newest. A library you cook from is a few things you
 * make constantly plus a pile of experiments, and strict newest-first buries
 * the ones worth keeping under the ones you tried once.
 */
function libraryOrder(a: Recipe, b: Recipe): number {
  if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
  return b.createdAt.localeCompare(a.createdAt);
}

function matches(r: Recipe, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    r.name.toLowerCase().includes(q) ||
    r.ingredients.some((i) => i.name.toLowerCase().includes(q))
  );
}

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

  // Opened as a picker for one planned slot, rather than as a plain library.
  const { day, slot } = useLocalSearchParams<{ day?: string; slot?: string }>();
  const planTarget = day && slot ? `&day=${encodeURIComponent(day)}&slot=${encodeURIComponent(slot)}` : '';

  const recipes = useAppStore((s) => s.recipes);
  const addRecipe = useAppStore((s) => s.addRecipe);
  const updateRecipe = useAppStore((s) => s.updateRecipe);
  const [request, setRequest] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'review'>('all');
  const [busy, setBusy] = useState(false);

  const library = [...recipes].sort(libraryOrder);
  const needsReview = library.filter((r) => r.reviewStatus === 'needs_review').length;
  const shown = library.filter(
    (r) =>
      matches(r, query) &&
      (filter === 'all' || (filter === 'favorites' ? !!r.favorite : r.reviewStatus === 'needs_review')),
  );

  const create = async (text: string) => {
    const ask = text.trim();
    if (ask.length < 2 || busy) return;
    setBusy(true);
    try {
      const written = await generateRecipe(ask, lang);
      // The model's `key` is a hint, not a guarantee — the same onion comes
      // back spelled four ways across generations. Resolve every ingredient
      // against the local table BEFORE saving, so a shopping list merges on
      // a stable identity rather than on whatever the model typed that time.
      const id = addRecipe({
        ...written,
        ingredients: written.ingredients.map((i) => ({
          ...i,
          key: resolveIngredientKey(i.name, i.key),
        })),
        language: lang,
        source: 'ai',
        // Saved on arrival so a retry can never charge twice; a draft until
        // someone has looked at it (S09).
        reviewStatus: 'needs_review',
      });
      successHaptic();
      setRequest('');
      router.push(`/recipe?id=${encodeURIComponent(id)}${planTarget}`);
    } catch (err) {
      // This screen used to collapse every failure into "Something went
      // wrong. Please try again." — vague, and wrong for most of them, since
      // retrying cannot refill a spent allowance or put credit in an empty AI
      // account. The rule for what to say lives in aiFailureAction, where it
      // can be tested; Alert.alert is a no-op on web and cannot be.
      const action = aiFailureAction(err, {
        titleKey: 'recipes.unusableTitle',
        bodyKey: 'recipes.unusableBody',
      });
      if (action.kind === 'upgrade') {
        useEntitlement.getState().refresh();
        router.push(`/upgrade?reason=${action.reason}`);
        return;
      }
      Alert.alert(t(action.titleKey), t(action.bodyKey, action.values));
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = (r: Recipe) => {
    updateRecipe(r.id, { favorite: !r.favorite });
    lightHaptic();
  };

  return (
    <Screen>
      <Title>{t('recipes.title')}</Title>

      {/* The library comes first once there is one. Leading with the
          generator framed a recipe as something you spend a credit on every
          time you want dinner, when the whole point is that what you already
          have costs nothing to reopen. With nothing saved yet the generator
          is still the first thing you meet, because an empty list is not an
          invitation. */}
      {library.length > 0 && (
        <>
          {library.length >= SEARCH_FROM && (
            <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="search" size={16} color={theme.textTertiary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('recipes.searchPlaceholder')}
                placeholderTextColor={theme.textTertiary}
                style={{ flex: 1, color: theme.text, fontSize: 15, padding: 0 }}
                maxLength={60}
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={theme.textTertiary} />
                </Pressable>
              )}
            </View>
          )}

          {/* All / Favourites / Needs review. "Calgym originals" waits for a
              reviewed starter collection to exist (section 15); a filter over
              nothing would be an inert control. */}
          <View style={styles.filters}>
            {(['all', 'favorites', ...(needsReview > 0 ? (['review'] as const) : [])] as const).map((f) => {
              const on = filter === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.filter, { backgroundColor: on ? theme.primary : theme.cardSubtle }]}
                >
                  <Text style={{ color: on ? theme.onPrimary : theme.textSecondary, fontSize: 12, fontWeight: '700' }}>
                    {f === 'all' ? t('recipes.filterAll') : f === 'favorites' ? t('recipes.filterFavorites') : t('recipes.filterReview', { n: needsReview })}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6 }]}>
            {t('recipes.saved')}
          </Text>

          {shown.map((r) => {
            const m = roundMacros(perServing(r));
            return (
              <Pressable
                key={r.id}
                onPress={() => router.push(`/recipe?id=${encodeURIComponent(r.id)}${planTarget}`)}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  cardShadow(theme.shadow),
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: theme.text, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
                      {r.name}
                    </Text>
                    {r.reviewStatus === 'needs_review' && (
                      <View style={[styles.pill, { backgroundColor: theme.cardSubtle }]}>
                        <Text style={{ color: theme.warning, fontSize: 10, fontWeight: '800' }}>{t('recipes.needsReview')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                    {t('recipes.perServingShort', { kcal: m.calories, protein: m.proteinG })}
                    {' · '}
                    {t('recipes.servingsCount', { count: r.servings })}
                  </Text>
                </View>
                {/* Its own hit area, so keeping a recipe never opens it and
                    opening one never keeps it. */}
                <Pressable
                  onPress={() => toggleFavorite(r)}
                  hitSlop={10}
                  accessibilityLabel={t(r.favorite ? 'recipes.unfavorite' : 'recipes.favorite')}
                >
                  <Ionicons
                    name={r.favorite ? 'heart' : 'heart-outline'}
                    size={19}
                    color={r.favorite ? theme.protein : theme.textTertiary}
                  />
                </Pressable>
                <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
              </Pressable>
            );
          })}

          {shown.length === 0 && (
            <Text style={{ color: theme.textTertiary, marginBottom: Spacing.md }}>
              {t('recipes.noMatches', { query: query.trim() })}
            </Text>
          )}
        </>
      )}

      <Card style={{ gap: Spacing.sm, marginTop: library.length > 0 ? Spacing.md : 0 }}>
        <Text style={{ color: theme.text, fontWeight: '700' }}>{t('recipes.writeNew')}</Text>
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
        {/* No AI, no network: the dishes nobody needs a model to describe, and
            the route that keeps the journey alive when generation is down. */}
        <Button label={t('recipes.addMine')} variant="secondary" icon="create-outline" onPress={() => router.push('/recipe-edit')} />
      </Card>

      {library.length === 0 && (
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
  filters: { flexDirection: 'row', gap: 6, marginBottom: Spacing.sm },
  filter: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full },
  pill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: Spacing.sm,
  },
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
