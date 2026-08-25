import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CoachSchedulePlan } from '@/lib/types';

/** Weekday name in the active locale (Jan 7 2024 was a Sunday). */
export function weekdayLabel(i: number, locale: string): string {
  return new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: 'long' });
}

/** A proposed weekly plan, laid out like the real schedule so it's obvious
 * what tapping "Add" actually does before it does it. Shared by the coach
 * chat (a chat-bubble-shaped card) and the AI program screen (full width) —
 * pass `style` to override the chat-bubble sizing. */
export function SchedulePlanCard({
  plan,
  locale,
  added,
  onAdd,
  style,
}: {
  plan: CoachSchedulePlan;
  locale: string;
  added: boolean;
  onAdd: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View
      style={[
        styles.planCard,
        { backgroundColor: theme.card, borderColor: theme.border },
        cardShadow(theme.shadow),
        style,
      ]}
    >
      <View style={styles.planHeader}>
        <Ionicons name="calendar" size={16} color={theme.primary} />
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14, flex: 1 }}>
          {t('coach.schedulePlan.cardTitle')}
        </Text>
      </View>
      {!!plan.summary && (
        <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: Spacing.sm }}>
          {plan.summary}
        </Text>
      )}
      {plan.days.map((day) => (
        <View key={day.weekday} style={styles.planDay}>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13, marginBottom: 4 }}>
            {day.title ? `${weekdayLabel(day.weekday, locale)} — ${day.title}` : weekdayLabel(day.weekday, locale)}
          </Text>
          {day.exercises.map((ex, i) => (
            <View key={i} style={styles.planExerciseRow}>
              <Ionicons name="barbell-outline" size={13} color={theme.textTertiary} />
              <Text style={{ color: theme.textSecondary, fontSize: 13, flex: 1 }} numberOfLines={1}>
                {ex.name}
              </Text>
              <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                {t('coach.schedulePlan.setsReps', { sets: ex.sets, reps: ex.reps })}
              </Text>
            </View>
          ))}
        </View>
      ))}
      <Pressable
        onPress={onAdd}
        disabled={added}
        style={({ pressed }) => [
          styles.planAddBtn,
          { backgroundColor: added ? theme.cardSubtle : theme.primary },
          pressed && !added && { opacity: 0.8 },
        ]}
      >
        <Ionicons
          name={added ? 'checkmark-circle' : 'add-circle'}
          size={17}
          color={added ? theme.textSecondary : theme.onPrimary}
        />
        <Text style={{ color: added ? theme.textSecondary : theme.onPrimary, fontWeight: '700', fontSize: 14 }}>
          {added ? t('coach.schedulePlan.added') : t('coach.schedulePlan.add')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  planCard: {
    maxWidth: '92%',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 2,
  },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.xs },
  planDay: { marginBottom: Spacing.sm },
  planExerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  planAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.md,
    paddingVertical: 10,
    marginTop: Spacing.xs,
  },
});
