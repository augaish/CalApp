import { usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { useEntitlement } from '@/lib/entitlement';
import { initialPromptState, markShown, promptDue } from '@/lib/membership-prompt';
import { configurePurchases, loadStorePlans } from '@/lib/purchases';
import { useAppStore } from '@/lib/store';
import { hasAnyPlan } from '@/lib/store-plans';
import { TAB_ROUTES, useTour } from '@/lib/tour';

/**
 * Where a new person is between onboarding and the tour, for this launch:
 * 'checking' until the after-onboarding plans are either shown or not due,
 * 'open' while they are on screen, 'settled' after. The tour waits for
 * 'settled' so it never lands on top of the plans or the welcome moment.
 */
export const useFirstRun = create<{ phase: 'checking' | 'open' | 'settled'; setPhase: (p: 'checking' | 'open' | 'settled') => void }>((set) => ({
  phase: 'checking',
  setPhase: (phase) => set({ phase }),
}));

let sheetSeen = false;

/** How long to wait for the store before starting the tour anyway (offline, slow). */
const CHECK_TIMEOUT_MS = 6000;

/**
 * Offers the membership sheet on its own, following membership-prompt.ts:
 * once right after onboarding, then at most weekly from day 3 — to a free
 * user on a tab, not mid-workout or mid-tour, and only when the store has a
 * plan to sell (so nobody is ever shown a sheet that cannot take their
 * money). Checked when the tabs appear, on each tab change and on return to
 * the app. Then starts the tour for someone who hasn't had it.
 */
export function useMembershipPrompt() {
  const router = useRouter();
  const pathname = usePathname();
  const loaded = useEntitlement((s) => s.loaded);
  const plan = useEntitlement((s) => s.plan);
  const locks = useEntitlement((s) => s.locks);
  const billing = useEntitlement((s) => s.billing);
  const tourSeen = useAppStore((s) => s.tourSeen);
  const tourActive = useTour((s) => s.active);
  const phase = useFirstRun((s) => s.phase);
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
      busy: !!app.activeSession || !TAB_ROUTES.includes(pathname) || tourActive,
      launchOffer: !!locks,
    });
    const first = useFirstRun.getState();
    if (!due) {
      // Nothing to offer right after onboarding: the tour may go ahead.
      if (first.phase === 'checking' && TAB_ROUTES.includes(pathname)) first.setPhase('settled');
      return;
    }
    let live = true;
    // A beat after landing, so it never lands on top of the screen appearing.
    const timer = setTimeout(async () => {
      configurePurchases(billing);
      const store = await loadStorePlans();
      if (!live) return;
      if (!hasAnyPlan(store?.plans)) {
        if (useFirstRun.getState().phase === 'checking') useFirstRun.getState().setPhase('settled');
        return;
      }
      useAppStore.getState().setMembershipPrompt(markShown(state));
      if (due === 'intro') useFirstRun.getState().setPhase('open');
      router.push('/membership');
    }, 1500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [loaded, plan, locks, billing, tourSeen, tourActive, pathname, wake, router]);

  // The plans closed (bought or not) and the person is back on a tab — only
  // once the sheet has really been on screen, not in the instant before.
  useEffect(() => {
    if (phase !== 'open') return;
    if (!TAB_ROUTES.includes(pathname)) sheetSeen = true;
    else if (sheetSeen) useFirstRun.getState().setPhase('settled');
  }, [phase, pathname]);

  // Never wait on the store forever.
  useEffect(() => {
    if (phase !== 'checking') return;
    const id = setTimeout(() => {
      if (useFirstRun.getState().phase === 'checking') useFirstRun.getState().setPhase('settled');
    }, CHECK_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [phase]);

  useAutoTour(pathname, phase);
}

/** Once a launch at most: the tour starts by itself on Overview for someone who hasn't had it. */
let autoTried = false;

function useAutoTour(pathname: string, phase: 'checking' | 'open' | 'settled') {
  const tourSeen = useAppStore((s) => s.tourSeen);
  const snoozed = useAppStore((s) => s.tourSnoozed ?? 0);
  const profile = useAppStore((s) => s.profile);
  const activeSession = useAppStore((s) => s.activeSession);
  const tourActive = useTour((s) => s.active);

  useEffect(() => {
    const onOverview = pathname === '/' || pathname === '/index';
    // "Skip for now" puts it off once: offered again at the next launch, then no more.
    if (autoTried || tourSeen || tourActive || snoozed >= 2 || !profile || activeSession || phase !== 'settled' || !onOverview) return;
    const id = setTimeout(() => {
      if (autoTried || useTour.getState().active) return;
      autoTried = true;
      useTour.getState().start(true);
    }, 900);
    return () => clearTimeout(id);
  }, [pathname, phase, tourSeen, snoozed, profile, activeSession, tourActive]);
}
