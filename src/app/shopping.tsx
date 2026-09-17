import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { ActionButton, Chip, EmptyState, IconTile, Segmented, SettingsRow } from '@/components/system';
import { Button, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { servingCountLabel, servingPluralCount } from '@/lib/recipes';
import {
  buildShoppingLines,
  byAisle,
  cookPlans,
  lineStatus,
  shoppingAmountLabel,
  shoppingListText,
  type ShoppingLine,
} from '@/lib/shopping';
import { datesBetween, dateKey, plannedRecipeMealsBetween, useAppStore } from '@/lib/store';
import { useAllRecipes } from '@/lib/use-recipes';

/** The window a shop is worth planning over. Module-level so the clock is
 * never read during render. */
function defaultRange(days: number): { fromKey: string; toKey: string } {
  const start = new Date();
  const end = new Date(start);
  end.setDate(start.getDate() + days - 1);
  return { fromKey: dateKey(start), toKey: dateKey(end) };
}

const RANGES = [3, 7, 14] as const;
const AISLE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  produce: 'leaf-outline',
  meat: 'fish-outline',
  dairy: 'water-outline',
  bakery: 'cafe-outline',
  pantry: 'basket-outline',
  frozen: 'snow-outline',
  spices: 'flask-outline',
  other: 'cube-outline',
};

/** A dateKey is "year-monthIndex-day" and is not something to show a person. */
function readableDate(key: string, locale: string): string {
  const day = datesBetween(key, key)[0];
  return day ? day.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : key;
}

/**
 * S12 Shopping — one trip, built from the recipes standing on the plan.
 *
 * Only decisions are stored (bought amounts, have-at-home, batch groups);
 * every quantity is recomputed from the plan each time this opens. That is
 * what lets the plan change underneath without throwing away an afternoon's
 * ticking — and what makes it possible to say "300 g more needed" instead of
 * quietly treating a grown amount as bought.
 */
