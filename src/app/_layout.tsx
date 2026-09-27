import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Appearance, Platform } from 'react-native';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Celebration } from '@/components/celebration';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { setInstallId } from '@/lib/api';
import { syncAuthIdentity } from '@/lib/auth';
import { useEntitlement } from '@/lib/entitlement';
import { deviceLanguage, setI18nLanguage, applyRTL } from '@/lib/i18n';
import { startMilestones } from '@/lib/milestones';
import { startRestAlerts } from '@/lib/rest-alert';
import { startRestLiveActivity } from '@/lib/rest-live-activity';
import { useAppStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const hydrated = useAppStore((s) => s.hydrated);
  const language = useAppStore((s) => s.language);
  const profile = useAppStore((s) => s.profile);
  const account = useAppStore((s) => s.account);
  const tutorialSeen = useAppStore((s) => s.tutorialSeen);
  const appearance = useAppStore((s) => s.appearance) ?? 'system';
  const theme = useTheme();
  const scheme = useSchemeName();
  // The navigator's own surfaces (behind screens, during transitions) in the
  // app's palette, so dark mode never flashes the library's default grey.
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: theme.background, card: theme.card, border: theme.border, primary: theme.primary, text: theme.text },
  };

  // The app's own colours follow useTheme(); this makes the system's pieces
  // (alerts, the keyboard, date pickers) match the same choice.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance);
    } catch {
      // Older runtimes: the app's own colours still follow the choice.
    }
  }, [appearance]);

  const lang = language ?? deviceLanguage();

  useEffect(() => {
    if (!hydrated) return;
    setI18nLanguage(lang);
    applyRTL(lang);
    // Identify this install to the server so AI usage is metered per user,
    // then pull the current plan / remaining allowance.
    setInstallId(useAppStore.getState().ensureInstallId());
    // The rest timer's alert for when the phone is locked or the app is
    // in the background; it follows the session from any screen.
    startRestAlerts();
    startRestLiveActivity();
    startMilestones();
    // If a Supabase session exists, meter against the account instead so the
    // plan follows the person across devices.
    syncAuthIdentity().finally(() => useEntitlement.getState().refresh());
    SplashScreen.hideAsync();
  }, [hydrated, lang]);

  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navTheme}>
        <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Protected guard={!account}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={!!account && !profile}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!!account && !!profile && !tutorialSeen}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        <Stack.Protected guard={!!account && !!profile && !!tutorialSeen}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="meal-result" options={{ presentation: 'modal' }} />
          <Stack.Screen name="gym-result" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="add-menu"
            options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
          />
          <Stack.Screen name="describe" options={{ presentation: 'modal' }} />
          <Stack.Screen name="food-edit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="food-search" options={{ presentation: 'modal' }} />
          <Stack.Screen name="product-not-found" options={{ presentation: 'modal' }} />
          <Stack.Screen name="meal-edit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="edit-targets" options={{ presentation: 'modal' }} />
          <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
          <Stack.Screen name="privacy" options={{ presentation: 'modal' }} />
          <Stack.Screen name="help" options={{ presentation: 'modal' }} />
          <Stack.Screen name="coach" options={{ presentation: 'modal' }} />
          <Stack.Screen name="connections" options={{ presentation: 'modal' }} />
          <Stack.Screen name="measurements" options={{ presentation: 'modal' }} />
          <Stack.Screen name="workout-history" options={{ presentation: 'modal' }} />
          <Stack.Screen name="schedules" options={{ presentation: 'modal' }} />
          <Stack.Screen name="schedule-activate" options={{ presentation: 'modal' }} />
          <Stack.Screen name="reschedule" options={{ presentation: 'modal' }} />
          <Stack.Screen name="recipe-edit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="log-portion" options={{ presentation: 'modal' }} />
          <Stack.Screen name="upgrade" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="membership"
            options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
          />
          <Stack.Screen name="redeem" options={{ presentation: 'modal' }} />
          <Stack.Screen name="exercise-library" options={{ presentation: 'modal' }} />
          <Stack.Screen name="exercise-edit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="exercise-detail" options={{ presentation: 'modal' }} />
          <Stack.Screen name="session" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="schedule" options={{ presentation: 'modal' }} />
          <Stack.Screen name="schedule-plan" options={{ presentation: 'modal' }} />
          <Stack.Screen name="schedule-import" options={{ presentation: 'modal' }} />
          <Stack.Screen name="meal-import" options={{ presentation: 'modal' }} />
          <Stack.Screen name="photo-analyze" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen
            name="water"
            options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
          />
          <Stack.Screen
            name="calendar"
            options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
          />
        </Stack.Protected>
      </Stack>
      <Celebration />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

