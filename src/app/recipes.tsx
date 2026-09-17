import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BrandHeader } from '@/components/brand-header';
import { illustrationFor, PhotoFallback } from '@/components/photo-fallback';
import { ActionButton, Chip, EmptyState, SearchField, StatusPill } from '@/components/system';
import { Button, Screen } from '@/components/ui';
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
import { ensureRecipeInStore, useAllRecipes } from '@/lib/use-recipes';

/** A few starting points, so an empty box is not the first thing you meet. */
const SUGGESTIONS = ['recipes.ideaHighProtein', 'recipes.ideaQuick', 'recipes.ideaGulf'] as const;

type Filter = 'all' | 'calgym' | 'mine' | 'favorites' | 'review';

/**
 * Favourites first, then the person's own newest-first, then the starters.
 * A library you cook from is a few things you make constantly plus a pile
 * of experiments; strict newest-first buries the ones worth keeping.
 */
function libraryOrder(a: Recipe, b: Recipe): number {
  if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
  const aStarter = a.source === 'calgym';
  const bStarter = b.source === 'calgym';
  if (aStarter !== bStarter) return aStarter ? 1 : -1;
  return b.createdAt.localeCompare(a.createdAt);
}

/** Matches the localized title and the canonical ingredient identity (C12). */
function matches(r: Recipe, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qKey = resolveIngredientKey(q);
  return (
    r.name.toLowerCase().includes(q) ||
    r.ingredients.some((i) => i.name.toLowerCase().includes(q) || (qKey && i.key === qKey))
  );
}

/**
 * S09 Recipe library — a populated Calgym collection and the person's own,
 * in one All view with Calgym / My recipes / Favourites filters. Search is
 * there from the start. Saved recipes open from local data; nothing here
 * costs a generation. Create with AI saves a complete result once, as
 * Needs review; Add my recipe needs no AI at all.
 */
