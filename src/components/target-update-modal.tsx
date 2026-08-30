import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dailyTargets } from '@/lib/tdee';
import type { Profile } from '@/lib/types';

/**
 * Shown right after logging a weight that's meaningfully different from
 * whatever the profile's current calorie/macro targets were computed from —
 * compares the current target against what it would be with the new weight,
 * and lets the user apply it (which also brings `profile.weightKg` back in
 * sync) or dismiss and keep their existing targets.
 */
export function TargetUpdateModal({
  visible,
  profile,
  newWeightKg,
  onUpdate,
  onDismiss,
}: {
  visible: boolean;
  profile: Profile;
  newWeightKg: number;
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  const current = dailyTargets(profile);
  const recalculated = dailyTargets({ ...profile, weightKg: newWeightKg });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { backgroundColor: theme.background }]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <Text style={[Type.title, { color: theme.text, marginBottom: Spacing.xs }]}>
            {t('targetUpdate.title')}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 14.5, marginBottom: Spacing.lg }}>
            {t('targetUpdate.body', { weight: newWeightKg })}
          </Text>

          <View style={[styles.compareRow, { backgroundColor: theme.cardSubtle }]}>
            <View style={styles.compareCell}>
              <Text style={[styles.compareLabel, { color: theme.textTertiary }]}>
                {t('targetUpdate.current')}
              </Text>
              <Text style={[styles.compareValue, { color: theme.text }]}>
                {current.calories} {t('common.kcal')}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={theme.textTertiary} />
            <View style={styles.compareCell}>
              <Text style={[styles.compareLabel, { color: theme.textTertiary }]}>
                {t('targetUpdate.recalculated')}
              </Text>
              <Text style={[styles.compareValue, { color: theme.primary }]}>
                {recalculated.calories} {t('common.kcal')}
              </Text>
            </View>
          </View>

          <Button label={t('targetUpdate.update')} onPress={onUpdate} style={{ marginTop: Spacing.lg }} />
          <Button
            label={t('targetUpdate.notNow')}
            variant="ghost"
            onPress={onDismiss}
            style={{ marginTop: Spacing.xs }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: Spacing.md },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
  },
  compareCell: { alignItems: 'center', gap: 4 },
  compareLabel: { fontSize: 12, fontWeight: '600' },
  compareValue: { fontSize: 20, fontWeight: '800' },
});
