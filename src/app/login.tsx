import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { alertProblem } from '@/lib/alerts';
import { Button } from '@/components/ui';
import { Radius, Spacing, TOUCH, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sendEmailCode, syncAuthIdentity, verifyEmailCode } from '@/lib/auth';
import { appleSignInAvailable, signInWithApple } from '@/lib/auth-apple';
import { GoogleCancelled, GoogleUnavailable, googleSignInEnabled, signInWithGoogle } from '@/lib/auth-google';
import { authFailure } from '@/lib/auth-errors';
import { lightHaptic } from '@/lib/feedback';
import { applyRTL, setI18nLanguage } from '@/lib/i18n';
import { normalizeDigits } from '@/lib/numbers';
import { useAppStore } from '@/lib/store';
import type { FocusArea, Language } from '@/lib/types';

type Step = 'choose' | 'email' | 'code';

/** The auth service's own wording, when it gave one. */
/** A sign-in failure told in words, with the raw text only when nothing better is known. */
function explain(err: unknown, stage: 'send' | 'verify' | 'provider', t: (k: string) => string): [string, string | undefined] {
  const f = authFailure(err, stage);
  if (f.kind === 'network') return [t('auth.networkTitle'), t('auth.networkBody')];
  if (f.kind === 'rateLimited') return [t('auth.rateLimitedTitle'), t('auth.rateLimitedBody')];
  if (f.kind === 'badCode') return [t('auth.invalidCode'), undefined];
  return [t('auth.signInFailed'), f.detail];
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
  // Shown only once Supabase confirms Google is switched on.
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    let alive = true;
    appleSignInAvailable().then((ok) => {
      if (alive) setAppleReady(ok);
    });
    if (Platform.OS !== 'web') {
      googleSignInEnabled().then((ok) => {
        if (alive) setGoogleReady(ok);
      });
    }
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
      if (!/canceled|cancelled|ERR_REQUEST_CANCELED/i.test(msg)) alertProblem(...explain(err, 'provider', t));
      setBusy(false);
    }
  };

  const withGoogle = async () => {
    setBusy(true);
    try {
      const account = await signInWithGoogle();
      const outcome = await syncAuthIdentity();
      setAccount(account);
      if (outcome === 'restored') Alert.alert(t('auth.restored'));
    } catch (err) {
      if (err instanceof GoogleUnavailable) Alert.alert(t('auth.googleUnavailableTitle'), t('auth.googleUnavailable'));
      else if (!(err instanceof GoogleCancelled)) alertProblem(...explain(err, 'provider', t));
      setBusy(false);
    }
  };

  const requestCode = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      alertProblem(t('auth.invalidEmail'));
      return;
    }
    setBusy(true);
    try {
      await sendEmailCode(email);
      setStep('code');
    } catch (err) {
      alertProblem(...explain(err, 'send', t));
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (value: string = code) => {
    if (busy) return;
    if (value.trim().length < 6) {
      alertProblem(t('auth.invalidCode'));
      return;
    }
    setBusy(true);
    try {
      const account = await verifyEmailCode(email, value);
      const outcome = await syncAuthIdentity();
      setAccount(account);
      if (outcome === 'restored') Alert.alert(t('auth.restored'));
    } catch (err) {
      alertProblem(...explain(err, 'verify', t));
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
          <Icon name="globe-outline" size={18} color={theme.primary} />
          <Text style={{ color: theme.primaryDark, fontWeight: '700', fontSize: 15 }}>
            {language === 'en' ? `${t('settings.english')} / ${t('settings.arabic')}` : `${t('settings.arabic')} / ${t('settings.english')}`}
          </Text>
          <Icon name="chevron-down" size={16} color={theme.primary} />
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
                        {on && <Icon name="checkmark" size={14} color={theme.onPrimary} />}
                      </View>
                      <Icon name={f.icon} size={40} color={theme.primary} />
                      <Text style={{ color: theme.primaryDark, fontWeight: '800', fontSize: 17, marginTop: Spacing.sm }}>{t(`welcome.focus.${f.key}`)}</Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 2 }}>{t(`welcome.focusHint.${f.key}`)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Button label={t('welcome.continueGuest')} onPress={() => setAccount({ name: t('welcome.guestName'), provider: 'guest' })} style={{ marginTop: Spacing.md }} />
              {appleReady && (
                <Pressable onPress={withApple} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.appleBtn, pressed && { opacity: 0.85 }]}>
                  <Icon name="logo-apple" size={19} color="#fff" />
                  <Text style={styles.appleLabel}>{t('auth.continueApple')}</Text>
                </Pressable>
              )}
              {googleReady && (
                <Pressable
                  onPress={withGoogle}
                  disabled={busy}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.googleBtn, { borderColor: theme.border }, pressed && { opacity: 0.85 }]}
                >
                  <Icon name="logo-google" size={18} color="#1F1F1F" />
                  <Text style={styles.googleLabel}>{t('auth.continueGoogle')}</Text>
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
                textContentType="emailAddress"
                autoComplete="email"
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
                onChangeText={(v) => {
                  // Digits only, first six: an autofilled or pasted code may
                  // carry a space or text around it, and a hard length limit
                  // would make iOS drop it altogether.
                  const digits = normalizeDigits(v).replace(/\D/g, '').slice(0, 6);
                  setCode(digits);
                  // A pasted or autofilled code signs in straight away.
                  if (digits.length === 6 && digits !== code) void confirmCode(digits);
                }}
                placeholder="123456"
                placeholderTextColor={theme.textTertiary}
                keyboardType="number-pad"
                // Lets iOS offer the code from Mail or Messages above the
                // keyboard, and Android offer it from its own autofill.
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                accessibilityLabel={t('auth.verify')}
                style={[styles.input, styles.codeInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              />
              <Button label={busy ? t('auth.signingIn') : t('auth.verify')} onPress={() => void confirmCode()} disabled={busy} />
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
  // Google's own button style: white, with a hairline border, in either theme.
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, backgroundColor: '#FFFFFF', borderWidth: 1, borderRadius: Radius.control, minHeight: 52, marginTop: Spacing.sm },
  googleLabel: { color: '#1F1F1F', fontSize: 17, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: Radius.control, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: 16, marginBottom: Spacing.sm },
  codeInput: { textAlign: 'center', fontSize: 24, fontWeight: '800', letterSpacing: 6 },
});
