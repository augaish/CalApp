import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { IconTile, InfoLine } from '@/components/system';
import { Button, Screen } from '@/components/ui';
import { Radius, Spacing, TOUCH, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic } from '@/lib/feedback';
import { usePending } from '@/lib/pending';

/**
 * S16 Product not found — the barcode was read but no catalogue has it. Two
 * routes into S29's structured review form (label photo or manual entry),
 * both usable without any credit gate on the manual path. The catalogue
 * share is an opt-in that defaults off; ticking it does not submit anything,
 * it only records consent for the save that follows.
 */
export default function ProductNotFound() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { code = '' } = useLocalSearchParams<{ code?: string }>();
  const consent = usePending((s) => s.catalogueConsent);
  const setConsent = usePending((s) => s.setCatalogueConsent);
  const q = encodeURIComponent(code);

  return (
    <Screen header={<PageHeader title={t('productNotFound.title')} onBack={() => router.replace('/scan?mode=barcode')} />}>
      <View style={{ alignItems: 'center', marginTop: Spacing.sm }}>
        <IconTile icon="barcode-outline" size={128} />
        <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: Spacing.ms }}>{t('productNotFound.captured')}</Text>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800', marginTop: 2 }} selectable>
          {code}
        </Text>
        <Text style={[Type.title, { color: theme.text, marginTop: Spacing.lg, textAlign: 'center' }]} accessibilityRole="header">
          {t('productNotFound.title')}
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: 16, marginTop: 4, textAlign: 'center' }}>{t('productNotFound.body')}</Text>
      </View>

      <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
        <Button
          label={t('productNotFound.photographLabel')}
          icon="camera"
          onPress={() => router.replace(`/scan?mode=meal&barcode=${q}`)}
        />
        <Button
          label={t('productNotFound.enterManually')}
          icon="pencil"
          variant="secondary"
          onPress={() => router.replace(`/food-edit?barcode=${q}`)}
        />
      </View>

      <Pressable
        onPress={() => {
          lightHaptic();
          setConsent(!consent);
        }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        accessibilityLabel={t('productNotFound.shareTitle')}
        style={[styles.consent, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}
      >
        <View style={[styles.box, { borderColor: consent ? theme.primary : theme.textTertiary, backgroundColor: consent ? theme.primary : 'transparent' }]}>
          {consent && <Ionicons name="checkmark" size={18} color={theme.onPrimary} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{t('productNotFound.shareTitle')}</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>
            {consent ? t('productNotFound.shareOn') : t('productNotFound.shareBody')}
          </Text>
        </View>
      </Pressable>

      <View style={[styles.note, { backgroundColor: theme.surfaceTint }]}>
        <InfoLine icon="information-circle-outline">{t('productNotFound.reviewNote')}</InfoLine>
      </View>

      <Pressable
        onPress={() => router.replace('/scan?mode=barcode')}
        accessibilityRole="link"
        style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}
      >
        <Text style={{ color: theme.primaryDark, fontWeight: '700', fontSize: 15, textDecorationLine: 'underline' }}>
          {t('productNotFound.tryAnother')}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  consent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.module, padding: Spacing.md, marginTop: Spacing.lg },
  box: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  note: { borderRadius: Radius.control, paddingHorizontal: Spacing.ms, paddingBottom: 8, paddingTop: 2, marginTop: Spacing.md },
  link: { alignSelf: 'center', minHeight: TOUCH, justifyContent: 'center', marginTop: Spacing.sm },
});
