import {
  addDays,
  dateKey,
  pendingOccurrences,
  performedOn,
  resolvePlan,
  type OccurrenceMove,
  type Occurrences,
  type ResolvedPlan,
  type Schedule,
  type ScheduleSince,
  type TemplateDay,
} from './occurrences';
import type { LoggedWorkout } from './types';

/**
 * "Do another day's workout": bring any day of the week to today. Pure, so
 * the choices and what each one writes can be tested without a store.
 *
 * - From an upcoming day: Swap (the two days trade places) or Just replace
 *   today (today stands in for that weekday this time; the day itself keeps
 *   its workout). On a rest day: Swap (that day becomes rest) or Just add it.
 * - From a missed day: it moves to today, and today's own workout, if any,
 *   is skipped this time.
 * Only a swap can be kept for good: in the weekly schedule, or as a new one.
 */

export type CandidateStatus = 'missed' | 'done' | 'upcoming' | 'rest';

export interface BringCandidate {
  /** dateKey of the day in the list. */
  date: string;
  status: CandidateStatus;
  plan: ResolvedPlan | null;
}

/**
 * The days around today, oldest first: the last six days that were trained
 * (done) or missed, then the next six days (with rest days, which can't be
 * picked). Today itself is not in the list.
 */
export function bringCandidates(
  schedule: Schedule,
  occurrences: Occurrences,
  workouts: LoggedWorkout[],
  skips: Record<string, string[]>,
  today: Date,
  since: ScheduleSince = {},
): BringCandidate[] {
  const missed = new Set(pendingOccurrences(schedule, occurrences, workouts, skips, today, 6, since).map((p) => p.scheduledDate));
  const out: BringCandidate[] = [];
  for (let i = -6; i <= 6; i++) {
    if (i === 0) continue;
    const day = addDays(today, i);
    const key = dateKey(day);
    const plan = resolvePlan(schedule, occurrences, day);
    if (i < 0) {
      if (!plan) continue;
      if (missed.has(key)) out.push({ date: key, status: 'missed', plan });
      else if (performedOn(workouts, key, plan.day.exerciseIds)) out.push({ date: key, status: 'done', plan });
      continue;
    }
    out.push({ date: key, status: plan ? 'upcoming' : 'rest', plan });
  }
  return out;
}

/** Whether a day in the list can be brought to today. */
export function canBring(c: BringCandidate): boolean {
  return (c.status === 'missed' || c.status === 'upcoming') && !!c.plan;
}

/**
 * - `swap`: the two days trade places (on a rest day: that day becomes rest).
 * - `replace`: today does that workout instead of its own, this time only.
 * - `add`: today is a rest day and does that workout; the day keeps its own.
 * - `move`: a missed workout moves to a free today; nothing to ask.
 */
export type BringChoice = 'swap' | 'replace' | 'add' | 'move';

/** The choices offered, first one preselected. An empty question means "just do it". */
export function bringChoices(src: BringCandidate, todayPlan: ResolvedPlan | null): BringChoice[] {
  if (src.status === 'missed') return todayPlan ? ['replace'] : ['move'];
  return todayPlan ? ['swap', 'replace'] : ['swap', 'add'];
}

/** The occurrence moves a choice makes, for this week only. */
export function bringMoves(choice: BringChoice, src: BringCandidate, today: Date, todayPlan: ResolvedPlan | null): OccurrenceMove[] {
  const todayKey = dateKey(today);
  const s = src.plan!;
  const here: OccurrenceMove = { originalDate: s.originalDate, weekday: s.weekday, to: todayKey };
  switch (choice) {
    case 'move':
      return [here];
    case 'swap':
      return todayPlan ? [here, { originalDate: todayPlan.originalDate, weekday: todayPlan.weekday, to: src.date }] : [here];
    case 'replace': {
      if (src.status === 'missed') return todayPlan ? [here, { originalDate: todayPlan.originalDate, weekday: todayPlan.weekday, to: null }] : [here];
      const moves: OccurrenceMove[] = [];
      // A workout moved onto today from another date is skipped this time.
      if (todayPlan && todayPlan.originalDate !== todayKey) moves.push({ originalDate: todayPlan.originalDate, weekday: todayPlan.weekday, to: null });
      // Today stands in for the source's weekday; the source day keeps its own.
      moves.push({ originalDate: todayKey, weekday: s.weekday, to: todayKey });
      return moves;
    }
    case 'add':
      return [{ originalDate: todayKey, weekday: s.weekday, to: todayKey }];
  }
}

const clone = (d: TemplateDay | undefined): TemplateDay | undefined => (d ? { ...d, exerciseIds: [...d.exerciseIds], ...(d.plans ? { plans: { ...d.plans } } : {}) } : undefined);

/**
 * The weekly schedule with a swap kept for good: today's weekday gets the
 * source's workout, and the source's weekday gets today's (or becomes rest).
 */
export function weekAfterSwap(schedule: Schedule, today: Date, src: BringCandidate, todayPlan: ResolvedPlan | null): Schedule {
  const todayWd = today.getDay();
  const [y, m, d] = src.date.split('-').map(Number);
  const srcWd = new Date(y, m, d).getDay();
  const incoming = clone(schedule[src.plan!.weekday]);
  const outgoing = todayPlan ? clone(schedule[todayPlan.weekday]) : undefined;
  const next: Schedule = { ...schedule };
  if (incoming) next[todayWd] = incoming;
  if (outgoing) next[srcWd] = outgoing;
  else delete next[srcWd];
  return next;
}

/** The weekly schedule with exercises added to one weekday (a rest day becomes a workout day). */
export function weekWithAdded(schedule: Schedule, weekday: number, ids: string[]): Schedule {
  const cur = schedule[weekday];
  const exerciseIds = [...(cur?.exerciseIds ?? [])];
  for (const id of ids) if (!exerciseIds.includes(id)) exerciseIds.push(id);
  return { ...schedule, [weekday]: { ...(cur ?? {}), exerciseIds } };
}
