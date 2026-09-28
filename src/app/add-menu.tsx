import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { alertProblem } from '@/lib/alerts';
import { RowGroup, SettingsRow } from '@/components/system';
import { Radius, Spacing, TOUCH, Type, cardShadow } from '@/constants/theme';
import { usePlanGate } from '@/hooks/use-plan-gate';
import type { Gate } from '@/lib/plan-gates';
import { useTheme } from '@/hooks/use-theme';
import { photoPickerAvailable, pickPhoto } from '@/lib/photo';

/** A group heading on the Add sheet: a large glyph, the name and one line on what it covers. */
function GroupHead({ icon, color, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; subtitle: string }) {
  const theme = useTheme();
  return (
    <View style={styles.groupHead} accessibilityRole="header">
      <Icon name={icon} size={30} color={color} style={{ width: 36, textAlign: 'center' }} />
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

  const gate = usePlanGate();
  const go = (href: Href) => {
    router.back();
    router.push(href);
  };
  // Each area's rows open their screen when the plan covers it, and the
  // membership sheet (with the reason) when it doesn't.
  const to = (area: Gate, href: Href) => {
    if (gate.isOpen(area)) return go(href);
    router.back();
    gate.guard(area);
  };
  const icon = (area: Gate, name: keyof typeof Ionicons.glyphMap) => (gate.isOpen(area) ? name : 'lock-closed-outline');
  const showFood = gate.visible.food;
  const showTraining = gate.visible.training;

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
      alertProblem(t('common.error'));
    }
    setPicking(false);
    if (uri) go(`/photo-analyze?mode=meal&uri=${encodeURIComponent(uri)}`);
  };
  const upload = () => (gate.isOpen('food') ? void uploadPhoto() : to('food', '/'));

  return (
    <View style={styles.backdrop}>
      {/* Tap outside to close: a layer behind the sheet, not a wrapper around
          it — wrapped, VoiceOver read the whole sheet as one "Close" button. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.close')} />
      <View onStartShouldSetResponder={() => true}
        style={[styles.sheet, { backgroundColor: theme.background, maxHeight: '92%' }, cardShadow(theme.shadow)]}
        // Swallow taps inside the sheet so it does not close under your finger.
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
            <Icon name="close" size={26} color={theme.textSecondary} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.md }}>
          {gate.readOnly ? (
            // No plan: the records are safe; adding needs a plan.
            <Pressable
              onPress={() => to('health', '/')}
              accessibilityRole="button"
              style={[styles.hint, { backgroundColor: theme.surfaceTint, marginTop: 0, marginBottom: Spacing.sm }]}
            >
              <Icon name="lock-closed-outline" size={16} color={theme.primaryDark} />
              <Text style={{ color: theme.primaryDark, fontSize: 13, flex: 1, fontWeight: '600' }}>{t('plans.readOnlyBody')}</Text>
            </Pressable>
          ) : null}
          {gate.visible.chooseModule ? (
            <SettingsRow icon="options-outline" title={t('plans.chooseFocusTitle')} subtitle={t('plans.chooseFocusBody')} onPress={() => go('/focus')} last />
          ) : null}

          {showFood && (
            <>
              <GroupHead icon="restaurant" color="#F59E0B" title={t('addMenu.food')} subtitle={t('addMenu.foodSubtitle')} />
              <RowGroup>
                <SettingsRow icon={icon('food', 'scan-outline')} title={t('addMenu.scanMealRow')} onPress={() => to('food', '/scan?mode=meal')} />
                <SettingsRow icon={icon('food', 'barcode-outline')} title={t('addMenu.scanBarcode')} onPress={() => to('food', '/scan?mode=barcode')} />
                <SettingsRow icon={icon('food', 'search-outline')} title={t('addMenu.searchFood')} onPress={() => to('food', '/food-search')} />
                <SettingsRow icon={icon('food', 'document-text-outline')} title={t('addMenu.manualRow')} onPress={() => to('food', '/food-edit')} />
                {/* Two working routes the board does not list, kept in the same row style. */}
                <SettingsRow icon={icon('food', 'images-outline')} title={t('addMenu.uploadPhoto')} onPress={upload} />
                <SettingsRow icon={icon('food', 'create-outline')} title={t('addMenu.describe')} onPress={() => to('food', '/describe')} last />
              </RowGroup>
            </>
          )}

          {!foodOnly && (
            <>
              {showTraining && (
                <>
                  <GroupHead icon="barbell" color={theme.primary} title={t('addMenu.training')} subtitle={t('addMenu.trainingSubtitle')} />
                  <RowGroup>
                    <SettingsRow icon={icon('training', 'walk-outline')} title={t('addMenu.logExercise')} onPress={() => to('training', '/exercise-library')} />
                    <SettingsRow icon={icon('training', 'qr-code-outline')} title={t('addMenu.scanEquipment')} onPress={() => to('training', '/scan?mode=gym')} last />
                  </RowGroup>
                </>
              )}

              <GroupHead icon="heart" color={theme.primary} title={t('addMenu.health')} subtitle={t('addMenu.healthSubtitle')} />
              <RowGroup>
                <SettingsRow icon={icon('health', 'add-circle-outline')} title={t('addMenu.addReading')} onPress={() => to('health', '/body-reading')} />
                <SettingsRow icon={icon('health', 'image-outline')} title={t('addMenu.readMeasurementPhoto')} onPress={() => to('health', '/scan?mode=body')} last />
              </RowGroup>

              <GroupHead icon="water" color="#3B82F6" title={t('addMenu.daily')} subtitle={t('addMenu.dailySubtitle')} />
              <RowGroup>
                <SettingsRow icon={icon('health', 'water-outline')} title={t('addMenu.water')} onPress={() => to('health', '/water')} last />
              </RowGroup>
            </>
          )}

          {showFood ? (
          <View style={[styles.hint, { backgroundColor: theme.surfaceTint }]}>
            <Icon name="bulb-outline" size={16} color={theme.primaryDark} />
            <Text style={{ color: theme.primaryDark, fontSize: 13, flex: 1 }}>
              {t('addMenu.foodPlanningHintLead')} <Text style={{ fontWeight: '800' }}>{t('tabs.food')}</Text>.
            </Text>
          </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
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
