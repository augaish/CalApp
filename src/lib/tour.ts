import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { View } from 'react-native';
import { create } from 'zustand';

/**
 * The guided tour of the app's real structure: one spotlight per thing worth
 * knowing, across every tab, with a "Try it" that opens the actual screen
 * and resumes when the person comes back. State lives here (not on the
 * Overview) because the steps span tabs; the overlay in the tabs layout
 * reads it and each screen registers the element it owns.
 */
export type TourRect = { x: number; y: number; width: number; height: number };

export type TourTargetKey =
  | 'overview.steps'
  | 'overview.nutrition'
  | 'tabs.add'
  | 'training.schedule'
  | 'training.today'
  | 'food.tabs'
  | 'food.tiles'
  | 'health.hero'
  | 'header.ai';

export type TabRoute = '/' | '/training' | '/food' | '/health';
export const TAB_ROUTES: string[] = ['/', '/index', '/training', '/food', '/health'];

export interface TourStepDef {
  key: TourTargetKey;
  route: TabRoute;
  /** A screen the step invites the person to open for real. */
  tryRoute?: string;
}

export const TOUR_STEPS: TourStepDef[] = [
  { key: 'overview.steps', route: '/' },
  { key: 'overview.nutrition', route: '/' },
  { key: 'tabs.add', route: '/', tryRoute: '/add-menu' },
  { key: 'training.schedule', route: '/training', tryRoute: '/schedules' },
  { key: 'training.today', route: '/training' },
  { key: 'food.tabs', route: '/food' },
  { key: 'food.tiles', route: '/food', tryRoute: '/recipes' },
  { key: 'health.hero', route: '/health', tryRoute: '/body-reading' },
  { key: 'header.ai', route: '/health', tryRoute: '/coach' },
];

interface TourState {
  active: boolean;
  step: number;
  /** True while a "Try it" excursion is open; the overlay hides and resumes on return. */
  paused: boolean;
  /** Set once the excursion has actually left the tabs, so the return (not the
   * moment of leaving, when the pathname is still a tab) is what resumes. */
  away: boolean;
  rects: Partial<Record<TourTargetKey, TourRect>>;
  start: () => void;
  stop: () => void;
  next: () => void;
  pause: () => void;
  markAway: () => void;
  resume: () => void;
  setRect: (key: TourTargetKey, rect: TourRect) => void;
}

export const useTour = create<TourState>((set) => ({
  active: false,
  step: 0,
  paused: false,
  away: false,
  rects: {},
  start: () => set({ active: true, step: 0, paused: false, away: false, rects: {} }),
  stop: () => set({ active: false, step: 0, paused: false, away: false, rects: {} }),
  next: () => set((s) => ({ step: Math.min(s.step + 1, TOUR_STEPS.length - 1) })),
  pause: () => set({ paused: true, away: false }),
  markAway: () => set({ away: true }),
  resume: () => set({ paused: false, away: false }),
  setRect: (key, rect) => set((s) => ({ rects: { ...s.rects, [key]: rect } })),
}));

/**
 * Registers the element a tour step points at. Measured only while the tour
 * is on that step and this screen is the focused tab, a beat after the
 * navigation settles — so an unfocused tab's copy of the same element never
 * reports an off-screen rectangle.
 */
export function useTourTarget(key: TourTargetKey): { bind: { ref: (node: View | null) => void; onLayout: () => void; collapsable: false } } {
  // The node is kept in a ref that never leaves this hook; callers get a
  // callback ref, so nothing ref-shaped is read during their render.
  const nodeRef = useRef<View | null>(null);
  const [focused, setFocused] = useState(false);
  const [tick, setTick] = useState(0);
  const active = useTour((s) => s.active);
  const step = useTour((s) => s.step);
  const paused = useTour((s) => s.paused);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    if (!active || paused || !focused || TOUR_STEPS[step]?.key !== key) return;
    const id = setTimeout(() => {
      nodeRef.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) useTour.getState().setRect(key, { x, y, width, height });
      });
    }, 350);
    return () => clearTimeout(id);
  }, [active, paused, focused, step, key, tick]);
  const setNode = useCallback((node: View | null) => {
    nodeRef.current = node;
  }, []);
  const onLayout = useCallback(() => setTick((n) => n + 1), []);
  return { bind: { ref: setNode, onLayout, collapsable: false } };
}
