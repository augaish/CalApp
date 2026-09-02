import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/lib/store';

/** Lists the documents the coach remembers (see CoachReferenceDoc) and lets
 * the user forget one — the summaries themselves, not the raw files, since
 * those were never kept past the one analysis call. */
export default function CoachMemory() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-US';
  const docs = useAppStore((s) => s.coachReferenceDocs);
  const removeCoachReferenceDoc = useAppStore((s) => s.removeCoachReferenceDoc);

  const confirmRemove = (id: string, name: string) =>
    Alert.alert(t('coach.memoryDeleteConfirm', { name }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => removeCoachReferenceDoc(id) },
    ]);

  return (
    <Screen>
      <View style={styles.header}>
        <Title>{t('coach.memoryTitle')}</Title>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>
      <Text style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
        {t('coach.memorySubtitle')}
      </Text>

      {docs.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl }}>
          <Ionicons name="bookmark-outline" size={28} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center', fontSize: 13 }}>
            {t('coach.memoryEmpty')}
          </Text>
        </Card>
      ) : (
        <View style={{ gap: Spacing.sm }}>
          {docs.map((doc) => (
            <View key={doc.id} style={[styles.docCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
              <View style={styles.docHeader}>
                <Ionicons name="document-text-outline" size={18} color={theme.primary} />
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14, flex: 1 }} numberOfLines={1}>
                  {doc.name}
                </Text>
                <Pressable onPress={() => confirmRemove(doc.id, doc.name)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={17} color={theme.textTertiary} />
                </Pressable>
              </View>
              <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 }}>
                {doc.summary}
              </Text>
              <Text style={{ color: theme.textTertiary, fontSize: 11, marginTop: 8 }}>
                {t('coach.memoryAddedOn', {
                  date: new Date(doc.addedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
                })}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  docCard: { borderRadius: Radius.md, padding: Spacing.md },
  docHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
