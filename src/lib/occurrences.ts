import type { LoggedWorkout, PlannedSet, WorkoutOccurrence } from './types';

/**
 * S42 — dated workout occurrences over the recurring weekly template.
 *
 * The template (`schedule[weekday]`) never changes because one day was
 * missed. An occurrence is the dated instance: it exists only once someone
 * moved or skipped it, keyed by its ORIGINAL planned date, and carries where
 * it sits now. Everything here is pure so the resolution can be tested
 * without a store.
 */
export type TemplateDay = { title?: string; exerciseIds: string[]; plans?: Record<string, PlannedSet[]> };
export type Schedule = Record<number, TemplateDay>;
export type Occurrences = Record<string, WorkoutOccurrence>;

export interface ResolvedPlan {
  /** The template weekday the exercises and targets come from. */
  weekday: number;
  day: TemplateDay;
  /** dateKey of the date this occurrence was originally planned for. */
  originalDate: string;
  /** Set when this plan sits on a date other than its original one. */
  movedFrom?: string;
}

/** Same local-date key the store uses everywhere (`YYYY-M-D`, month index 0-based). */
export function dateKey(day: Date): string {
  return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
}

export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m, d);
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** What is planned on a date: a moved-in occurrence wins, a moved-away or skipped one leaves the date empty, else the template. */
export function resolvePlan(schedule: Schedule, occurrences: Occurrences, date: Date): ResolvedPlan | null {
  const key = dateKey(date);
  const movedIn = Object.values(occurrences).find((o) => o.state === 'scheduled' && o.scheduledDate === key && o.originalDate !== key);
  if (movedIn) {
    const day = schedule[movedIn.weekday];
    return day && day.exerciseIds.length > 0 ? { weekday: movedIn.weekday, day, originalDate: movedIn.originalDate, movedFrom: movedIn.originalDate } : null;
  }
  const own = occurrences[key];
  if (own && (own.state === 'skipped' || own.scheduledDate !== key)) return null;
  const weekday = date.getDay();
  const day = schedule[weekday];
  return day && day.exerciseIds.length > 0 ? { weekday, day, originalDate: key } : null;
}

/** Any set actually completed on `key` for one of the plan's exercises. */
export function performedOn(workouts: LoggedWorkout[], key: string, exerciseIds: string[]): boolean {
  return workouts.some((w) => dateKey(new Date(w.at)) === key && exerciseIds.includes(w.exerciseId) && w.sets.some((s) => s.done));
}

export interface PendingOccurrence {
  originalDate: string;
  /** Where it currently sits (its original date unless moved). */
  scheduledDate: string;
  weekday: number;
  day: TemplateDay;
  exerciseIds: string[];
}

/**
 * Unstarted past occurrences inside the look-back window, most recent first.
 * "Missed" is derived for presentation — nothing is written to make it so.
 * A date whose exercises were all skipped one by one is not pending either.
 */
export function pendingOccurrences(
  schedule: Schedule,
  occurrences: Occurrences,
  workouts: LoggedWorkout[],
  skips: Record<string, string[]>,
  today: Date,
  lookbackDays = 7,
): PendingOccurrence[] {
  const out: PendingOccurrence[] = [];
  for (let i = 1; i <= lookbackDays; i++) {
    const date = addDays(today, -i);
    const key = dateKey(date);
    const plan = resolvePlan(schedule, occurrences, date);
    if (!plan) continue;
    const skipped = skips[key] ?? [];
    const exerciseIds = plan.day.exerciseIds.filter((id) => !skipped.includes(id));
    if (exerciseIds.length === 0) continue;
    if (performedOn(workouts, key, exerciseIds)) continue;
    out.push({ originalDate: plan.originalDate, scheduledDate: key, weekday: plan.weekday, day: plan.day, exerciseIds });
  }
  return out;
}

export interface OccurrenceMove {
  originalDate: string;
  weekday: number;
  /** New date, or null to skip this occurrence. */
  to: string | null;
}

/** The revision a move must be applied against: 0 for an occurrence that does not exist yet. */
export function revisionOf(occurrences: Occurrences, originalDate: string): number {
  return occurrences[originalDate]?.revision ?? 0;
}

/** Apply moves to a copy; null when any expected revision no longer matches (the preview is stale). */
export function applyMoves(
  occurrences: Occurrences,
  moves: OccurrenceMove[],
  expected: Record<string, number>,
  opId: string,
  at: string,
): Occurrences | null {
  const next: Occurrences = { ...occurrences };
  for (const m of moves) {
    if (revisionOf(occurrences, m.originalDate) !== (expected[m.originalDate] ?? 0)) return null;
    const cur = occurrences[m.originalDate];
    const from = cur ? (cur.state === 'skipped' ? null : cur.scheduledDate) : m.originalDate;
    const revision = (cur?.revision ?? 0) + 1;
    next[m.originalDate] = {
      id: cur?.id ?? `occ:${m.originalDate}`,
      originalDate: m.originalDate,
      weekday: m.weekday,
      scheduledDate: m.to,
      state: m.to ? 'scheduled' : 'skipped',
      revision,
      moveHistory: [...(cur?.moveHistory ?? []), { opId, from, to: m.to, at, revisionAfter: revision }],
    };
  }
  return next;
}

/**
 * Reverse one operation, only for occurrences that are unchanged since it
 * and have not been started on their new date. Returns null when nothing
 * could be reversed.
 */
export function undoOp(occurrences: Occurrences, schedule: Schedule, workouts: LoggedWorkout[], opId: string): Occurrences | null {
  const next: Occurrences = { ...occurrences };
  let changed = false;
  for (const occ of Object.values(occurrences)) {
    const last = occ.moveHistory[occ.moveHistory.length - 1];
    if (!last || last.opId !== opId || last.revisionAfter !== occ.revision) continue;
    const exerciseIds = schedule[occ.weekday]?.exerciseIds ?? [];
    if (occ.scheduledDate && performedOn(workouts, occ.scheduledDate, exerciseIds)) continue;
    const history = occ.moveHistory.slice(0, -1);
    if (history.length === 0 && last.from === occ.originalDate) {
      // Back to the untouched template: the occurrence record is no longer needed.
      delete next[occ.originalDate];
    } else {
      next[occ.originalDate] = {
        ...occ,
        scheduledDate: last.from,
        state: last.from ? 'scheduled' : 'skipped',
        revision: occ.revision + 1,
        moveHistory: history,
      };
    }
    changed = true;
  }
  return changed ? next : null;
}
