import type { BodyWin, PlannedNote } from './planner';

/**
 * What a planned message says. Warm, short, never guilt: a missed goal is
 * "tomorrow's a fresh start", not a scolding. Each kind has a few wordings,
 * picked by the message's id so the same day always reads the same but the
 * days don't repeat each other. Numbers come in the person's language.
 *
 * Pure (the translator is passed in) so the wording is tested directly.
 */

export type Translate = (key: string, values?: Record<string, unknown>) => string;

/** Streak lengths worth calling a milestone. */
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 45, 60, 90, 100, 150, 200, 365];

/** A stable pick among `n` wordings for this message. */
export function variant(seed: string, n: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % n) + 1;
}

export function formatNumber(n: number, lang: string, digits = 0): string {
  try {
    // Arabic-Indic digits asked for by name: newer ICU data formats plain
    // 'ar' with Western digits, which would mix with the Arabic wording.
    return n.toLocaleString(lang === 'ar' ? 'ar-u-nu-arab' : 'en', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  } catch {
    return digits ? n.toFixed(digits) : String(Math.round(n));
  }
}

const litres = (ml: number, lang: string) => formatNumber(Math.round(ml / 100) / 10, lang, 1);

function bodyParts(wins: BodyWin[], t: Translate, lang: string): string[] {
  return wins.map((w) => {
    const d = formatNumber(Math.abs(w.delta), lang, 1);
    if (w.kind === 'fat') return t('notify.recap.fatDown', { d });
    if (w.kind === 'muscle') return t('notify.recap.muscleUp', { d });
    return t(w.delta < 0 ? 'notify.recap.weightDown' : 'notify.recap.weightUp', { d });
  });
}

/** The title and body a planned message is delivered with. */
export function renderNote(note: PlannedNote, t: Translate, lang: string): { title: string; body: string } {
  const p = note.params as Record<string, never>;
  const n = (x: number, digits = 0) => formatNumber(x, lang, digits);
  const v = (count: number) => variant(note.id, count);

  switch (note.kind) {
    case 'meal': {
      const meal = t(`home.mealTypes.${p.slot}`);
      const title = t(`notify.meal.title${v(3)}`, { meal });
      const body = note.generic ? t('notify.meal.bodyGeneric') : t(`notify.meal.body${v(2)}`, { left: n(p.kcalLeft) });
      return { title, body };
    }
    case 'protein': {
      const title = t(`notify.protein.title${v(2)}`, { have: n(p.have) });
      const body = p.food
        ? t('notify.protein.bodyFood', { have: n(p.have), target: n(p.target), food: p.food, g: n(p.foodProtein) })
        : t('notify.protein.body', { have: n(p.have), target: n(p.target) });
      return { title, body };
    }
    case 'fastEnd':
      return { title: t('notify.fastEnd.title'), body: t(`notify.fastEnd.body${v(2)}`) };
    case 'water': {
      const title = t(`notify.water.title${v(3)}`);
      if (note.generic) return { title, body: t('notify.water.bodyGeneric') };
      const values = { have: litres(p.haveMl, lang), target: litres(p.targetMl, lang), ml: n(p.suggestMl) };
      return { title, body: t(p.ramadan ? 'notify.water.bodyRamadan' : `notify.water.body${v(2)}`, values) };
    }
    case 'waterAfterWorkout':
      return { title: t('notify.waterAfterWorkout.title'), body: t('notify.waterAfterWorkout.body', { ml: n(p.suggestMl) }) };
    case 'training': {
      const title = p.title ? t(`notify.training.title${v(2)}`, { title: p.title }) : t('notify.training.titleNoName');
      const lead = p.lead as unknown as { name: string; weightKg?: number; reps?: number } | null;
      let body = t('notify.training.body', { count: n(p.exercises), min: n(p.minutes) });
      if (lead?.weightKg && lead.reps) {
        body += ` ${t('notify.training.last', { name: lead.name, w: n(lead.weightKg, 1), reps: n(lead.reps) })}`;
      }
      return { title, body };
    }
    case 'restDay': {
      const body = p.proteinLeft && !note.generic
        ? t('notify.restDay.bodyProtein', { p: n(p.proteinLeft) })
        : t('notify.restDay.body');
      return { title: t(`notify.restDay.title${v(2)}`), body };
    }
    case 'missed':
      return {
        title: p.title ? t('notify.missed.title', { title: p.title }) : t('notify.missed.titleNoName'),
        body: t('notify.missed.body'),
      };
    case 'program': {
      const prog = note.params as { weekStarting?: number; total: number; finished?: boolean };
      if (prog.finished) return { title: t('notify.program.doneTitle'), body: t('notify.program.doneBody', { total: n(prog.total) }) };
      return {
        title: t('notify.program.weekTitle', { week: n(prog.weekStarting ?? 1), total: n(prog.total) }),
        body: t('notify.program.weekBody'),
      };
    }
    case 'dayRecap':
      return renderDayRecap(note, t, lang);
    case 'weekRecap':
      return renderWeekRecap(note, t, lang);
    case 'comeback': {
      const step = Number(p.step);
      const k = step <= 2 ? 1 : step <= 5 ? 2 : step <= 9 ? 3 : 4;
      return { title: t(`notify.comeback.title${k}`), body: t(`notify.comeback.body${k}`) };
    }
  }
}

interface RecapParams {
  food: { kcal: number; target: number; protein: number; proteinTarget: number } | null;
  water: { ml: number; target: number } | null;
  training: { trained: boolean; title: string | null; prs: number; burned: number } | null;
  body: BodyWin[];
  streak: number;
}

/**
 * The end-of-day recap: what went well, in one line. Wins are counted to
 * choose the title — a strong day, a good day, or simply a day logged — and
 * a day with no wins still ends on something kind.
 */
export function renderDayRecap(note: PlannedNote, t: Translate, lang: string): { title: string; body: string } {
  const p = note.params as unknown as RecapParams;
  const n = (x: number, digits = 0) => formatNumber(x, lang, digits);
  const parts: string[] = [];
  let wins = 0;
  if (p.food && p.food.kcal > 0) {
    const onTarget = p.food.target > 0 && Math.abs(p.food.kcal - p.food.target) <= p.food.target * 0.1;
    if (onTarget) wins++;
    parts.push(t(onTarget ? 'notify.recap.kcalOn' : 'notify.recap.kcal', { kcal: n(p.food.kcal), target: n(p.food.target) }));
    const proteinHit = p.food.proteinTarget > 0 && p.food.protein >= p.food.proteinTarget;
    if (proteinHit) wins++;
    parts.push(t(proteinHit ? 'notify.recap.proteinHit' : 'notify.recap.protein', { g: n(p.food.protein) }));
  }
  if (p.training) {
    if (p.training.trained) {
      wins++;
      parts.push(p.training.title ? t('notify.recap.trainedNamed', { title: p.training.title }) : t('notify.recap.trained'));
    }
    if (p.training.prs > 0) {
      wins++;
      parts.push(t('notify.recap.prs', { n: n(p.training.prs) }));
    }
    if (p.training.burned > 0) parts.push(t('notify.recap.burned', { kcal: n(p.training.burned) }));
  }
  if (p.water && p.water.ml > 0) {
    const hit = p.water.target > 0 && p.water.ml >= p.water.target;
    if (hit) wins++;
    parts.push(t(hit ? 'notify.recap.waterHit' : 'notify.recap.water', { l: litres(p.water.ml, lang) }));
  }
  const body = bodyParts(p.body ?? [], t, lang);
  wins += body.length;
  parts.push(...body);
  if (p.streak >= 2) {
    const milestone = STREAK_MILESTONES.includes(p.streak);
    if (milestone) wins++;
    parts.push(t(milestone ? 'notify.recap.streakMilestone' : 'notify.recap.streak', { n: n(p.streak) }));
  }
  const tier = wins >= 3 ? 'strong' : wins >= 1 ? 'good' : 'logged';
  const title = t(`notify.recap.${tier}${variant(note.id, 2)}`);
  let text = parts.join(' · ');
  if (tier === 'logged') text = text ? `${text}. ${t('notify.recap.freshStart')}` : t('notify.recap.freshStart');
  return { title, body: text };
}

interface WeekParams {
  workoutsDone: number;
  workoutsPlanned: number;
  prs: number;
  proteinGoalDays: number;
  waterGoalDays: number;
  loggedFoodDays: number;
  avgKcal: number;
  weightChangeKg: number | null;
  weightTowardGoal: boolean;
  food: boolean;
  water: boolean;
  training: boolean;
}

/** Saturday morning: the week that ended, the good parts first. */
export function renderWeekRecap(note: PlannedNote, t: Translate, lang: string): { title: string; body: string } {
  const p = note.params as unknown as WeekParams;
  const n = (x: number, digits = 0) => formatNumber(x, lang, digits);
  const parts: string[] = [];
  if (p.training && p.workoutsDone > 0) {
    parts.push(
      p.workoutsPlanned > 0
        ? t('notify.week.workoutsOf', { done: n(p.workoutsDone), planned: n(p.workoutsPlanned) })
        : t('notify.week.workouts', { done: n(p.workoutsDone) }),
    );
    if (p.prs > 0) parts.push(t('notify.recap.prs', { n: n(p.prs) }));
  }
  if (p.food && p.loggedFoodDays > 0) {
    if (p.proteinGoalDays > 0) parts.push(t('notify.week.protein', { d: n(p.proteinGoalDays) }));
    parts.push(t('notify.week.avgKcal', { kcal: n(p.avgKcal) }));
  }
  if (p.water && p.waterGoalDays > 0) parts.push(t('notify.week.water', { d: n(p.waterGoalDays) }));
  if (p.weightChangeKg != null && p.weightTowardGoal && p.weightChangeKg !== 0) {
    parts.push(t(p.weightChangeKg < 0 ? 'notify.recap.weightDown' : 'notify.recap.weightUp', { d: n(Math.abs(p.weightChangeKg), 1) }));
  }
  return { title: t(`notify.week.title${variant(note.id, 2)}`), body: parts.length ? parts.join(' · ') : t('notify.week.empty') };
}
