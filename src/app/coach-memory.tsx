import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { EmptyState, InfoLine, RowGroup, SettingsRow } from '@/components/system';
import { Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic } from '@/lib/feedback';
import { useAppStore } from '@/lib/store';
import type { CoachShare } from '@/lib/types';

const SHARE_KEYS: (keyof CoachShare)[] = ['food', 'training', 'body', 'wearable'];
const SHARE_ICON: Record<keyof CoachShare, keyof typeof Ionicons.glyphMap> = {
  food: 'restaurant-outline',
  training: 'barbell-outline',
  body: 'body-outline',
  wearable: 'watch-outline',
};

/**
 * S18 Manage shared context — which of the person's own data the AI Support
 * snapshot may include (an explicit permission, saved on change), plus the
 * documents the coach remembers. The summaries, not the raw files, are what
 * is kept.
 */
export default function CoachMemory() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-US';
  const docs = useAppStore((s) => s.coachReferenceDocs);
  const removeCoachReferenceDoc = useAppStore((s) => s.removeCoachReferenceDoc);
  const share = useAppStore((s) => s.coachShare);
  const setCoachShare = useAppStore((s) => s.setCoachShare);

  const confirmRemove = (id: string, name: string) =>
    Alert.alert(t('coach.memoryDeleteConfirm', { name }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => removeCoachReferenceDoc(id) },
    ]);

  return (
    <Screen header={<PageHeader title={t('coach.manageContext')} close />}>
      <Text style={[Type.section, { color: theme.text }]}>{t('coach.shareTitle')}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 2, marginBottom: Spacing.ms }}>{t('coach.shareBody')}</Text>
      <RowGroup>
        {SHARE_KEYS.map((k, i) => (
          <SettingsRow
            key={k}
            icon={SHARE_ICON[k]}
            title={t(`coach.share.${k}`)}
            subtitle={t(`coach.shareDetail.${k}`)}
            chevron={false}
            last={i === SHARE_KEYS.length - 1}
            right={
              <Switch
                value={share[k]}
                onValueChange={(v) => {
                  lightHaptic();
                  setCoachShare({ [k]: v });
                }}
                accessibilityLabel={t(`coach.share.${k}`)}
                trackColor={{ true: theme.primary, false: theme.border }}
              />
            }
          />
        ))}
      </RowGroup>
      <InfoLine>{t('coach.shareNote')}</InfoLine>

      <Text style={[Type.section, { color: theme.text, marginTop: Spacing.lg }]}>{t('coach.memoryTitle')}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 2, marginBottom: Spacing.ms }}>{t('coach.memorySubtitle')}</Text>
      {docs.length === 0 ? (
        <EmptyState icon="bookmark-outline" title={t('coach.memoryEmptyTitle')} body={t('coach.memoryEmpty')} compact />
      ) : (
        <View style={{ gap: Spacing.sm }}>
          {docs.map((doc) => (
            <View key={doc.id} style={[styles.docCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
              <View style={styles.docHeader}>
                <Ionicons name="document-text-outline" size={18} color={theme.primary} />
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14, flex: 1 }} numberOfLines={1}>
                  {doc.name}
                </Text>
                <Pressable onPress={() => confirmRemove(doc.id, doc.name)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.delete')}>
                  <Ionicons name="trash-outline" size={17} color={theme.textTertiary} />
                </Pressable>
              </View>
              <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 }}>{doc.summary}</Text>
              <Text style={{ color: theme.textTertiary, fontSize: 11, marginTop: 8 }}>
                {t('coach.memoryAddedOn', { date: new Date(doc.addedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) })}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  docCard: { borderRadius: Radius.module, padding: Spacing.md },
  docHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
