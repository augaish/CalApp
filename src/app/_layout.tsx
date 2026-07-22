import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { deviceLanguage, initI18n, applyRTL } from '@/lib/i18n';
import { useAppStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hydrated = useAppStore((s) => s.hydrated);
  const language = useAppStore((s) => s.language);
  const profile = useAppStore((s) => s.profile);

  const lang = language ?? deviceLanguage();
  initI18n(lang);

  useEffect(() => {
    if (!hydrated) return;
    applyRTL(lang);
    SplashScreen.hideAsync();
  }, [hydrated, lang]);

  if (!hydrated) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!profile}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!!profile}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="meal-result" options={{ presentation: 'modal' }} />
          <Stack.Screen name="gym-result" options={{ presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
