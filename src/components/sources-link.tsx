import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * "How we calculate these, with sources": the row next to a set of health
 * numbers that opens the Health sources page (App Store guideline 1.4.1 —
 * the citations have to be easy to find from where the numbers are).
 */
export function SourcesLink({ label, style }: { label?: string; style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const text = label ?? t('sources.link');
  return (
    <Pressable
      onPress={() => router.push('/sources')}
      accessibilityRole="link"
      accessibilityLabel={text}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.surfaceTint }, pressed && { opacity: 0.7 }, style]}
    >
      <Icon name="book-outline" size={17} color={theme.primaryDark} />
      <Text style={{ flex: 1, color: theme.text, fontSize: 14, fontWeight: '600' }}>{text}</Text>
      <Icon name="chevron-forward" size={15} color={theme.textTertiary} />
    </Pressable>
  );
}

/**
 * The line under an AI answer or estimate: "AI estimate, not medical advice ·
 * Sources", where Sources opens the Health sources page.
 */
export function AiSourcesNote({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.note, style]}>
      <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: '600' }}>{t('sources.aiNote')} · </Text>
      <Pressable onPress={() => router.push('/sources')} hitSlop={10} accessibilityRole="link" accessibilityLabel={t('sources.title')}>
        <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>{t('sources.short')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.control, paddingHorizontal: Spacing.ms, minHeight: 44 },
  note: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
});
