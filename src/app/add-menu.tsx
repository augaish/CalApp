import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RowGroup, SettingsRow } from '@/components/system';
import { Radius, Spacing, TOUCH, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { photoPickerAvailable, pickPhoto } from '@/lib/photo';

/** A group heading on the Add sheet: a large glyph, the name and one line on what it covers. */
function GroupHead({ icon, color, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; subtitle: string }) {
  const theme = useTheme();
  return (
    <View style={styles.groupHead} accessibilityRole="header">
      <Ionicons name={icon} size={30} color={color} style={{ width: 36, textAlign: 'center' }} />
      <View style={{ flex: 1 }}>
        <Text style={[Type.section, { color: theme.text, fontSize: 19 }]}>{title}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{subtitle}</Text>
      </View>
    </View>
  );
}

/**
 * S15 Add — the one sheet behind the centre tab: what you can record right
 * now, grouped by Food, Training, Health and Daily. Choosing an action closes
 * the sheet into its route; cancelling returns to the originating screen.
 * Recipes, shopping and the weekly review are deliberately not here (they
 * live in Food), and a hint says so.
 */
export default function AddMenu() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scope } = useLocalSearchParams<{ scope?: string }>();
  const foodOnly = scope === 'food';

  const [picking, setPicking] = useState(false);

  const go = (href: Href) => {
    router.back();
    router.push(href);
  };

  /** Straight to the photo library — no viewfinder flash or camera prompt for a flow that needs neither. */
  const uploadPhoto = async () => {
    if (picking) return;
    if (!photoPickerAvailable) {
      Alert.alert(t('scan.galleryUnavailableTitle'), t('scan.galleryUnavailable'));
      return;
    }
    setPicking(true);
    let uri: string | null = null;
    try {
      uri = await pickPhoto();
    } catch {
      Alert.alert(t('common.error'));
    }
    setPicking(false);
    if (uri) go(`/photo-analyze?mode=meal&uri=${encodeURIComponent(uri)}`);
  };

  return (
    <Pressable style={styles.backdrop} onPress={() => router.back()} accessibilityLabel={t('common.close')}>
      <Pressable
        style={[styles.sheet, { backgroundColor: theme.background, maxHeight: '92%' }, cardShadow(theme.shadow)]}
        // Swallow taps inside the sheet so it does not close under your finger.
        onPress={() => {}}
      >
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[Type.title, { color: theme.text }]} accessibilityRole="header">
              {t('addMenu.title')}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 15, marginTop: 2 }}>{t('addMenu.subtitle')}</Text>
          </View>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="close" size={26} color={theme.textSecondary} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.md }}>
          <GroupHead icon="restaurant" color="#F59E0B" title={t('addMenu.food')} subtitle={t('addMenu.foodSubtitle')} />
          <RowGroup>
            <SettingsRow icon="scan-outline" title={t('addMenu.scanMealRow')} onPress={() => go('/scan?mode=meal')} />
            <SettingsRow icon="barcode-outline" title={t('addMenu.scanBarcode')} onPress={() => go('/scan?mode=barcode')} />
            <SettingsRow icon="search-outline" title={t('addMenu.searchFood')} onPress={() => go('/food-search')} />
            <SettingsRow icon="document-text-outline" title={t('addMenu.manualRow')} onPress={() => go('/food-edit')} />
            {/* Two working routes the board does not list, kept in the same row style. */}
            <SettingsRow icon="images-outline" title={t('addMenu.uploadPhoto')} onPress={uploadPhoto} />
            <SettingsRow icon="create-outline" title={t('addMenu.describe')} onPress={() => go('/describe')} last />
          </RowGroup>

          {!foodOnly && (
            <>
              <GroupHead icon="barbell" color={theme.primary} title={t('addMenu.training')} subtitle={t('addMenu.trainingSubtitle')} />
              <RowGroup>
                <SettingsRow icon="walk-outline" title={t('addMenu.logExercise')} onPress={() => go('/exercise-library')} />
                <SettingsRow icon="qr-code-outline" title={t('addMenu.scanEquipment')} onPress={() => go('/scan?mode=gym')} last />
              </RowGroup>

              <GroupHead icon="heart" color={theme.primary} title={t('addMenu.health')} subtitle={t('addMenu.healthSubtitle')} />
              <RowGroup>
                <SettingsRow icon="add-circle-outline" title={t('addMenu.addReading')} onPress={() => go('/body-reading')} />
                <SettingsRow icon="image-outline" title={t('addMenu.readMeasurementPhoto')} onPress={() => go('/scan?mode=body')} last />
              </RowGroup>

              <GroupHead icon="water" color="#3B82F6" title={t('addMenu.daily')} subtitle={t('addMenu.dailySubtitle')} />
              <RowGroup>
                <SettingsRow icon="water-outline" title={t('addMenu.water')} onPress={() => go('/water')} last />
              </RowGroup>
            </>
          )}

          <View style={[styles.hint, { backgroundColor: theme.surfaceTint }]}>
            <Ionicons name="bulb-outline" size={16} color={theme.primaryDark} />
            <Text style={{ color: theme.primaryDark, fontSize: 13, flex: 1 }}>
              {t('addMenu.foodPlanningHintLead')} <Text style={{ fontWeight: '800' }}>{t('tabs.food')}</Text>.
            </Text>
          </View>
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(33,27,46,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.page,
    paddingTop: Spacing.sm,
  },
  grabber: { width: 60, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: Spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  close: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', marginTop: -6, marginEnd: -8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: Radius.control, marginTop: Spacing.xs },
});
