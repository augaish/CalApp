import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Celebration } from '@/components/celebration';
import { setInstallId } from '@/lib/api';
import { deviceLanguage, setI18nLanguage, applyRTL } from '@/lib/i18n';
import { useAppStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const hydrated = useAppStore((s) => s.hydrated);
  const language = useAppStore((s) => s.language);
  const profile = useAppStore((s) => s.profile);
  const account = useAppStore((s) => s.account);
  const tutorialSeen = useAppStore((s) => s.tutorialSeen);

  const lang = language ?? deviceLanguage();

  useEffect(() => {
    if (!hydrated) return;
    setI18nLanguage(lang);
    applyRTL(lang);
    // Identify this install to the server so AI usage is metered per user.
    setInstallId(useAppStore.getState().ensureInstallId());
    SplashScreen.hideAsync();
  }, [hydrated, lang]);

  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={DefaultTheme}>
        <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
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
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen name="describe" options={{ presentation: 'modal' }} />
          <Stack.Screen name="food-edit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="meal-edit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="edit-targets" options={{ presentation: 'modal' }} />
          <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="exercise-library" options={{ presentation: 'modal' }} />
          <Stack.Screen name="exercise-edit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="exercise-detail" options={{ presentation: 'modal' }} />
          <Stack.Screen name="schedule" options={{ presentation: 'modal' }} />
          <Stack.Screen name="schedule-plan" options={{ presentation: 'modal' }} />
          <Stack.Screen name="schedule-import" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="water"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen
            name="calendar"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
        </Stack.Protected>
      </Stack>
      <Celebration />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
