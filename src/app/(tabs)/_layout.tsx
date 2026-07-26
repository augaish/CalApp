import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { syncReminders } from '@/lib/reminders';
import { useAppStore } from '@/lib/store';

export default function TabLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const remindersInitialized = useAppStore((s) => s.remindersInitialized);
  const setRemindMeals = useAppStore((s) => s.setRemindMeals);
  const setRemindWater = useAppStore((s) => s.setRemindWater);
  const setRemindWorkouts = useAppStore((s) => s.setRemindWorkouts);
  const setRemindersInitialized = useAppStore((s) => s.setRemindersInitialized);
  // Re-sync whenever logged data changes so conditional reminders (streak
  // saver, meal prompts, macro summary) stay accurate.
  const mealCount = useAppStore((s) => s.meals.length);
  const workoutCount = useAppStore((s) => s.workouts.length);
  const waterCount = useAppStore((s) => s.water.length);

  // First launch: request permission once and schedule everything. If denied,
  // reflect the reminder toggles as off. Users manage them in Profile after.
  useEffect(() => {
    if (remindersInitialized) return;
    let cancelled = false;
    (async () => {
      const { granted } = await syncReminders();
      if (cancelled) return;
      if (!granted) {
        setRemindMeals(false);
        setRemindWater(false);
        setRemindWorkouts(false);
      }
      setRemindersInitialized();
    })();
    return () => {
      cancelled = true;
    };
  }, [remindersInitialized, setRemindMeals, setRemindWater, setRemindWorkouts, setRemindersInitialized]);

  // Keep reminders fresh on foreground and after each log.
  useEffect(() => {
    if (!remindersInitialized) return;
    void syncReminders();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void syncReminders();
    });
    return () => sub.remove();
  }, [remindersInitialized, mealCount, workoutCount, waterCount]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.overview'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={23} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: t('tabs.training'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'barbell' : 'barbell-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: '',
          tabBarButton: () => (
            <View style={styles.fabWrap}>
              <Pressable
                onPress={() => router.push('/add-menu')}
                style={({ pressed }) => [
                  styles.fab,
                  { backgroundColor: theme.primary },
                  pressed && { transform: [{ scale: 0.93 }] },
                ]}
              >
                <Ionicons name="add" size={30} color={theme.onPrimary} />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="food"
        options={{
          title: t('tabs.food'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'restaurant' : 'restaurant-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: t('tabs.ai'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'sparkles' : 'sparkles-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fabWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -14,
  },
});
