import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function AddMenu() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const go = (href: Href) => {
    router.back();
    router.push(href);
  };

  const options: { icon: keyof typeof Ionicons.glyphMap; label: string; href: Href }[] = [
    { icon: 'camera', label: t('addMenu.scanMeal'), href: '/scan?mode=meal' },
    { icon: 'barcode', label: t('addMenu.scanBarcode'), href: '/scan?mode=barcode' },
    { icon: 'create', label: t('addMenu.describe'), href: '/describe' },
    { icon: 'barbell', label: t('addMenu.scanGym'), href: '/scan?mode=gym' },
  ];

  return (
    <Pressable style={styles.backdrop} onPress={() => router.back()}>
      <Pressable
        onPress={(e) => e.stopPropagation()}
        style={[
          styles.sheet,
          { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.lg },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <Text style={[styles.title, { color: theme.text }]}>{t('addMenu.title')}</Text>
        {options.map((opt) => (
          <Pressable
            key={opt.icon}
            onPress={() => go(opt.href)}
            style={({ pressed }) => [
              styles.option,
              { backgroundColor: theme.card },
              cardShadow(theme.shadow),
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
          >
            <View style={[styles.optionIcon, { backgroundColor: theme.cardSubtle }]}>
              <Ionicons name={opt.icon} size={22} color={theme.primary} />
            </View>
            <Text style={[styles.optionLabel, { color: theme.text }]}>{opt.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </Pressable>
        ))}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.md,
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: Spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    minHeight: 60,
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: { flex: 1, fontSize: 16, fontWeight: '600' },
});
