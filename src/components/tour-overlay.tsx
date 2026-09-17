import { usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachTour } from '@/components/coach-tour';
import { useAppStore } from '@/lib/store';
import { TAB_ROUTES, TOUR_STEPS, useTour } from '@/lib/tour';

/**
 * Rendered once in the tabs layout. Moves to the step's tab, waits for the
 * screen to report the element's rectangle, and shows the spotlight. "Try
 * it" pauses the tour and opens the real screen; coming back to any tab
 * resumes it on the next step.
 */
export function TourOverlay() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const setTourSeen = useAppStore((s) => s.setTourSeen);
  const active = useTour((s) => s.active);
  const step = useTour((s) => s.step);
  const paused = useTour((s) => s.paused);
  const away = useTour((s) => s.away);
  const rects = useTour((s) => s.rects);
  const def = TOUR_STEPS[step];
  const onTab = TAB_ROUTES.includes(pathname);
  const onStepTab = pathname === def?.route || (def?.route === '/' && pathname === '/index');
  // A grace period after each step change: if the screen has not measured
  // its element by then, the tooltip shows centred rather than never. The
  // step that finished waiting is recorded, so a new step starts fresh
  // without resetting state inside the effect.
  const [waitedStep, setWaitedStep] = useState(-1);
  const waited = waitedStep === step;

  useEffect(() => {
    if (!active || paused || !def || onStepTab) return;
    router.navigate(def.route);
  }, [active, paused, def, onStepTab, router]);

  useEffect(() => {
    if (!active || !paused) return;
    // The excursion has to have left the tabs before a tab can count as
    // "back": at the moment of leaving the pathname is still the tab's.
    if (!onTab) {
      if (!away) useTour.getState().markAway();
      return;
    }
    if (!away) return;
    // Back from an excursion: the last step's excursion ends the tour.
    if (step >= TOUR_STEPS.length - 1) {
      useTour.getState().stop();
      setTourSeen();
      return;
    }
    useTour.getState().next();
    useTour.getState().resume();
  }, [active, paused, away, onTab, step, setTourSeen]);

  useEffect(() => {
    if (!active || paused) return;
    const id = setTimeout(() => setWaitedStep(step), 1400);
    return () => clearTimeout(id);
  }, [active, paused, step]);

  if (!active || paused || !def || !onStepTab) return null;
  const fab = { x: width / 2 - 34, y: height - insets.bottom - 82, width: 68, height: 68 };
  const rect = def.key === 'tabs.add' ? fab : (rects[def.key] ?? null);
  if (!rect && !waited) return null;

  const steps = TOUR_STEPS.map((s) => ({ rect: null as typeof rect, title: t(`tour.steps.${s.key}.title`), body: t(`tour.steps.${s.key}.body`) }));
  steps[step] = { ...steps[step], rect };
  const finish = () => {
    useTour.getState().stop();
    setTourSeen();
  };
  return (
    <CoachTour
      steps={steps}
      index={step}
      onNext={() => (step < TOUR_STEPS.length - 1 ? useTour.getState().next() : finish())}
      onSkip={finish}
      onTry={
        def.tryRoute
          ? () => {
              useTour.getState().pause();
              router.push(def.tryRoute as never);
            }
          : undefined
      }
      tryLabel={t('tour.tryIt')}
    />
  );
}
