import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { deviceLanguage, setI18nLanguage, applyRTL } from '@/lib/i18n';
import { useAppStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const hydrated = useAppStore((s) => s.hydrated);
  const language = useAppStore((s) => s.language);
  const profile = useAppStore((s) => s.profile);

  const lang = language ?? deviceLanguage();

  useEffect(() => {
    if (!hydrated) return;
    setI18nLanguage(lang);
    applyRTL(lang);
    SplashScreen.hideAsync();
  }, [hydrated, lang]);

  if (!hydrated) return null;

  return (
    <ThemeProvider value={DefaultTheme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!profile}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!!profile}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="meal-result" options={{ presentation: 'modal' }} />
          <Stack.Screen name="gym-result" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="add-menu"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen name="describe" options={{ presentation: 'modal' }} />
          <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
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
    </ThemeProvider>
  );
}
