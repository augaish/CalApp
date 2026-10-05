import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text, TextInput } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { selectionHaptic } from '@/lib/feedback';
import { normalizeDigits } from '@/lib/numbers';
import { PORTION_CHIPS, portionState, shownAmount, stepPortion, withAmount, withPortion } from '@/lib/portion';
import { servingCountLabel } from '@/lib/recipes';
import type { FoodItem } from '@/lib/types';

/**
 * How much of one food was eaten: what "1" is, an amount box with − and +,
 * and the ¼ ½ 1 1½ 2 chips — kept in step with each other. Weighed foods
 * take grams (or ml); the rest count portions of their label.
 */
export function PortionControl({ item, onChange }: { item: FoodItem; onChange: (next: FoodItem) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  // What is being typed, while it is being typed — so "1" on the way to
  // "150" is not snapped back to the current amount.
  const [draft, setDraft] = useState<string | null>(null);
  const state = portionState(item);
  if (!state) return null;

  const weighed = state.kind === 'weight' && !!state.base.amount;
  const unit = state.base.unit === 'ml' ? t('mealResult.ml') : t('common.grams');
  // A packaged food's "1" is just its weight: say it in the language on screen.
  const oneLabel =
    state.kind === 'serving'
      ? `1 ${t('recipe.servingUnit', { count: 1 })}`
      : state.base.amount && /^[~≈]?\s*[0-9٠-٩.,٫]+\s*\S+$/.test(state.base.label.trim())
        ? `${Math.round(state.base.amount)} ${unit}`
        : state.base.label;
  const oneKcal = Math.round(state.base.macros.calories);
  const amount = shownAmount(state);

  const set = (mult: number | null) => {
    if (mult == null) return;
    selectionHaptic();
    setDraft(null);
    onChange(withPortion(item, mult));
  };
  const down = stepPortion(state, -1);
  const up = stepPortion(state, 1);

  return (
    <View>
      {!!oneLabel && (
        <Text style={[styles.one, { color: theme.textSecondary }]} numberOfLines={2}>
          {t('mealResult.onePortion', { label: oneLabel })}
          {` · ${oneKcal} ${t('common.kcal')}`}
        </Text>
      )}

      <View style={[styles.amountRow, { backgroundColor: theme.cardSubtle }]}>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontWeight: '600', flex: 1 }}>
          {weighed ? t('mealResult.amountEaten') : t('mealResult.amount')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.decrease')}
          disabled={down == null}
          onPress={() => set(down)}
          hitSlop={6}
          style={({ pressed }) => [styles.stepBtn, { borderColor: theme.border, backgroundColor: theme.background }, (pressed || down == null) && { opacity: 0.4 }]}
        >
          <Icon name="remove" size={18} color={theme.primary} />
        </Pressable>
        {weighed ? (
          <TextInput
            value={draft ?? String(amount)}
            keyboardType="number-pad"
            maxLength={4}
            selectTextOnFocus
            accessibilityLabel={t('mealResult.amountEaten')}
            onChangeText={(text) => {
              setDraft(text);
              const n = parseInt(normalizeDigits(text), 10);
              if (n > 0) onChange(withAmount(item, n));
            }}
            onBlur={() => setDraft(null)}
            style={[styles.amountInput, { color: theme.text, borderColor: theme.primary, backgroundColor: theme.background }]}
          />
        ) : (
          <View style={[styles.amountInput, { borderColor: theme.primary, backgroundColor: theme.background }]}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{servingCountLabel(amount)}</Text>
          </View>
        )}
        {weighed && <Text style={{ color: theme.textSecondary, fontSize: 14 }}>{unit}</Text>}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.increase')}
          disabled={up == null}
          onPress={() => set(up)}
          hitSlop={6}
          style={({ pressed }) => [styles.stepBtn, { borderColor: theme.border, backgroundColor: theme.background }, (pressed || up == null) && { opacity: 0.4 }]}
        >
          <Icon name="add" size={18} color={theme.primary} />
        </Pressable>
      </View>

      <View style={styles.chipRow}>
        <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600', marginEnd: 4 }}>
          {t('mealResult.portion')}
        </Text>
        {PORTION_CHIPS.map((m) => {
          const active = Math.abs(state.mult - m) < 0.001;
          return (
            <Pressable
              accessibilityRole="button"
              aria-selected={active}
              key={m}
              onPress={() => set(m)}
              style={[
                styles.chip,
                { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : 'transparent' },
              ]}
            >
              {/* LTR so "1½" never reads "½1" in Arabic. */}
              <Text style={{ color: active ? '#fff' : theme.textSecondary, fontWeight: '700', fontSize: 13, writingDirection: 'ltr' }}>
                {servingCountLabel(m)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  one: { fontSize: 12.5, marginTop: -2, marginBottom: Spacing.sm },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    marginBottom: Spacing.sm,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountInput: {
    borderWidth: 1.5,
    borderRadius: Radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    width: 72,
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  chip: {
    minWidth: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
