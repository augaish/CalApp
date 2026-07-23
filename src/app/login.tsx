import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signInWithGoogle } from '@/lib/auth';
import { useAppStore } from '@/lib/store';

export default function Login() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const setAccount = useAppStore((s) => s.setAccount);
  const [busy, setBusy] = useState(false);

  const google = async () => {
    setBusy(true);
    try {
      setAccount(await signInWithGoogle());
    } catch {
      Alert.alert(t('auth.signInFailed'));
      setBusy(false);
    }
  };

  return (
    <LinearGradient
      colors={[theme.gradientStart, theme.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.lg }]}
    >
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Image
            source={require('../../assets/images/logo-mark.png')}
            style={styles.logoImg}
            contentFit="contain"
          />
        </View>
        <Text style={styles.title}>{t('auth.welcomeTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.welcomeSubtitle')}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={google}
          disabled={busy}
          style={({ pressed }) => [
            styles.googleBtn,
            pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
            busy && { opacity: 0.6 },
          ]}
        >
          <Ionicons name="logo-google" size={20} color="#1F1F1F" />
          <Text style={styles.googleLabel}>
            {busy ? t('auth.signingIn') : t('auth.continueGoogle')}
          </Text>
        </Pressable>

        <Button
          label={t('auth.continueGuest')}
          variant="ghost"
          onPress={() => setAccount({ name: 'Athlete', provider: 'guest' })}
          style={styles.guestBtn}
        />

        <Text style={styles.note}>{t('auth.staysSignedIn')}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: Spacing.lg, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  logoImg: { width: 68, height: 68 },
  title: { color: '#FFFFFF', fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  subtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 23,
    paddingHorizontal: Spacing.md,
  },
  actions: { gap: Spacing.sm },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.full,
    paddingVertical: 16,
    minHeight: 54,
  },
  googleLabel: { color: '#1F1F1F', fontSize: 17, fontWeight: '700' },
  guestBtn: { minHeight: 48 },
  note: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center' },
});
