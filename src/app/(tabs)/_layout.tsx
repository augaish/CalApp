import { Tabs, usePathname, useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { GlassBacking } from '@/components/glass';
import { Icon } from '@/components/icon';
import { TourOverlay } from '@/components/tour-overlay';
import { useMembershipPrompt } from '@/hooks/use-membership-prompt';
import { useTheme } from '@/hooks/use-theme';
import { usePending } from '@/lib/pending';
import { syncReminders } from '@/lib/reminders';
import { useAppStore } from '@/lib/store';
import { nativeTabsAvailable } from '@/lib/tab-bar';

/** The centre "+": a general add, so a stale Food-tab meal hint must not steer it. */
function openAdd(router: ReturnType<typeof useRouter>) {
  usePending.getState().setMealTypeHint(null);
  router.push('/add-menu');
}

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
  // Everything else a plan reads: readings (body wins), targets, the week's
  // schedule and moved workouts, and the notification settings themselves.
  const weightCount = useAppStore((s) => s.weights.length);
  const targets = useAppStore((s) => s.targets);
  const schedule = useAppStore((s) => s.schedule);
  const occurrences = useAppStore((s) => s.occurrences);
  const notifyPrefs = useAppStore((s) => s.notifyPrefs);
  const language = useAppStore((s) => s.language);

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
  }, [remindersInitialized, mealCount, workoutCount, waterCount, activeFastId, weightCount, targets, schedule, occurrences, notifyPrefs, language]);

  useMembershipPrompt();

  if (nativeTabsAvailable) {
    // iPhone: Apple's own tab bar — Liquid Glass on iOS 26, the system bar
    // before it — with SF Symbols that fill when selected. "+" is an item
    // that never becomes selected: tapping it opens the Add sheet over
    // whichever tab you were on. Screens pad themselves for the bar through
    // their safe area, so the system's automatic scroll insets are off.
    return (
      <>
        <NativeTabs tintColor={theme.primary}>
          <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
            <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} />
            <NativeTabs.Trigger.Label>{t('tabs.overview')}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="training" disableAutomaticContentInsets>
            <NativeTabs.Trigger.Icon sf="dumbbell.fill" />
            <NativeTabs.Trigger.Label>{t('tabs.training')}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger
            name="add"
            disabled
            listeners={{ tabPress: () => openAdd(router) }}
          >
            <NativeTabs.Trigger.Icon sf="plus.circle.fill" />
            <NativeTabs.Trigger.Label>{t('tabs.add')}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="food" disableAutomaticContentInsets>
            <NativeTabs.Trigger.Icon sf="fork.knife" />
            <NativeTabs.Trigger.Label>{t('tabs.food')}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="health" disableAutomaticContentInsets>
            <NativeTabs.Trigger.Icon sf={{ default: 'heart', selected: 'heart.fill' }} />
            <NativeTabs.Trigger.Label>{t('tabs.health')}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        </NativeTabs>
        <TourOverlay />
      </>
    );
  }

  return (
    <>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        // Like the system tab bar, labels stay put under larger text; the
        // screens themselves carry the larger size.
        tabBarAllowFontScaling: false,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.overview'),
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? 'grid' : 'grid-outline'} size={23} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: t('tabs.training'),
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? 'barbell' : 'barbell-outline'} size={24} color={color} />
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
                accessibilityRole="button"
                accessibilityLabel={t('addMenu.title')}
                onPress={() => openAdd(router)}
                style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.93 }] }]}
              >
                {/* Brand-tinted glass on iOS 26; the solid brand disc elsewhere. */}
                <GlassBacking radius={26} fallbackColor={theme.primary} tint={theme.primary} />
                <Icon name="add" size={30} color={theme.onPrimary} />
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
            <Icon name={focused ? 'restaurant' : 'restaurant-outline'} size={22} color={color} />
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
            <Icon name={focused ? 'heart' : 'heart-outline'} size={23} color={color} />
          ),
        }}
      />
    </Tabs>
    {/* The guided tour spans every tab, so it lives above them all. */}
    <TourOverlay />
    </>
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
