import { router } from 'expo-router';
import { create } from 'zustand';

import { fetchEntitlement, type Entitlement } from './api';
import i18n from './i18n';
import { gateOpen, lockReasonFor } from './plan-gates';
import { configurePurchases, setPlanChangedHandler } from './purchases';
import { setNotifyGateSource, syncReminders } from './reminders';
import { setWriteGuard, useAppStore } from './store';
import { syncTrialReminder } from './trial-reminder';

/**
 * Plan + remaining AI allowance, mirrored from the server (`/api/me`).
 * Not persisted: it is cheap to refetch and must never go stale on device.
 */
interface EntitlementState extends Partial<Entitlement> {
  loaded: boolean;
  refresh: () => Promise<void>;
  /** Locally decrement after a successful AI action for instant feedback. */
  spend: (kind?: 'coach') => void;
}

export const useEntitlement = create<EntitlementState>((set, get) => ({
  loaded: false,
  refresh: async () => {
    const data = await fetchEntitlement();
    if (data) set({ ...data, loaded: true });
    else set({ loaded: true });
    if (data) {
      // A switch to Essentials chosen during Pro has happened (or the
      // person went back to Pro): the note about it is done.
      const pending = useAppStore.getState().planSwitch;
      const over = pending?.at ? Date.parse(pending.at) + 3 * 86400000 < Date.now() : false;
      if (pending && (over || (data.plan !== 'pro' && data.plan !== 'proPlus'))) useAppStore.getState().setPlanSwitch(null);
      // A reminder two days before a store trial turns into the first charge,
      // naming the plan that follows it.
      void syncTrialReminder(data.trial ? (data.planUntil ?? null) : null, nextPlanName(data.plan, data.module));
    }
    // What the plan covers decides which notifications make sense (Essentials
    // Food: none about training). Only once reminders have been set up, so
    // this never asks for permission before onboarding does.
    if (data && useAppStore.getState().remindersInitialized) void syncReminders();
    // The server decides when subscriptions are on, by handing out the
    // store key; the first refresh that carries one switches the SDK on.
    if (data?.billing) configurePurchases(data.billing);
  },
  spend: (kind) => {
    const { used, limit, features } = get();
    if (typeof used !== 'number' || typeof limit !== 'number') return;
    const next = used + 1;
    set({
      used: next,
      remaining: Math.max(0, limit - next),
      // Keep the coach sub-counter in step so the "messages left" line is live.
      ...(kind === 'coach' && features
        ? { features: { ...features, coachUsed: (features.coachUsed ?? 0) + 1 } }
        : {}),
    });
  },
}));

// A purchase, restore or App Store redemption re-reads the plan from here.
setPlanChangedHandler(() => useEntitlement.getState().refresh());

/** The plan a trial turns into, named ("Essentials · Food", "Pro"). */
function nextPlanName(plan: Entitlement['plan'] | undefined, module: Entitlement['module'] | undefined): string {
  const pending = useAppStore.getState().planSwitch;
  if (pending) return i18n.t(`plans.name.essentials_${pending.module}`);
  if (plan === 'essentials') return i18n.t(module ? `plans.name.essentials_${module}` : 'plans.name.essentials');
  return i18n.t(`plans.name.${plan === 'proPlus' ? 'proPlus' : 'pro'}`);
}

/** True on any paying tier. */
export function isPro(): boolean {
  const plan = useEntitlement.getState().plan;
  return plan === 'essentials' || plan === 'pro' || plan === 'proPlus';
}

// Notifications follow what the plan covers.
setNotifyGateSource(() => {
  const s = useEntitlement.getState();
  return { plan: s.plan, locks: s.locks, module: s.module, trial: s.trial, features: s.features };
});

// With plan locks on, a write the plan doesn't cover does nothing and the
// membership sheet says why — at most once a moment, however many writes a
// single tap makes.
let lastSheet = 0;
setWriteGuard((area) => {
  const s = useEntitlement.getState();
  if (!s.loaded || gateOpen(area, s)) return true;
  const now = Date.now();
  if (now - lastSheet > 1500) {
    lastSheet = now;
    const reason = lockReasonFor(area, s);
    // After the tap's own handler has finished: a screen that closes itself
    // after saving (the water sheet does) must not close the membership
    // sheet along with it.
    setTimeout(() => {
      try {
        router.push(`/membership?reason=${reason}`);
      } catch {
        // Navigation not ready yet; the write is still refused.
      }
    }, 60);
  }
  return false;
});
