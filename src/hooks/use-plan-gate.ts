import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { useEntitlement } from '@/lib/entitlement';
import { gateOpen, type Gate, type GateContext } from '@/lib/plan-gates';

/**
 * The plan's feature locks, for a screen: `isOpen` to decide what to draw,
 * `guard` to run before starting something — it opens the membership sheet
 * with the reason and returns false when the plan doesn't include it.
 */
export function usePlanGate() {
  const router = useRouter();
  const plan = useEntitlement((s) => s.plan);
  const locks = useEntitlement((s) => s.locks);
  const features = useEntitlement((s) => s.features);

  const isOpen = useCallback(
    (gate: Gate, ctx?: GateContext) => gateOpen(gate, { plan, locks, features }, ctx),
    [plan, locks, features],
  );

  const guard = useCallback(
    (gate: Gate, ctx?: GateContext) => {
      if (isOpen(gate, ctx)) return true;
      router.push(`/membership?reason=${gate}`);
      return false;
    },
    [isOpen, router],
  );

  return { isOpen, guard, locks: !!locks };
}

/**
 * For a screen whose only job is starting something new (planning a meal, a
 * new body reading): on a plan without it, the membership sheet takes the
 * screen's place, once, when the plan is known. Returns whether to render.
 */
export function useGatedScreen(gate: Gate, active = true): boolean {
  const router = useRouter();
  const loaded = useEntitlement((s) => s.loaded);
  const { isOpen } = usePlanGate();
  const open = !active || isOpen(gate);
  const decided = useRef(false);
  useEffect(() => {
    if (!loaded || decided.current) return;
    decided.current = true;
    if (!open) router.replace(`/membership?reason=${gate}`);
  }, [loaded, open, gate, router]);
  return open;
}