export default function Recipes() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();

  // Opened as a picker for one planned slot, rather than as a plain library.
  const { day, slot } = useLocalSearchParams<{ day?: string; slot?: string }>();
  const planTarget = day && slot ? `&day=${encodeURIComponent(day)}&slot=${encodeURIComponent(slot)}` : '';

  const recipes = useAllRecipes();
  const addRecipe = useAppStore((s) => s.addRecipe);
  const updateRecipe = useAppStore((s) => s.updateRecipe);
  const [request, setRequest] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const library = [...recipes].sort(libraryOrder);
  const needsReview = library.filter((r) => r.reviewStatus === 'needs_review').length;
  const mine = library.filter((r) => r.source !== 'calgym');
  const shown = library.filter((r) => {
    if (!matches(r, query)) return false;
    switch (filter) {
      case 'calgym':
        return r.source === 'calgym';
      case 'mine':
        return r.source !== 'calgym';
      case 'favorites':
        return !!r.favorite;
      case 'review':
        return r.reviewStatus === 'needs_review';
      default:
        return true;
    }
  });

  const create = async (text: string) => {
    const ask = text.trim();
    if (ask.length < 2 || busy) return;
    setBusy(true);
    try {
      const written = await generateRecipe(ask, lang);
      // Resolve every ingredient against the local table BEFORE saving, so a
      // shopping list merges on a stable identity, not on the model's spelling.
      const id = addRecipe({
        ...written,
        ingredients: written.ingredients.map((i) => ({ ...i, key: resolveIngredientKey(i.name, i.key) })),
        language: lang,
        source: 'ai',
        // Saved on arrival so a retry can never charge twice; a draft until
        // someone has looked at it (S09).
        reviewStatus: 'needs_review',
      });
      successHaptic();
      setRequest('');
      setCreating(false);
      router.push(`/recipe?id=${encodeURIComponent(id)}${planTarget}`);
    } catch (err) {
      // The rule for what to say lives in aiFailureAction, where it is tested.
      const action = aiFailureAction(err, { titleKey: 'recipes.unusableTitle', bodyKey: 'recipes.unusableBody' });
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

  // A favourite is a reference; keeping a starter copies it privately first.
  const toggleFavorite = (r: Recipe) => {
    const stored = ensureRecipeInStore(r.id, lang);
    if (!stored) return;
    updateRecipe(r.id, { favorite: !stored.favorite });
    lightHaptic();
  };

  const minutes = (r: Recipe) => (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t('recipes.filterAll') },
    { key: 'calgym', label: t('recipes.filterCalgym') },
    { key: 'mine', label: t('recipes.filterMine') },
    { key: 'favorites', label: t('recipes.filterFavorites') },
    ...(needsReview > 0 ? [{ key: 'review' as Filter, label: t('recipes.filterReview', { n: needsReview }) }] : []),
  ];

  return (
    <Screen
      header={<BrandHeader title={t('common.appName')} />}
      footer={
        <View>
          <View style={styles.footerRow}>
            <Button label={t('recipes.createWithAi')} icon="sparkles" onPress={() => setCreating((v) => !v)} style={{ flex: 1 }} />
            <Button label={t('recipes.addMineShort')} icon="add" variant="secondary" onPress={() => router.push('/recipe-edit')} style={{ flex: 1 }} />
          </View>
          <Text style={{ color: theme.textTertiary, fontSize: 12, textAlign: 'center', marginTop: 6 }}>{t('recipes.savedNote')}</Text>
        </View>
      }
    >
      <Text style={[Type.title, { color: theme.text }]}>{t('recipes.title')}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 15, marginBottom: Spacing.ms }}>{t('recipes.subtitle')}</Text>

      <SearchField value={query} onChangeText={setQuery} placeholder={t('recipes.searchPlaceholder')} clearLabel={t('common.close')} />
      <View style={styles.filters}>
        {filters.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </View>

      {creating && (
        <View style={[styles.aiCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{t('recipes.writeNew')}</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('recipes.askBody')}</Text>
          <View style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <TextInput
              value={request}
              onChangeText={setRequest}
              placeholder={t('recipes.askPlaceholder')}
              placeholderTextColor={theme.textTertiary}
              accessibilityLabel={t('recipes.askPlaceholder')}
              style={{ flex: 1, color: theme.text, fontSize: 15, padding: 0 }}
              maxLength={200}
              multiline
              autoFocus
            />
          </View>
          <View style={styles.chips}>
            {SUGGESTIONS.map((key) => (
              <Chip key={key} label={t(key)} selected={request === t(key)} onPress={() => setRequest(t(key))} />
            ))}
          </View>
          <View style={styles.footerRow}>
            <ActionButton label={t('recipes.write')} icon="sparkles" onPress={() => create(request)} disabled={busy || request.trim().length < 2} style={{ flex: 1 }} />
            <ActionButton label={t('common.cancel')} variant="secondary" onPress={() => setCreating(false)} />
          </View>
          {busy && <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{t('recipes.writing')}</Text>}
          <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('recipes.draftNote')}</Text>
        </View>
      )}

      {shown.map((r) => {
        const m = roundMacros(perServing(r));
        const mins = minutes(r);
        return (
          <Pressable
            key={r.id}
            onPress={() => router.push(`/recipe?id=${encodeURIComponent(r.id)}${planTarget}`)}
            accessibilityRole="button"
            accessibilityLabel={r.name}
            style={({ pressed }) => [styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.8 }]}
          >
            <PhotoFallback uri={r.photoUri} illustration={illustrationFor(r.name)} size={88} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17 }} numberOfLines={2}>
                {r.name}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                {mins > 0 ? `${t('recipes.minutes', { n: mins })} · ` : ''}
                {t('recipes.servingsCount', { count: r.servings })}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }} numberOfLines={2}>
                {r.description || t('recipes.perServingShort', { kcal: m.calories, protein: m.proteinG })}
              </Text>
              <View style={styles.pills}>
                {r.source === 'calgym' && <StatusPill label={t('recipes.calgymLabel')} tone="neutral" />}
                {r.reviewStatus === 'needs_review' && <StatusPill label={t('recipe.needsReviewTitle')} tone="review" />}
              </View>
            </View>
            {/* Its own hit area: keeping a recipe never opens it. */}
            <Pressable
              onPress={() => toggleFavorite(r)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t(r.favorite ? 'recipes.unfavorite' : 'recipes.favorite')}
              accessibilityState={{ selected: !!r.favorite }}
              style={styles.heart}
            >
              <Ionicons name={r.favorite ? 'heart' : 'heart-outline'} size={24} color={r.favorite ? theme.primary : theme.textTertiary} />
            </Pressable>
          </Pressable>
        );
      })}

      {shown.length === 0 && (
        <EmptyState
          icon="restaurant-outline"
          title={query.trim() ? t('recipes.noMatches', { query: query.trim() }) : filter === 'mine' ? t('recipes.mineEmptyTitle') : t('recipes.noneInFilter')}
          body={filter === 'mine' && !query.trim() ? t('recipes.mineEmpty') : undefined}
          action={filter === 'mine' && !query.trim() ? { label: t('recipes.addMine'), icon: 'add', onPress: () => router.push('/recipe-edit') } : undefined}
          secondary={filter === 'mine' && !query.trim() ? { label: t('recipes.createWithAi'), icon: 'sparkles', onPress: () => setCreating(true) } : undefined}
          compact
        />
      )}
      {mine.length === 0 && filter === 'all' && !query.trim() && (
        <Text style={{ color: theme.textTertiary, fontSize: 12, textAlign: 'center', marginTop: Spacing.sm }}>{t('recipes.startersNote')}</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.ms, marginBottom: Spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.module, padding: Spacing.ms, marginBottom: Spacing.ms },
  pills: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  heart: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  aiCard: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.md, gap: Spacing.sm },
  input: { borderWidth: 1, borderRadius: Radius.control, padding: Spacing.ms, minHeight: 64 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  footerRow: { flexDirection: 'row', gap: Spacing.sm },
});
