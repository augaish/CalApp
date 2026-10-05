import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ActionButton, ProgressTrack } from '@/components/system';
import { Text } from '@/components/text';
import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { usePlanGate } from '@/hooks/use-plan-gate';
import { useTheme } from '@/hooks/use-theme';
import { useEntitlement } from '@/lib/entitlement';
import { periodResetsOn, planLabelKey, usageRows } from '@/lib/plan-gates';
import { useAppStore } from '@/lib/store';

function useDate() {
  const { i18n } = useTranslation();
  return (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language === 'ar' ? 'ar' : 'en', { day: 'numeric', month: 'long' });
}

/**
 * Overview's plan notice, shown only when there is something to do: no plan
 * (records are view-only until a trial starts) or an Essentials member who
 * hasn't chosen Food or Training yet.
 */
export function PlanStatusCard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const gate = usePlanGate();

  if (!gate.readOnly && !gate.visible.chooseModule) return null;
  const choose = gate.visible.chooseModule;
  return (
    <Pressable
      onPress={() => router.push(choose ? '/focus' : '/membership?reason=subscribe')}
      accessibilityRole="button"
      style={({ pressed }) => [styles.notice, { backgroundColor: theme.card, borderColor: theme.primary }, cardShadow(theme.shadow), pressed && { opacity: 0.85 }]}
    >
      <Icon name={choose ? 'options-outline' : 'lock-closed-outline'} size={22} color={theme.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{t(choose ? 'plans.chooseFocusTitle' : 'plans.readOnlyTitle')}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{t(choose ? 'plans.chooseFocusBody' : 'plans.readOnlyBody')}</Text>
      </View>
      <Icon name="chevron-forward" size={16} color={theme.textTertiary} />
    </Pressable>
  );
}

/**
 * Top of the Food or Training tab when the plan doesn't cover it: the history
 * stays here to look back on, and the way to add the module is one tap away.
 */
export function ModuleBanner({ area }: { area: 'food' | 'training' }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const gate = usePlanGate();
  if (gate.isOpen(area)) return null;
  const body = gate.readOnly ? t('plans.readOnlyBody') : t(`plans.moduleBanner.${area}`);
  return (
    <Pressable
      onPress={() => gate.guard(area)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.banner, { backgroundColor: theme.surfaceTint }, pressed && { opacity: 0.85 }]}
    >
      <Icon name="lock-closed-outline" size={16} color={theme.primaryDark} />
      <Text style={{ color: theme.primaryDark, fontSize: 13, lineHeight: 18, flex: 1, fontWeight: '600' }}>{body}</Text>
      <Icon name="chevron-forward" size={14} color={theme.primaryDark} />
    </Pressable>
  );
}

/**
 * Profile's membership card: the plan and its focus, the trial or code end
 * date, and this month's AI use as a bar with what's left and when it resets.
 * Taps through to the Membership page, which breaks the use down by kind.
 */
export function MembershipCard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const date = useDate();
  const plan = useEntitlement((s) => s.plan) ?? 'free';
  const locks = useEntitlement((s) => s.locks);
  const module = useEntitlement((s) => s.module);
  const trial = useEntitlement((s) => s.trial);
  const planUntil = useEntitlement((s) => s.planUntil);
  const promo = useEntitlement((s) => s.promo);
  const used = useEntitlement((s) => s.used) ?? 0;
  const limit = useEntitlement((s) => s.limit) ?? 0;
  const period = useEntitlement((s) => s.period);

  const pending = useAppStore((s) => s.planSwitch);
  // A trial is everything; what follows is the plan chosen (or the switch to
  // Essentials made during it).
  const next = pending ? t(`plans.name.essentials_${pending.module}`) : t(planLabelKey(plan, locks, module));
  const title = trial ? t('plans.trialTitle') : t(planLabelKey(plan, locks, module));
  const status = trial
    ? planUntil
      ? t('plans.trialThen', { date: date(planUntil), plan: next })
      : t('plans.trialThenNoDate', { plan: next })
    : pending && planUntil
      ? t('plans.switchOn', { plan: next, date: date(planUntil) })
      : promo
        ? t('plans.codeUntil', { date: date(promo.until) })
        : null;
  const left = Math.max(0, limit - used);
  const resets = period ? periodResetsOn(period) : null;

  return (
    <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
      <Pressable onPress={() => router.push('/upgrade')} accessibilityRole="button" style={({ pressed }) => [styles.head, pressed && { opacity: 0.7 }]}>
        <Icon name="sparkles" size={20} color={theme.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17 }}>{title}</Text>
          {status ? <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>{status}</Text> : null}
        </View>
        <Icon name="chevron-forward" size={16} color={theme.textTertiary} />
      </Pressable>

      <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700', marginTop: Spacing.md, marginBottom: 6 }}>{t('plans.aiThisMonth')}</Text>
      {limit > 0 ? (
        <>
          <ProgressTrack value={used} max={limit} height={10} color={left === 0 ? theme.warning : theme.primary} />
          <View style={styles.usageRow}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{t('plans.usedOf', { used, limit })}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {resets ? t('plans.leftResets', { left, date: date(resets) }) : t('plans.left', { left })}
            </Text>
          </View>
        </>
      ) : (
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('plans.noAi')}</Text>
      )}

      {plan === 'essentials' && locks ? (
        <View style={{ marginTop: Spacing.sm }}>
          <ActionButton label={t('plans.changeFocus')} icon="options-outline" variant="secondary" onPress={() => router.push('/focus')} />
        </View>
      ) : null}
    </View>
  );
}

/** This month's AI use by kind, for the Membership page. */
export function UsageBreakdown() {
  const { t } = useTranslation();
  const theme = useTheme();
  const usage = useEntitlement((s) => s.usage);
  const weights = useEntitlement((s) => s.weights);
  const rows = usageRows(usage ?? {}, weights ?? {});
  if (rows.length === 0) return null;
  return (
    <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15, marginBottom: Spacing.sm }}>{t('plans.breakdownTitle')}</Text>
      {rows.map((r) => (
        <View key={r.kind} style={[styles.breakRow, { borderTopColor: theme.border }]}>
          <Text style={{ color: theme.text, fontSize: 14, flex: 1 }}>{t(`plans.kinds.${r.kind}`)}</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            {r.weight > 1 ? t('plans.timesWeighted', { times: r.times, actions: r.actions }) : t('plans.actionsCount', { count: r.actions })}
          </Text>
        </View>
      ))}
      <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: Spacing.sm, lineHeight: 17 }}>{t('plans.breakdownNote')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.module, borderWidth: 1, padding: Spacing.md, marginTop: Spacing.sm, marginBottom: Spacing.ms },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: Radius.control, marginBottom: Spacing.ms },
  card: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  usageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6, gap: Spacing.sm, flexWrap: 'wrap' },
  breakRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
