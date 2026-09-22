import { create } from 'zustand';

import { fetchEntitlement, type Entitlement } from './api';
import { configurePurchases, setPlanChangedHandler } from './purchases';

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

/** True on any paying tier — Pro+ is still Pro. */
export function isPro(): boolean {
  const plan = useEntitlement.getState().plan;
  return plan === 'pro' || plan === 'proPlus';
}
