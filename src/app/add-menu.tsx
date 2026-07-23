import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
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
  const { scope } = useLocalSearchParams<{ scope?: string }>();
  const foodOnly = scope === 'food';

  const go = (href: Href) => {
    router.back();
    router.push(href);
  };

  return (
    <Pressable style={styles.backdrop} onPress={() => router.back()}>
      <View style={[styles.content, { paddingBottom: insets.bottom + 96 }]} pointerEvents="box-none">
        {/* Hero circle(s) */}
        <View style={styles.circleRow} pointerEvents="box-none">
          <View style={styles.circleCol}>
            <Pressable
              onPress={() => go('/scan?mode=meal')}
              style={({ pressed }) => [
                styles.circle,
                { backgroundColor: theme.primary },
                cardShadow(theme.shadow),
                pressed && { transform: [{ scale: 0.93 }] },
              ]}
            >
              <Ionicons name="camera" size={34} color={theme.onPrimary} />
            </Pressable>
            <Text style={styles.circleLabel}>{t('home.scanMeal')}</Text>
          </View>

          {!foodOnly && (
            <View style={styles.circleCol}>
              <Pressable
                onPress={() => go('/scan?mode=gym')}
                style={({ pressed }) => [
                  styles.circle,
                  { backgroundColor: '#FFFFFF' },
                  cardShadow(theme.shadow),
                  pressed && { transform: [{ scale: 0.93 }] },
                ]}
              >
                <Ionicons name="barbell" size={34} color={theme.text} />
              </Pressable>
              <Text style={styles.circleLabel}>{t('home.scanGym')}</Text>
            </View>
          )}
        </View>

        {/* Secondary options */}
        <View style={styles.pillRow} pointerEvents="box-none">
          <Pressable
            onPress={() => go('/scan?mode=barcode')}
            style={({ pressed }) => [
              styles.pill,
              { backgroundColor: 'rgba(255,255,255,0.95)' },
              pressed && { transform: [{ scale: 0.96 }] },
            ]}
          >
            <Ionicons name="barcode" size={18} color={theme.text} />
            <Text style={[styles.pillLabel, { color: theme.text }]}>{t('addMenu.scanBarcode')}</Text>
          </Pressable>
          <Pressable
            onPress={() => go('/describe')}
            style={({ pressed }) => [
              styles.pill,
              { backgroundColor: 'rgba(255,255,255,0.95)' },
              pressed && { transform: [{ scale: 0.96 }] },
            ]}
          >
            <Ionicons name="create" size={18} color={theme.text} />
            <Text style={[styles.pillLabel, { color: theme.text }]}>{t('addMenu.describe')}</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: Spacing.lg },
  circleRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginBottom: Spacing.lg,
  },
  circleCol: { alignItems: 'center', gap: Spacing.sm },
  circle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  pillRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    minHeight: 44,
  },
  pillLabel: { fontSize: 14, fontWeight: '600' },
});
