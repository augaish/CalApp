import { usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useEntitlement } from '@/lib/entitlement';
import { initialPromptState, markShown, promptDue } from '@/lib/membership-prompt';
import { configurePurchases, loadStorePlans } from '@/lib/purchases';
import { useAppStore } from '@/lib/store';
import { hasAnyPlan } from '@/lib/store-plans';
import { TAB_ROUTES, useTour } from '@/lib/tour';

/**
 * Offers the membership sheet on its own, following membership-prompt.ts:
 * once after onboarding, then at most weekly from day 3 — to a free user on
 * a tab, not mid-workout or mid-tour, and only when the store has a plan to
 * sell (so nobody is ever shown a sheet that cannot take their money).
 * Checked when the tabs appear, on each tab change and on return to the app.
 */
export function useMembershipPrompt() {
  const router = useRouter();
  const pathname = usePathname();
  const loaded = useEntitlement((s) => s.loaded);
  const plan = useEntitlement((s) => s.plan);
  const billing = useEntitlement((s) => s.billing);
  const tourSeen = useAppStore((s) => s.tourSeen);
  const tourActive = useTour((s) => s.active);
  const [wake, setWake] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setWake((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const app = useAppStore.getState();
    const state = app.membershipPrompt ?? initialPromptState(app.tourSeen);
    if (!app.membershipPrompt) app.setMembershipPrompt(state);
    const due = promptDue(state, {
      free: plan === 'free',
      tourDone: tourSeen && !tourActive,
      busy: !!app.activeSession || !TAB_ROUTES.includes(pathname),
    });
    if (!due) return;
    let live = true;
    // A beat after landing, so it never lands on top of the screen appearing.
    const timer = setTimeout(async () => {
      configurePurchases(billing);
      const store = await loadStorePlans();
      if (!live || !hasAnyPlan(store?.plans)) return;
      useAppStore.getState().setMembershipPrompt(markShown(state));
      router.push('/membership');
    }, 1500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [loaded, plan, billing, tourSeen, tourActive, pathname, wake, router]);
}
