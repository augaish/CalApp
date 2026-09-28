import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { useEntitlement } from '@/lib/entitlement';
import { gateOpen, lockReasonFor, readOnly, visibleModules, type Gate } from '@/lib/plan-gates';

/** The plan fields the gates read, from the entitlement store. */
function useGateState() {
  const plan = useEntitlement((s) => s.plan);
  const locks = useEntitlement((s) => s.locks);
  const module = useEntitlement((s) => s.module);
  const trial = useEntitlement((s) => s.trial);
  const features = useEntitlement((s) => s.features);
  return { plan, locks, module, trial, features };
}

/**
 * The plan's locks, for a screen: `isOpen` to decide what to draw, `guard`
 * to run before starting something — it opens the membership sheet with the
 * reason and returns false when the plan doesn't include it.
 */
export function usePlanGate() {
  const router = useRouter();
  const state = useGateState();
  const { plan, locks, module, trial, features } = state;

  const isOpen = useCallback(
    (gate: Gate) => gateOpen(gate, { plan, locks, module, trial, features }),
    [plan, locks, module, trial, features],
  );

  const guard = useCallback(
    (gate: Gate) => {
      if (isOpen(gate)) return true;
      router.push(`/membership?reason=${lockReasonFor(gate, { plan, locks, module, trial, features })}`);
      return false;
    },
    [isOpen, router, plan, locks, module, trial, features],
  );

  return {
    isOpen,
    guard,
    locks: !!locks,
    readOnly: readOnly({ plan, locks }),
    visible: visibleModules({ plan, locks, module, trial }),
  };
}

/**
 * For a screen whose only job is starting something new (planning a meal, a
 * new body reading): on a plan without it, the membership sheet takes the
 * screen's place, once, when the plan is known. Returns whether to render.
 */
export function useGatedScreen(gate: Gate, active = true): boolean {
  const router = useRouter();
  const loaded = useEntitlement((s) => s.loaded);
  const state = useGateState();
  const open = !active || gateOpen(gate, state);
  const decided = useRef(false);
  useEffect(() => {
    if (!loaded || decided.current) return;
    decided.current = true;
    if (!open) router.replace(`/membership?reason=${lockReasonFor(gate, state)}`);
  }, [loaded, open, gate, router, state]);
  return open;
}
