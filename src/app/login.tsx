import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { Radius, Spacing, TOUCH, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sendEmailCode, syncAuthIdentity, verifyEmailCode } from '@/lib/auth';
import { appleSignInAvailable, signInWithApple } from '@/lib/auth-apple';
import { lightHaptic } from '@/lib/feedback';
import { applyRTL, setI18nLanguage } from '@/lib/i18n';
import { normalizeDigits } from '@/lib/numbers';
import { useAppStore } from '@/lib/store';
import type { FocusArea, Language } from '@/lib/types';

type Step = 'choose' | 'email' | 'code';

/** The auth service's own wording, when it gave one. */
function reason(err: unknown): string | undefined {
  const msg = err instanceof Error ? err.message.trim() : '';
  return msg || undefined;
}

const FOCUS: { key: FocusArea; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'food', icon: 'restaurant' },
  { key: 'training', icon: 'barbell' },
];

/**
 * S19 Welcome — the original logo, English / Arabic, a focus preference that
 * steers suggestions (never access), and guest or sign-in routes. A guest is
 * in the app in one tap; nothing starts a network integration or a
 * notification prompt here. Changing language keeps everything typed.
 */
export default function Login() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const setAccount = useAppStore((s) => s.setAccount);
  const language = useAppStore((s) => s.language) ?? 'en';
  const setLanguage = useAppStore((s) => s.setLanguage);
  const focusAreas = useAppStore((s) => s.focusAreas);
  const setFocusAreas = useAppStore((s) => s.setFocusAreas);

  const [step, setStep] = useState<Step>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [appleReady, setAppleReady] = useState(false);

  useEffect(() => {
    let alive = true;
    appleSignInAvailable().then((ok) => {
      if (alive) setAppleReady(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Locale preference only — typed email, code and focus choices are untouched. */
  const switchLanguage = (lang: Language) => {
    if (lang === language) return;
    lightHaptic();
    setLanguage(lang);
    setI18nLanguage(lang);
    applyRTL(lang);
  };

  const toggleFocus = (key: FocusArea) => {
    lightHaptic();
    const next = focusAreas.includes(key) ? focusAreas.filter((k) => k !== key) : [...focusAreas, key];
    // Both stay available whatever is chosen; an empty choice means both.
    setFocusAreas(next.length ? next : ['food', 'training']);
  };

  const withApple = async () => {
    setBusy(true);
    try {
      const account = await signInWithApple();
      const outcome = await syncAuthIdentity();
      setAccount(account);
      if (outcome === 'restored') Alert.alert(t('auth.restored'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!/canceled|cancelled|ERR_REQUEST_CANCELED/i.test(msg)) Alert.alert(t('auth.signInFailed'), reason(err));
      setBusy(false);
    }
  };

  const requestCode = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert(t('auth.invalidEmail'));
      return;
    }
    setBusy(true);
    try {
      await sendEmailCode(email);
      setStep('code');
    } catch (err) {
      Alert.alert(t('auth.signInFailed'), reason(err));
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
      const outcome = await syncAuthIdentity();
      setAccount(account);
      if (outcome === 'restored') Alert.alert(t('auth.restored'));
    } catch (err) {
      Alert.alert(t('auth.invalidCode'), reason(err));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient
        colors={[theme.gradientStart, theme.gradientEnd]}
        start={{ x: 0, y: 0.4 }}
        end={{ x: 1, y: 0.6 }}
        style={[styles.band, { paddingTop: insets.top + Spacing.md }]}
      >
        <Image source={require('../../assets/images/logo-tile.png')} style={styles.logo} contentFit="contain" accessibilityLabel="Calgym" />
        <Text style={[Type.section, { color: theme.onGradient, fontSize: 24 }]}>{t('common.appName')}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.page, paddingBottom: insets.bottom + Spacing.lg }} keyboardShouldPersistTaps="handled">
        <Text style={[Type.title, { color: theme.text, fontSize: 34, lineHeight: 40, marginTop: Spacing.lg }]} accessibilityRole="header">
          {t('welcome.title')}
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: 17, marginTop: Spacing.xs }}>{t('welcome.subtitle')}</Text>

        <Pressable
          onPress={() => switchLanguage(language === 'en' ? 'ar' : 'en')}
          accessibilityRole="button"
          accessibilityLabel={t('settings.language')}
          style={({ pressed }) => [styles.langPill, { borderColor: theme.primary }, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="globe-outline" size={18} color={theme.primary} />
          <Text style={{ color: theme.primaryDark, fontWeight: '700', fontSize: 15 }}>
            {language === 'en' ? `${t('settings.english')} / ${t('settings.arabic')}` : `${t('settings.arabic')} / ${t('settings.english')}`}
          </Text>
          <Ionicons name="chevron-down" size={16} color={theme.primary} />
        </Pressable>

        <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          {step === 'choose' && (
            <>
              <Text style={[Type.section, { color: theme.text, fontSize: 19 }]}>{t('welcome.focusTitle')}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 2, marginBottom: Spacing.ms }}>{t('welcome.focusBody')}</Text>
              <View style={styles.focusRow}>
                {FOCUS.map((f) => {
                  const on = focusAreas.includes(f.key);
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => toggleFocus(f.key)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={t(`welcome.focus.${f.key}`)}
                      style={({ pressed }) => [
                        styles.focusTile,
                        { backgroundColor: theme.surfaceTint, borderColor: on ? theme.primary : 'transparent' },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <View style={[styles.check, { backgroundColor: on ? theme.primary : theme.card }]}>
                        {on && <Ionicons name="checkmark" size={14} color={theme.onPrimary} />}
                      </View>
                      <Ionicons name={f.icon} size={40} color={theme.primary} />
                      <Text style={{ color: theme.primaryDark, fontWeight: '800', fontSize: 17, marginTop: Spacing.sm }}>{t(`welcome.focus.${f.key}`)}</Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 2 }}>{t(`welcome.focusHint.${f.key}`)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Button label={t('welcome.continueGuest')} onPress={() => setAccount({ name: t('welcome.guestName'), provider: 'guest' })} style={{ marginTop: Spacing.md }} />
              {appleReady && (
                <Pressable onPress={withApple} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.appleBtn, pressed && { opacity: 0.85 }]}>
                  <Ionicons name="logo-apple" size={19} color="#fff" />
                  <Text style={styles.appleLabel}>{t('auth.continueApple')}</Text>
                </Pressable>
              )}
              <Button label={t('welcome.signIn')} variant="secondary" onPress={() => setStep('email')} style={{ marginTop: Spacing.sm }} />
              <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center', marginTop: Spacing.ms }}>{t('welcome.note')}</Text>
            </>
          )}

          {step === 'email' && (
            <>
              <Text style={[Type.section, { color: theme.text, fontSize: 19, marginBottom: Spacing.sm }]}>{t('welcome.signIn')}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor={theme.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                accessibilityLabel={t('auth.emailPlaceholder')}
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              />
              <Button label={busy ? t('auth.sending') : t('auth.sendCode')} onPress={requestCode} disabled={busy} />
              <Button label={t('common.back')} variant="ghost" onPress={() => setStep('choose')} style={{ marginTop: Spacing.xs }} />
            </>
          )}

          {step === 'code' && (
            <>
              <Text style={{ color: theme.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: Spacing.sm }}>{t('auth.codeSent', { email })}</Text>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(normalizeDigits(v))}
                placeholder="123456"
                placeholderTextColor={theme.textTertiary}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                accessibilityLabel={t('auth.verify')}
                style={[styles.input, styles.codeInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              />
              <Button label={busy ? t('auth.signingIn') : t('auth.verify')} onPress={confirmCode} disabled={busy} />
              <Button
                label={t('auth.useAnotherEmail')}
                variant="ghost"
                onPress={() => {
                  setCode('');
                  setStep('email');
                }}
                style={{ marginTop: Spacing.xs }}
              />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  band: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, paddingHorizontal: Spacing.page, paddingBottom: Spacing.lg, borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl },
  logo: { width: 48, height: 48, borderRadius: 12 },
  langPill: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: Radius.pill, paddingHorizontal: 16, minHeight: TOUCH - 4, marginTop: Spacing.md },
  card: { borderRadius: Radius.module, padding: Spacing.md, marginTop: Spacing.md },
  focusRow: { flexDirection: 'row', gap: Spacing.sm },
  focusTile: { flex: 1, alignItems: 'center', borderRadius: Radius.module, borderWidth: 2, paddingVertical: Spacing.lg, paddingHorizontal: Spacing.sm },
  check: { position: 'absolute', top: 10, end: 10, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  appleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, backgroundColor: '#000000', borderRadius: Radius.control, minHeight: 52, marginTop: Spacing.sm },
  appleLabel: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: Radius.control, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: 16, marginBottom: Spacing.sm },
  codeInput: { textAlign: 'center', fontSize: 24, fontWeight: '800', letterSpacing: 6 },
});
