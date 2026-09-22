import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Screen, Subtitle, Title } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { redeemCode, type RedeemResponse } from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import { loadStorePlans, purchasesStatus, takeStoreOffer } from '@/lib/purchases';

type Done = Extract<RedeemResponse, { ok: true }>;

/**
 * Redeem a promotion code.
 *
 * Two outcomes, matching the two kinds of code (see server/src/promo.ts): a
 * free code switches the tier on here and now; a percent code hands the
 * person to the store, which shows the discounted price with their tax and
 * takes the payment. Opens from the upgrade screen, Profile, or a link
 * (calapp://redeem?code=RAMADAN50) so a code on a poster is one tap.
 */
export default function Redeem() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const refresh = useEntitlement((s) => s.refresh);

  const [code, setCode] = useState(typeof params.code === 'string' ? params.code : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [storeNote, setStoreNote] = useState<string | null>(null);

  const planName = (plan: string) => (plan === 'proPlus' ? t('upgrade.planProPlus') : t('upgrade.planPro'));
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language === 'ar' ? 'ar' : 'en', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const apply = async () => {
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    const res = await redeemCode(code);
    setBusy(false);
    if (!res.ok) {
      setError(t(`redeem.errors.${res.reason}`));
      return;
    }
    setDone(res);
    if (res.kind === 'free') await refresh();
  };

  const toStore = async () => {
    if (!done || done.kind !== 'percent') return;
    setBusy(true);
    setStoreNote(null);
    const loaded = Platform.OS === 'android' ? await loadStorePlans() : null;
    const out = await takeStoreOffer(done, loaded);
    setBusy(false);
    if (out.kind === 'purchased') {
      await refresh();
      setStoreNote(t('redeem.purchased', { plan: planName(done.plan) }));
    } else if (out.kind === 'opened') {
      setStoreNote(t('redeem.opened'));
    } else if (out.kind === 'pending') {
      setStoreNote(t('upgrade.purchasePending'));
    } else if (out.kind === 'no_offer') {
      setStoreNote(
        Platform.OS === 'android' && purchasesStatus() === 'unlinked' ? t('redeem.updateNeeded') : t('redeem.noOffer'),
      );
    } else if (out.kind === 'failed') {
      setStoreNote(t('upgrade.purchaseFailed'));
    }
  };

  const usable = code.replace(/[\s._-]/g, '').length >= 3;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        footer={
          <View>
            {!done ? (
              <Button label={t('redeem.apply')} onPress={apply} loading={busy} disabled={!usable} />
            ) : done.kind === 'percent' ? (
              <Button
                label={Platform.OS === 'android' ? t('redeem.toPlay') : t('redeem.toAppStore')}
                onPress={toStore}
                loading={busy}
              />
            ) : (
              <Button label={t('common.done')} onPress={() => router.back()} />
            )}
            <Button
              label={done ? t('common.close') : t('common.cancel')}
              variant="ghost"
              onPress={() => router.back()}
              style={{ marginTop: Spacing.xs }}
            />
          </View>
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </Pressable>
        </View>
        <Title>{t('redeem.title')}</Title>
        <Subtitle>{t('redeem.hint')}</Subtitle>

        {!done ? (
          <>
            <TextInput
              value={code}
              onChangeText={(v) => {
                setCode(v);
                if (error) setError(null);
              }}
              placeholder={t('redeem.placeholder')}
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              autoFocus={!params.code}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={() => usable && void apply()}
              accessibilityLabel={t('redeem.title')}
              style={[
                styles.input,
                {
                  backgroundColor: theme.card,
                  borderColor: error ? theme.danger : theme.border,
                  color: theme.text,
                },
              ]}
            />
            {error ? (
              <Text style={{ color: theme.errorText, marginTop: Spacing.sm, fontWeight: '600' }} accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
          </>
        ) : (
          <Card style={{ borderColor: theme.primary, borderWidth: 1, marginTop: Spacing.md }}>
            <View style={styles.doneRow}>
              <Ionicons
                name={done.kind === 'free' ? 'checkmark-circle' : 'pricetag'}
                size={26}
                color={theme.primary}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>
                  {done.kind === 'free'
                    ? t('redeem.freeTitle', { plan: planName(done.plan) })
                    : t('redeem.percentTitle', { percent: done.percentOff, plan: planName(done.plan) })}
                </Text>
                <Text style={{ color: theme.textSecondary, marginTop: 4, lineHeight: 20 }}>
                  {done.kind === 'free'
                    ? t('redeem.freeBody', { date: date(done.until) })
                    : t('redeem.percentBody')}
                </Text>
                <Text style={{ color: theme.textTertiary, marginTop: 6, fontSize: 12, fontWeight: '700' }}>
                  {done.code}
                </Text>
              </View>
            </View>
            {storeNote ? (
              <Text style={{ color: theme.text, marginTop: Spacing.sm, lineHeight: 20 }} accessibilityLiveRegion="polite">
                {storeNote}
              </Text>
            ) : null}
          </Card>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 56,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  doneRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
});
