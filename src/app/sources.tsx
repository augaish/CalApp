import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { Icon } from '@/components/icon';
import { InfoLine } from '@/components/system';
import { Text } from '@/components/text';
import { Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { HEALTH_SECTIONS, type HealthSource } from '@/lib/health-sources';

/**
 * Health sources: what each health number in the app is and where the method
 * comes from, with links (App Store guideline 1.4.1). Reached from Settings,
 * Help, and a "Sources" link wherever those numbers are shown.
 */
export default function Sources() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';

  const open = (src: HealthSource) => {
    WebBrowser.openBrowserAsync(src.url).catch(() => Linking.openURL(src.url).catch(() => {}));
  };

  return (
    <Screen header={<PageHeader title={t('sources.title')} />}>
      <View style={[styles.disclaimer, { backgroundColor: theme.surfaceTint }]}>
        <Icon name="information-circle-outline" size={18} color={theme.primaryDark} />
        <Text style={{ flex: 1, color: theme.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>{t('sources.disclaimer')}</Text>
      </View>

      {HEALTH_SECTIONS.map((section) => (
        <View key={section.id} style={{ marginTop: Spacing.lg }}>
          <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6, marginStart: 4 }]} accessibilityRole="header">
            {t(`sources.section.${section.id}`)}
          </Text>
          <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
            {section.topics.map((topic, i) => (
              <View key={topic.id} style={[styles.topic, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <View style={[styles.icon, { backgroundColor: theme.surfaceTint }]}>
                  <Icon name={topic.icon} size={18} color={theme.primaryDark} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }} accessibilityRole="header">
                    {t(`sources.${topic.id}.title`)}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>{t(`sources.${topic.id}.body`)}</Text>
                  {topic.sources.map((src) => (
                    <Pressable
                      key={src.url}
                      onPress={() => open(src)}
                      hitSlop={6}
                      accessibilityRole="link"
                      accessibilityLabel={src.label[lang]}
                      style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={{ color: theme.primary, fontSize: 14, fontWeight: '700', flexShrink: 1 }}>{src.label[lang]}</Text>
                      <Icon name="open-outline" size={14} color={theme.primary} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}

      <View style={{ marginTop: Spacing.lg }}>
        <InfoLine>{t('sources.footer')}</InfoLine>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  disclaimer: { flexDirection: 'row', gap: Spacing.sm, borderRadius: Radius.md, padding: Spacing.ms },
  card: { borderRadius: Radius.md, paddingHorizontal: Spacing.ms },
  topic: { flexDirection: 'row', gap: Spacing.ms, paddingVertical: Spacing.ms },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, minHeight: 28 },
});