export default function Shopping() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();

  const recipes = useAllRecipes();
  const mealPlanRecipes = useAppStore((s) => s.mealPlanRecipes);
  const mealPlan = useAppStore((s) => s.activeProgram?.mealPlan);
  const activeProgramId = useAppStore((s) => s.activeProgram?.id);
  const shopping = useAppStore((s) => s.shopping);
  const startShopping = useAppStore((s) => s.startShopping);
  const setShoppingChecked = useAppStore((s) => s.setShoppingChecked);
  const setShoppingHave = useAppStore((s) => s.setShoppingHave);
  const setShoppingOneBatch = useAppStore((s) => s.setShoppingOneBatch);

  const [rangeDays, setRangeDays] = useState<number>(7);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view, setView] = useState<'buy' | 'have'>('buy');
  const [showBatch, setShowBatch] = useState(false);
  const [pickingRange, setPickingRange] = useState(false);

  // The trip in progress, or the default window until one is started.
  const range = shopping ?? defaultRange(rangeDays);

  const { meals, plannedTotal } = useMemo(
    () => plannedRecipeMealsBetween(range.fromKey, range.toKey, mealPlanRecipes, recipes, mealPlan, activeProgramId),
    [range.fromKey, range.toKey, mealPlanRecipes, recipes, mealPlan, activeProgramId],
  );

  const plans = useMemo(() => cookPlans(meals, shopping?.oneBatch ?? {}), [meals, shopping?.oneBatch]);
  const lines = useMemo(() => buildShoppingLines(plans), [plans]);
  const groups = useMemo(() => byAisle(lines), [lines]);

  const checkedAt = shopping?.checkedAt ?? {};
  const have = shopping?.have ?? {};
  const statusOf = (line: ShoppingLine) => lineStatus(line, have, checkedAt);
  const isOpen = (line: ShoppingLine) => {
    const s = statusOf(line).kind;
    return s === 'todo' || s === 'shortfall';
  };
  const toBuy = lines.filter(isOpen);
  const bought = lines.filter((l) => !isOpen(l));
  const shownGroups = groups
    .map((g) => ({ aisle: g.aisle, lines: g.lines.filter((l) => (view === 'buy' ? isOpen(l) : !isOpen(l))) }))
    .filter((g) => g.lines.length > 0);

  const share = () => {
    const text = shoppingListText(
      groups,
      { title: t('shopping.shareTitle'), aisle: (a) => t(`shopping.aisles.${a}`) },
      (line) => statusOf(line).kind === 'have',
    );
    if (text) void Share.share({ message: text });
  };

  const started = !!shopping;
  const missing = plannedTotal - meals.length;
  const rangeLabel = t('shopping.rangeLabel', { from: readableDate(range.fromKey, locale), to: readableDate(range.toKey, locale) });

  return (
    <Screen
      header={<PageHeader title={t('shopping.title')} />}
      footer={
        started ? (
          <Button label={t('shopping.share')} icon="share-outline" onPress={share} />
        ) : meals.length === 0 ? (
          // The empty state already carries the one prerequisite action.
          null
        ) : (
          <Button
            label={t('shopping.create')}
            icon="cart"
            onPress={() => {
              const r = defaultRange(rangeDays);
              startShopping(r.fromKey, r.toKey);
              successHaptic();
            }}
          />
        )
      }
    >
      {/* Which dates. Before a list starts the range is a choice; after, a fact. */}
      <Pressable
        onPress={() => !started && setPickingRange((v) => !v)}
        disabled={started}
        accessibilityRole={started ? undefined : 'button'}
        style={({ pressed }) => [styles.rowCard, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.8 }]}
      >
        <IconTile icon="calendar-outline" />
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16, flex: 1 }}>{rangeLabel}</Text>
        {!started && <Ionicons name={pickingRange ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textTertiary} />}
      </Pressable>
      {!started && pickingRange && (
        <View style={styles.chips}>
          {RANGES.map((d) => (
            <Chip
              key={d}
              label={t('shopping.nextDays', { count: d })}
              selected={rangeDays === d}
              onPress={() => {
                lightHaptic();
                setRangeDays(d);
                setPickingRange(false);
              }}
            />
          ))}
        </View>
      )}

      {/* Coverage — a list is only trustworthy if you know which meals it came from. */}
      {meals.length > 0 && (
      <View style={[styles.rowCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
        <IconTile icon="document-text-outline" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>
            {t('shopping.coverageShort', { withRecipe: meals.length, planned: plannedTotal })}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
            {plannedTotal === 0 ? t('shopping.empty') : missing > 0 ? t('shopping.addRecipesHint', { n: missing }) : t('shopping.coverageComplete')}
          </Text>
        </View>
        {/* One next action for the state you are in (S12/J05). */}
        {plannedTotal === 0 ? (
          <Pressable onPress={() => router.push('/food?tab=plan')} accessibilityRole="button" hitSlop={6}>
            <Text style={styles.link(theme.primary)}>{t('shopping.planMeals')}</Text>
          </Pressable>
        ) : missing > 0 ? (
          <Pressable onPress={() => router.push('/food?tab=plan')} accessibilityRole="button" hitSlop={6}>
            <Text style={styles.link(theme.primary)}>{t('shopping.addRecipes', { n: missing })}</Text>
          </Pressable>
        ) : null}
      </View>
      )}

      {meals.length === 0 ? (
        <EmptyState
          icon="cart-outline"
          title={t('shopping.emptyTitle')}
          body={t('shopping.empty')}
          action={{ label: plannedTotal === 0 ? t('shopping.planMeals') : t('shopping.addRecipes', { n: missing }), icon: 'calendar-outline', onPress: () => router.push('/food?tab=plan') }}
        />
      ) : (
        <>
          {started && (
            <Segmented
              options={[
                { key: 'buy', label: `${t('shopping.toBuyTab')}${toBuy.length ? ` · ${toBuy.length}` : ''}` },
                { key: 'have', label: `${t('shopping.haveTab')}${bought.length ? ` · ${bought.length}` : ''}` },
              ]}
              value={view}
              onChange={setView}
              style={{ marginBottom: Spacing.md }}
            />
          )}

          {started &&
            shownGroups.map((group) => (
              <View key={group.aisle} style={[styles.groupCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
                <View style={[styles.groupHead, { borderBottomColor: theme.border }]}>
                  <Ionicons name={AISLE_ICON[group.aisle] ?? 'cube-outline'} size={18} color={theme.primary} />
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{t(`shopping.aisles.${group.aisle}`)}</Text>
                </View>
                {group.lines.map((line, i) => {
                  const status = statusOf(line);
                  const done = status.kind === 'done';
                  const owned = status.kind === 'have';
                  const open = expanded === line.key;
                  const boughtFor = checkedAt[line.key];
                  return (
                    <View key={line.key} style={[i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                      <View style={styles.itemRow}>
                        <Pressable
                          onPress={() => {
                            lightHaptic();
                            setShoppingChecked(line.key, done || owned ? null : line.amount);
                          }}
                          hitSlop={8}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: done || owned }}
                          accessibilityLabel={line.name}
                          style={styles.checkbox}
                        >
                          <Ionicons name={done || owned ? 'checkbox' : 'square-outline'} size={26} color={done || owned ? theme.primary : theme.textTertiary} />
                        </Pressable>
                        <Pressable style={{ flex: 1 }} onPress={() => setExpanded(open ? null : line.key)} accessibilityRole="button">
                          <Text
                            style={{
                              color: done || owned ? theme.textTertiary : theme.text,
                              fontWeight: '700',
                              fontSize: 15,
                              textDecorationLine: owned ? 'line-through' : 'none',
                            }}
                          >
                            {line.name}
                            {line.state === 'cooked' ? ` · ${t('shopping.cooked')}` : ''}
                          </Text>
                          {status.kind === 'shortfall' ? (
                            // Ticked, but the plan has grown. Saying so is the
                            // whole point — otherwise you get home short.
                            <>
                              <Text style={{ color: theme.warningText, fontSize: 13, fontWeight: '700' }}>
                                {t('shopping.moreNeeded', { amount: shoppingAmountLabel({ amount: status.extra, unit: line.unit }) })}
                              </Text>
                              <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                                {t('shopping.boughtRequired', {
                                  bought: shoppingAmountLabel({ amount: boughtFor ?? 0, unit: line.unit }),
                                  required: shoppingAmountLabel(line),
                                })}
                              </Text>
                            </>
                          ) : (
                            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                              {done
                                ? t('shopping.boughtRequired', { bought: shoppingAmountLabel({ amount: boughtFor ?? line.amount, unit: line.unit }), required: shoppingAmountLabel(line) })
                                : owned
                                  ? t('shopping.haveAtHome')
                                  : t('shopping.required', { amount: shoppingAmountLabel(line) })}
                            </Text>
                          )}
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            lightHaptic();
                            setShoppingHave(line.key, !owned);
                          }}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={t('shopping.haveAtHome')}
                          accessibilityState={{ selected: owned }}
                          style={styles.haveBtn}
                        >
                          <Ionicons name={owned ? 'home' : 'home-outline'} size={18} color={owned ? theme.primary : theme.textTertiary} />
                        </Pressable>
                        <Ionicons name={open ? 'chevron-up' : 'chevron-forward'} size={16} color={theme.textTertiary} />
                      </View>
                      {open && (
                        <View style={styles.contributors}>
                          {line.from.map((c, j) => (
                            <Text key={j} style={{ color: theme.textTertiary, fontSize: 12 }}>
                              {c.recipeName} · {shoppingAmountLabel({ amount: c.amount, unit: line.unit })}
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}

          {started && shownGroups.length === 0 && (
            <Text style={{ color: theme.textSecondary, textAlign: 'center', marginVertical: Spacing.md }}>
              {view === 'buy' ? t('shopping.toBuy', { count: 0 }) : t('shopping.nothingBought')}
            </Text>
          )}

          {/* How much of each recipe is being cooked — batch decisions change what you buy. */}
          <View style={[styles.groupCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
            <SettingsRow
              icon="restaurant-outline"
              title={t('shopping.batchCooking')}
              subtitle={t('shopping.batchHint')}
              onPress={() => setShowBatch((v) => !v)}
              right={<Ionicons name={showBatch ? 'chevron-up' : 'chevron-forward'} size={18} color={theme.textTertiary} />}
              chevron={false}
              last
            />
            {showBatch &&
              plans.map((plan) => (
                <View key={plan.recipeId} style={[styles.cookRow, { borderTopColor: theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '600' }} numberOfLines={1}>
                      {plan.recipeName}
                    </Text>
                    <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                      {t('shopping.acrossMeals', { count: plan.meals.length })}
                      {' · '}
                      {t('shopping.cookServings', { count: servingPluralCount(plan.servingsCooked), amount: servingCountLabel(plan.servingsCooked) })}
                    </Text>
                  </View>
                  {plan.meals.length > 1 && (
                    // Repeating a recipe usually means cooking it again. Only
                    // this says otherwise, and it changes what you buy.
                    <Chip
                      label={t('shopping.oneBatch')}
                      selected={!!plan.oneBatch}
                      onPress={() => {
                        lightHaptic();
                        setShoppingOneBatch(plan.recipeId, !plan.oneBatch);
                      }}
                    />
                  )}
                </View>
              ))}
          </View>
        </>
      )}

      {started && (
        <View style={{ alignItems: 'center', marginTop: Spacing.sm }}>
          <ActionButton label={t('shopping.startOver')} icon="refresh" variant="secondary" onPress={() => useAppStore.getState().clearShopping()} />
        </View>
      )}
      <Text style={[Type.caption, { color: theme.textTertiary, textAlign: 'center', marginTop: Spacing.md }]}>{t('shopping.shareNote')}</Text>
    </Screen>
  );
}

const styles = {
  ...StyleSheet.create({
    rowCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.ms },
    groupCard: { borderRadius: Radius.module, paddingHorizontal: Spacing.md, marginBottom: Spacing.ms },
    groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: Spacing.ms, borderBottomWidth: StyleSheet.hairlineWidth },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.ms },
    cookRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 12 },
    checkbox: { padding: 2 },
    haveBtn: { padding: 4 },
    contributors: { paddingBottom: Spacing.sm, paddingStart: 40, gap: 2 },
  }),
  link: (color: string) => ({ color, fontWeight: '700' as const, fontSize: 13, textDecorationLine: 'underline' as const }),
};
