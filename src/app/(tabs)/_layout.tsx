import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { usePending } from '@/lib/pending';
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
  // Fasting's own alert is one-off (see reminders.ts), so starting/ending it
  // needs the same resync the others get — the fast's id changes on both.
  const activeFastId = useAppStore((s) => s.activeFast?.id);

  // S41 route resolution: a deep link wins, then restored context. A cold
  // start that lands on Overview with a session still in progress reopens
  // that session once — nothing is completed or submitted by restoring it.
  const pathname = usePathname();
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const session = useAppStore.getState().activeSession;
    const atRoot = pathname === '/' || pathname === '' || pathname === '/index';
    if (session && atRoot) router.push('/session');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [remindersInitialized, mealCount, workoutCount, waterCount, activeFastId]);

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
                onPress={() => {
                  // A stale hint from a Food-tab "+" the user backed out of
                  // must not silently redirect this unrelated, general add.
                  usePending.getState().setMealTypeHint(null);
                  router.push('/add-menu');
                }}
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
      {/* Health is a destination (D03): body readings, trends, connections
          and export live together. AI Support moved off the bar to a labelled
          route reached from Overview and Profile — it is a helper, not a
          place you go to understand your day. */}
      <Tabs.Screen
        name="health"
        options={{
          title: t('tabs.health'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'heart' : 'heart-outline'} size={23} color={color} />
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
