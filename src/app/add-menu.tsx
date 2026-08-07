import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Theme = ReturnType<typeof useTheme>;

function Tile({
  icon,
  label,
  onPress,
  theme,
  primary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  theme: Theme;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: primary ? theme.primary : theme.card,
          borderColor: primary ? theme.primary : theme.border,
        },
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
    >
      <View
        style={[
          styles.tileIcon,
          { backgroundColor: primary ? 'rgba(255,255,255,0.22)' : theme.cardSubtle },
        ]}
      >
        <Ionicons name={icon} size={21} color={primary ? theme.onPrimary : theme.primary} />
      </View>
      <Text
        style={[styles.tileLabel, { color: primary ? theme.onPrimary : theme.text }]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SectionLabel({ label, theme }: { label: string; theme: Theme }) {
  return <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>{label}</Text>;
}

/**
 * Everything you can log, in one tap.
 *
 * The options are grouped rather than nested. Nesting them under Food /
 * Training would read more tidily, but it puts a tap in front of scanning a
 * meal — the thing people do several times a day — to tidy up the paths they
 * use rarely. Two headings buy the same clarity for free.
 */
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
      <Pressable
        style={[
          styles.sheet,
          { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.lg },
          cardShadow(theme.shadow),
        ]}
        // Swallow taps inside the sheet so it does not close under your finger.
        onPress={() => {}}
      >
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />

        <SectionLabel label={t('addMenu.food')} theme={theme} />
        <View style={styles.grid}>
          <Tile icon="camera" label={t('addMenu.scanMeal')} onPress={() => go('/scan?mode=meal')} theme={theme} primary />
          <Tile icon="barcode" label={t('addMenu.scanBarcode')} onPress={() => go('/scan?mode=barcode')} theme={theme} />
          <Tile icon="create" label={t('addMenu.describe')} onPress={() => go('/describe')} theme={theme} />
          <Tile icon="pencil" label={t('addMenu.manual')} onPress={() => go('/food-edit')} theme={theme} />
        </View>

        {!foodOnly && (
          <>
            <SectionLabel label={t('addMenu.training')} theme={theme} />
            <View style={styles.grid}>
              <Tile icon="barbell" label={t('addMenu.scanGym')} onPress={() => go('/scan?mode=gym')} theme={theme} />
              {/* Previously only reachable from the Training tab's footer, so
                  the same action lived in two places depending on the tab. */}
              <Tile icon="add-circle" label={t('addMenu.addExercise')} onPress={() => go('/exercise-library')} theme={theme} />
            </View>
          </>
        )}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  // Two per row, so labels have room to read at full length.
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    minHeight: 64,
  },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { flex: 1, fontSize: 14, fontWeight: '700' },
});
