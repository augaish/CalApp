import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { goalScenarios, type GoalScenario } from '@/lib/tdee';
import type { Goal, Profile } from '@/lib/types';

/** Everything `goalScenarios` needs from a profile — the goal/pace being
 * decided right now aren't part of it, since every scenario computes its
 * own. */
type ScenarioInputs = Pick<Profile, 'sex' | 'birthDate' | 'heightCm' | 'weightKg' | 'activityLevel'>;

function scenarioLabel(
  s: GoalScenario,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (s.goal === 'maintain') return t('onboarding.goals.maintain');
  const key = s.goal === 'lose' ? 'onboarding.goals.losePace' : 'onboarding.goals.gainPace';
  return t(key, { pace: s.paceKgPerWeek });
}

/**
 * Every lose/maintain/gain pace as its own calculated card, real calorie
 * numbers per this profile's own maintenance calories — not one generic
 * guess per goal. Used identically on onboarding and on Edit Profile, so a
 * pace change later gets the same real math a first-time setup did.
 */
export function GoalScenarioCards({
  profile,
  goal,
  paceKgPerWeek,
  onSelect,
}: {
  profile: ScenarioInputs;
  goal: Goal;
  paceKgPerWeek: number;
  onSelect: (goal: Goal, paceKgPerWeek: number) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scenarios = goalScenarios({ ...profile, goal: 'maintain', paceKgPerWeek: 0 } as Profile);

  return (
    <View style={{ gap: Spacing.sm }}>
      {scenarios.map((s) => {
        const selected = s.goal === goal && Math.abs(s.paceKgPerWeek - paceKgPerWeek) < 0.01;
        return (
          <Pressable
            key={`${s.goal}-${s.paceKgPerWeek}`}
            onPress={() => onSelect(s.goal, s.paceKgPerWeek)}
            style={[
              styles.card,
              {
                borderColor: selected ? theme.primary : theme.border,
                backgroundColor: selected ? theme.cardSubtle : theme.card,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>
                {scenarioLabel(s, t)}
              </Text>
            </View>
            <Text style={{ color: selected ? theme.primary : theme.textSecondary, fontWeight: '800', fontSize: 16 }}>
              {s.calories}
            </Text>
            <Text style={{ color: theme.textTertiary, fontSize: 12, marginStart: 4, marginEnd: 8 }}>
              {t('common.kcal')}
            </Text>
            {selected && <Ionicons name="checkmark-circle" size={20} color={theme.primary} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
  },
});
