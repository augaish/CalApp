import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
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

/** The window a shop is worth planning over. Module-level so the clock is
 * never read during render. */
function defaultRange(days: number): { fromKey: string; toKey: string } {
  const start = new Date();
  const end = new Date(start);
  end.setDate(start.getDate() + days - 1);
  return { fromKey: dateKey(start), toKey: dateKey(end) };
}

const RANGES = [3, 7, 14] as const;

/** A dateKey is "year-monthIndex-day" and is not something to show a person. */
function readableDate(key: string, locale: string): string {
  const day = datesBetween(key, key)[0];
  return day ? day.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : key;
}

/**
 * One shopping trip, built from the recipes standing on the plan.
 *
 * Only decisions are stored; every quantity is recomputed from the plan each
 * time this opens. That is what lets the plan change underneath without
 * throwing away an afternoon's ticking — and what makes it possible to say
 * "300 g more needed" instead of quietly treating a grown amount as bought.
 */
export default function Shopping() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();

  const recipes = useAppStore((s) => s.recipes);
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

  // The trip in progress, or the default window until one is started.
  const range = shopping ?? defaultRange(rangeDays);

  const { meals, plannedTotal } = useMemo(
    () =>
      plannedRecipeMealsBetween(
        range.fromKey,
        range.toKey,
        mealPlanRecipes,
        recipes,
        mealPlan,
        activeProgramId,
      ),
    [range.fromKey, range.toKey, mealPlanRecipes, recipes, mealPlan, activeProgramId],
  );

  const plans = useMemo(
    () => cookPlans(meals, shopping?.oneBatch ?? {}),
    [meals, shopping?.oneBatch],
  );
  const lines = useMemo(() => buildShoppingLines(plans), [plans]);
  const groups = useMemo(() => byAisle(lines), [lines]);

  const checkedAt = shopping?.checkedAt ?? {};
  const have = shopping?.have ?? {};
  const statusOf = (line: ShoppingLine) => lineStatus(line, have, checkedAt);
  const toBuy = lines.filter((l) => {
    const s = statusOf(l);
    return s.kind === 'todo' || s.kind === 'shortfall';
  });

  const share = () => {
    const text = shoppingListText(
      groups,
      { title: t('shopping.shareTitle'), aisle: (a) => t(`shopping.aisles.${a}`) },
      (line) => statusOf(line).kind === 'have',
    );
    if (text) void Share.share({ message: text });
  };

  const started = !!shopping;

  return (
    <Screen
      footer={
        started ? (
          <Button label={t('shopping.share')} icon="share-outline" variant="secondary" onPress={share} />
        ) : (
          <Button
            label={t('shopping.create')}
            icon="cart"
            onPress={() => {
              const r = defaultRange(rangeDays);
              startShopping(r.fromKey, r.toKey);
              successHaptic();
            }}
            disabled={meals.length === 0}
          />
        )
      }
    >
      <Title>{t('shopping.title')}</Title>

      {/* Which dates, and what that actually covers. */}
      <Card style={{ gap: Spacing.sm }}>
        <Text style={[Type.caption, { color: theme.textSecondary }]}>{t('shopping.dates')}</Text>
        {started ? (
          <Text style={{ color: theme.text, fontWeight: '700' }}>
            {t('shopping.rangeLabel', {
              from: readableDate(range.fromKey, locale),
              to: readableDate(range.toKey, locale),
            })}
          </Text>
        ) : (
          <View style={styles.chips}>
            {RANGES.map((d) => {
              const active = rangeDays === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => {
                    lightHaptic();
                    setRangeDays(d);
                  }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? theme.primary : theme.cardSubtle,
                      borderColor: active ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text style={{ color: active ? theme.onPrimary : theme.textSecondary, fontWeight: '700', fontSize: 13 }}>
                    {t('shopping.nextDays', { count: d })}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {/* What is and is not covered — a list is only trustworthy if you know
            which meals it actually came from. */}
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
          {t('shopping.coverage', { withRecipe: meals.length, planned: plannedTotal })}
        </Text>
        {plannedTotal > meals.length && (
          <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('shopping.coverageHint')}</Text>
        )}
      </Card>

      {/* How much of each recipe is being cooked, before anything is bought. */}
      {plans.length > 0 && (
        <>
          <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>
            {t('shopping.cooking')}
          </Text>
          <Card style={{ paddingVertical: Spacing.xs }}>
            {plans.map((plan, i) => (
              <View
                key={plan.recipeId}
                style={[
                  styles.cookRow,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '600' }} numberOfLines={1}>
                    {plan.recipeName}
                  </Text>
                  <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                    {t('shopping.acrossMeals', { count: plan.meals.length })}
                    {' · '}
                    {t('shopping.cookServings', {
                      count: servingPluralCount(plan.servingsCooked),
                      amount: servingCountLabel(plan.servingsCooked),
                    })}
                  </Text>
                </View>
                {plan.meals.length > 1 && (
                  // Repeating a recipe usually means cooking it again. Only
                  // this says otherwise, and it changes what you buy.
                  <Pressable
                    onPress={() => {
                      lightHaptic();
                      setShoppingOneBatch(plan.recipeId, !plan.oneBatch);
                    }}
                    style={[
                      styles.batchChip,
                      {
                        backgroundColor: plan.oneBatch ? theme.primary : theme.cardSubtle,
                        borderColor: plan.oneBatch ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: plan.oneBatch ? theme.onPrimary : theme.textSecondary,
                        fontWeight: '700',
                        fontSize: 12,
                      }}
                    >
                      {t('shopping.oneBatch')}
                    </Text>
                  </Pressable>
                )}
              </View>
            ))}
          </Card>
        </>
      )}

      {started && lines.length > 0 && (
        <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>
          {t('shopping.toBuy', { count: toBuy.length })}
        </Text>
      )}

      {started &&
        groups.map((group) => (
          <View key={group.aisle} style={{ marginBottom: Spacing.sm }}>
            <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>
              {t(`shopping.aisles.${group.aisle}`).toUpperCase()}
            </Text>
            <Card style={{ paddingVertical: 0 }}>
              {group.lines.map((line, i) => {
                const status = statusOf(line);
                const done = status.kind === 'done';
                const owned = status.kind === 'have';
                const open = expanded === line.key;
                return (
                  <View
                    key={line.key}
                    style={[i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
                  >
                    <View style={styles.itemRow}>
                      <Pressable
                        onPress={() => {
                          lightHaptic();
                          setShoppingChecked(line.key, done || owned ? null : line.amount);
                        }}
                        hitSlop={8}
                        style={styles.checkbox}
                      >
                        <Ionicons
                          name={done ? 'checkbox' : 'square-outline'}
                          size={26}
                          color={done ? theme.primary : theme.textTertiary}
                        />
                      </Pressable>
                      <Pressable style={{ flex: 1 }} onPress={() => setExpanded(open ? null : line.key)}>
                        <Text
                          style={{
                            color: done || owned ? theme.textTertiary : theme.text,
                            fontWeight: '600',
                            textDecorationLine: done || owned ? 'line-through' : 'none',
                          }}
                        >
                          {line.name}
                        </Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                          {shoppingAmountLabel(line)}
                          {line.state === 'cooked' ? ` · ${t('shopping.cooked')}` : ''}
                        </Text>
                        {status.kind === 'shortfall' && (
                          // Ticked, but the plan has grown. Saying so is the
                          // whole point — otherwise you get home short.
                          <Text style={{ color: theme.warning, fontSize: 12, fontWeight: '700' }}>
                            {t('shopping.moreNeeded', {
                              amount: shoppingAmountLabel({ amount: status.extra, unit: line.unit }),
                            })}
                          </Text>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          lightHaptic();
                          setShoppingHave(line.key, !owned);
                        }}
                        hitSlop={8}
                        style={styles.haveBtn}
                      >
                        <Ionicons
                          name={owned ? 'home' : 'home-outline'}
                          size={18}
                          color={owned ? theme.primary : theme.textTertiary}
                        />
                      </Pressable>
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
            </Card>
          </View>
        ))}

      {meals.length === 0 && (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="cart-outline" size={30} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>{t('shopping.empty')}</Text>
        </View>
      )}

      {started && (
        <Button
          label={t('shopping.startOver')}
          variant="ghost"
          icon="refresh"
          onPress={() => useAppStore.getState().clearShopping()}
          style={{ marginTop: Spacing.sm }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1.5, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8 },
  cookRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 11 },
  batchChip: { borderWidth: 1.5, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 12 },
  checkbox: { padding: 2 },
  haveBtn: { padding: 4 },
  contributors: { paddingBottom: Spacing.sm, paddingStart: 40, gap: 2 },
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
