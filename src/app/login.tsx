import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sendEmailCode, syncAuthIdentity, verifyEmailCode } from '@/lib/auth';
import { useAppStore } from '@/lib/store';

type Step = 'choose' | 'email' | 'code';

export default function Login() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const setAccount = useAppStore((s) => s.setAccount);

  const [step, setStep] = useState<Step>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert(t('auth.invalidEmail'));
      return;
    }
    setBusy(true);
    try {
      await sendEmailCode(email);
      setStep('code');
    } catch {
      Alert.alert(t('auth.signInFailed'));
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    if (code.trim().length < 6) {
      Alert.alert(t('auth.invalidCode'));
      return;
    }
    setBusy(true);
    try {
      const account = await verifyEmailCode(email, code);
      // Metering follows the person from here on, not the install.
      await syncAuthIdentity();
      setAccount(account);
    } catch {
      Alert.alert(t('auth.invalidCode'));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient
        colors={[theme.gradientStart, theme.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.lg }]}
      >
        <View style={styles.hero}>
          <Image
            source={require('../../assets/images/logo-tile.png')}
            style={styles.logoImg}
            contentFit="contain"
          />
          <Text style={styles.subtitle}>{t('auth.welcomeSubtitle')}</Text>
        </View>

        <View style={styles.actions}>
          {step === 'choose' && (
            <>
              <Pressable
                onPress={() => setStep('email')}
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.primaryLabel}>{t('auth.continueEmail')}</Text>
              </Pressable>
              <Button
                label={t('auth.continueGuest')}
                variant="ghost"
                onPress={() => setAccount({ name: 'Athlete', provider: 'guest' })}
                style={styles.guestBtn}
              />
              <Text style={styles.note}>{t('auth.guestNote')}</Text>
            </>
          )}

          {step === 'email' && (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor="rgba(255,255,255,0.6)"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                style={styles.input}
              />
              <Button
                label={busy ? t('auth.sending') : t('auth.sendCode')}
                onPress={requestCode}
                disabled={busy}
              />
              <Button
                label={t('common.back')}
                variant="ghost"
                onPress={() => setStep('choose')}
                style={styles.guestBtn}
              />
            </>
          )}

          {step === 'code' && (
            <>
              <Text style={styles.note}>{t('auth.codeSent', { email })}</Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor="rgba(255,255,255,0.6)"
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                style={[styles.input, styles.codeInput]}
              />
              <Button
                label={busy ? t('auth.signingIn') : t('auth.verify')}
                onPress={confirmCode}
                disabled={busy}
              />
              <Button
                label={t('auth.useAnotherEmail')}
                variant="ghost"
                onPress={() => {
                  setCode('');
                  setStep('email');
                }}
                style={styles.guestBtn}
              />
            </>
          )}
        </View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: Spacing.lg, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoImg: { width: 128, height: 128, borderRadius: 28, marginBottom: Spacing.lg },
  subtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 23,
    paddingHorizontal: Spacing.md,
  },
  actions: { gap: Spacing.sm },
  primaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.full,
    paddingVertical: 16,
    minHeight: 54,
  },
  primaryLabel: { color: '#1F1F1F', fontSize: 17, fontWeight: '700' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 15,
    color: '#fff',
    fontSize: 16,
  },
  codeInput: { textAlign: 'center', fontSize: 24, fontWeight: '800', letterSpacing: 6 },
  guestBtn: { minHeight: 48 },
  note: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center' },
});
