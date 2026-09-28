/**
 * What to tell someone, and when — planned from their own data, not a clock.
 *
 * The rule every message passes: it must still be true, useful and personal
 * at the moment it arrives. On a phone that is possible because the data only
 * changes when the app is used — so the app re-plans after every log and on
 * every open, and a reminder for something already done simply disappears
 * from the plan (lunch logged: no lunch reminder).
 *
 * The plan covers the rest of today and tomorrow with real numbers, plus a
 * few gentle "welcome back" notes further out that are only ever delivered if
 * the app isn't opened in between. Then a budget decides what survives: no
 * more than `maxPerDay` a day, never two within 90 minutes, nothing in quiet
 * hours, the most useful message first.
 *
 * Pure: no React Native, no store, no clock of its own — `facts.now` is the
 * clock — so every rule is tested directly (qa/notify-planner-test.ts).
 */

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

/** Which switch a message belongs to. Progress (recaps, wins) follows whatever is on. */
export type Channel = 'food' | 'water' | 'training' | 'progress';

export type NoteKind =
  | 'meal'
  | 'protein'
  | 'fastEnd'
  | 'water'
  | 'waterAfterWorkout'
  | 'training'
  | 'restDay'
  | 'missed'
  | 'dayRecap'
  | 'weekRecap'
  | 'program'
  | 'comeback';

/** A body change worth celebrating, from the day's reading against the one before. */
export interface BodyWin {
  kind: 'weight' | 'fat' | 'muscle';
  /** Signed change: kg for weight, percentage points for fat and muscle. */
  delta: number;
}

export interface DayFacts {
  /** Midnight at the start of the day. */
  date: Date;
  kcal: number;
  protein: number;
  waterMl: number;
  /** Meal slots logged on the day. */
  mealsLogged: MealSlot[];
  /** Minutes after midnight of every meal logged on the day. */
  mealMinutes: number[];
  loggedAnything: boolean;
  /** The day's scheduled workout, if any. */
  plan: { title: string | null; exercises: number; lead?: { name: string; weightKg?: number; reps?: number } } | null;
  /** The scheduled workout (or any training) was done. */
  trained: boolean;
  /** Yesterday's scheduled workout that didn't happen. */
  missedYesterday: { title: string | null } | null;
  /** When the day's last set was logged, in minutes after midnight. */
  workoutEndMinute: number | null;
  /** Water logged after that last set. */
  waterSinceWorkoutMl: number;
  /** New personal records set on the day. */
  prs: number;
  /** Calories burned (WHOOP, or estimated from workouts). */
  burnedKcal: number;
  bodyWins: BodyWin[];
  /** A training program milestone on the day. */
  program: { weekStarting?: number; total: number; finished?: boolean } | null;
}

export interface WeekFacts {
  activeDays: number;
  workoutsDone: number;
  workoutsPlanned: number;
  prs: number;
  proteinGoalDays: number;
  waterGoalDays: number;
  loggedFoodDays: number;
  avgKcal: number;
  weightChangeKg: number | null;
  /** Whether the weight change is in the direction of the goal. */
  weightTowardGoal: boolean;
}

export interface NotifyPrefs {
  enabled: boolean;
  food: boolean;
  water: boolean;
  training: boolean;
  /** Quiet from this hour… */
  quietStart: number;
  /** …until this hour. */
  quietEnd: number;
  maxPerDay: number;
}

export interface NotifyFacts {
  now: Date;
  prefs: NotifyPrefs;
  /** What the plan covers: Essentials Food has no training, Essentials Training no food. */
  scope: { food: boolean; training: boolean; health: boolean };
  targets: { kcal: number; protein: number; waterMl: number };
  /**
   * Usual times, learned from the person's own logs (minutes after midnight).
   * null = not enough history (a default is used); 'never' = they don't
   * have that meal, so no reminder for it.
   */
  usual: { breakfast: number | null | 'never'; lunch: number | null | 'never'; dinner: number | null | 'never'; training: number | null };
  /** Their usual glass, from what they log. */
  glassMl: number;
  /** A food they often eat that is rich in protein, to suggest by name. */
  proteinFood: { name: string; proteinG: number } | null;
  fastEndsAt: Date | null;
  /** The weekly schedule has at least one training day. */
  hasSchedule: boolean;
  logStreak: number;
  workoutStreak: number;
  /** Today and tomorrow. Tomorrow's intake is zero until it's logged. */
  days: [DayFacts, DayFacts];
  /** The seven days before the next Saturday recap within the plan, if any. */
  week: WeekFacts | null;
}

export interface PlannedNote {
  /** Stable per kind and day, so a re-plan replaces rather than duplicates. */
  id: string;
  at: Date;
  kind: NoteKind;
  channel: Channel;
  priority: number;
  /** Tomorrow's messages don't know tomorrow's numbers yet. */
  generic: boolean;
  params: Record<string, unknown>;
}

export const DEFAULT_PREFS: NotifyPrefs = {
  enabled: true,
  food: true,
  water: true,
  training: true,
  quietStart: 23,
  quietEnd: 7,
  maxPerDay: 4,
};

/** Defaults until there are enough logs to learn from. */
export const DEFAULT_USUAL = { breakfast: 8 * 60 + 30, lunch: 13 * 60 + 30, dinner: 20 * 60, training: 18 * 60 };

/** Minimum gap between two messages. */
export const SPACING_MIN = 90;
/** Water is paced across these waking hours. */
const WATER_DAY_START = 7 * 60;
const WATER_DAY_END = 21 * 60;
const WATER_CHECKS = [11 * 60, 14 * 60, 17 * 60, 19 * 60 + 30];
const RAMADAN_WATER_CHECKS = [20 * 60 + 30, 22 * 60 + 15];
/** How far behind pace before water is worth a message. */
const WATER_SLACK_ML = 300;
/** "Welcome back" notes, only delivered if the app stays closed. */
const COMEBACK_DAYS = [2, 5, 9, 14];

/**
 * Ramadan by the Umm al-Qura calendar (first and last day), for meal and water
 * timing. Beyond the table the Intl Islamic calendar is asked, where available.
 */
const RAMADAN: [string, string][] = [
  ['2026-02-18', '2026-03-19'],
  ['2027-02-08', '2027-03-09'],
  ['2028-01-28', '2028-02-26'],
  ['2029-01-16', '2029-02-14'],
  ['2030-01-06', '2030-02-04'],
];

function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isRamadan(date: Date): boolean {
  const k = key(date);
  for (const [from, to] of RAMADAN) if (k >= from && k <= to) return true;
  if (date.getFullYear() <= 2030) return false;
  try {
    const month = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' }).format(date);
    return parseInt(month, 10) === 9;
  } catch {
    return false;
  }
}

function at(day: Date, minutes: number): Date {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(Math.round(minutes));
  return d;
}

function minutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function inQuietHours(date: Date, prefs: Pick<NotifyPrefs, 'quietStart' | 'quietEnd'>): boolean {
  const m = minutesOf(date);
  const start = prefs.quietStart * 60;
  const end = prefs.quietEnd * 60;
  if (start === end) return false;
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/** How much water "on pace" means at a given minute of the day. */
export function waterExpected(targetMl: number, minute: number): number {
  const frac = Math.max(0, Math.min(1, (minute - WATER_DAY_START) / (WATER_DAY_END - WATER_DAY_START)));
  return targetMl * frac;
}

/** The deficit rounded up to whole glasses, at most three. */
export function waterSuggestion(deficitMl: number, glassMl: number): number {
  const glass = glassMl > 0 ? glassMl : 250;
  return Math.min(3, Math.max(1, Math.ceil(deficitMl / glass))) * glass;
}

function usualOr(value: number | null | 'never', fallback: number): number | null {
  if (value === 'never') return null;
  return value ?? fallback;
}

/** When the day's recap comes: after the usual dinner, before quiet hours. */
export function recapMinute(f: NotifyFacts, ramadan: boolean): number {
  const dinner = usualOr(f.usual.dinner, DEFAULT_USUAL.dinner) ?? DEFAULT_USUAL.dinner;
  let m = ramadan ? 22 * 60 + 30 : Math.max(20 * 60 + 30, Math.min(22 * 60 + 30, dinner + 100));
  const quiet = f.prefs.quietStart * 60;
  if (f.prefs.quietStart > f.prefs.quietEnd && m > quiet - 15) m = quiet - 15;
  return m;
}

/** Every message the facts justify, before the budget. */
export function candidates(f: NotifyFacts): PlannedNote[] {
  const out: PlannedNote[] = [];
  const foodOn = f.prefs.food && f.scope.food;
  const waterOn = f.prefs.water && f.scope.health;
  const trainingOn = f.prefs.training && f.scope.training;
  const anyOn = foodOn || waterOn || trainingOn;
  if (!f.prefs.enabled || !anyOn) return out;

  f.days.forEach((day, index) => {
    const today = index === 0;
    const generic = !today;
    const dk = key(day.date);
    const ramadan = isRamadan(day.date);
    const push = (kind: NoteKind, channel: Channel, minute: number, priority: number, params: Record<string, unknown> = {}, idSuffix = '') =>
      out.push({ id: `n-${kind}${idSuffix}-${dk}`, at: at(day.date, minute), kind, channel, priority, generic, params });

    // ── Food ──
    if (foodOn && !ramadan) {
      for (const slot of ['breakfast', 'lunch', 'dinner'] as MealSlot[]) {
        const usual = usualOr(f.usual[slot], DEFAULT_USUAL[slot]);
        if (usual == null) continue;
        const when = usual + 45;
        if (day.mealsLogged.includes(slot)) continue;
        // A meal logged around the usual time counts, whatever it was called.
        if (day.mealMinutes.some((m) => m >= usual - 90 && m <= when)) continue;
        if (f.fastEndsAt && at(day.date, when).getTime() < f.fastEndsAt.getTime()) continue;
        const left = Math.max(0, f.targets.kcal - day.kcal);
        push('meal', 'food', when, slot === 'dinner' ? 55 : 50, { slot, kcalLeft: left }, `-${slot}`);
      }
      // Protein, once there's a day of eating to judge: afternoon, under half.
      if (today && day.mealsLogged.length + day.mealMinutes.length > 0 && f.targets.protein > 0 && day.protein < f.targets.protein * 0.5) {
        const dinner = usualOr(f.usual.dinner, DEFAULT_USUAL.dinner) ?? DEFAULT_USUAL.dinner;
        const when = Math.min(17 * 60 + 30, Math.max(15 * 60 + 30, dinner - 180));
        push('protein', 'food', when, 60, {
          have: Math.round(day.protein),
          target: Math.round(f.targets.protein),
          food: f.proteinFood?.name ?? null,
          foodProtein: f.proteinFood ? Math.round(f.proteinFood.proteinG) : null,
        });
      }
    }
    if (foodOn && today && f.fastEndsAt && f.fastEndsAt.getTime() > f.now.getTime()) {
      const end = f.fastEndsAt;
      out.push({ id: `n-fastEnd-${key(end)}`, at: end, kind: 'fastEnd', channel: 'food', priority: 95, generic: false, params: {} });
    }

    // ── Water ──
    if (waterOn && f.targets.waterMl > 0 && day.waterMl < f.targets.waterMl) {
      const checks = ramadan ? RAMADAN_WATER_CHECKS : WATER_CHECKS;
      let sent = 0;
      for (const minute of checks) {
        if (sent >= 2) break;
        // Checks already behind us don't use up the day's two.
        if (at(day.date, minute).getTime() <= f.now.getTime() + 60_000) continue;
        const expected = ramadan ? f.targets.waterMl * (minute >= 22 * 60 ? 0.8 : 0.5) : waterExpected(f.targets.waterMl, minute);
        const deficit = expected - day.waterMl;
        if (deficit < WATER_SLACK_ML) continue;
        sent++;
        push('water', 'water', minute, 40, {
          haveMl: day.waterMl,
          targetMl: f.targets.waterMl,
          suggestMl: waterSuggestion(deficit, f.glassMl),
          ramadan,
        }, `-${minute}`);
      }
      if (today && day.workoutEndMinute != null && day.waterSinceWorkoutMl < 300) {
        const when = day.workoutEndMinute + 30;
        if (at(day.date, when).getTime() > f.now.getTime()) push('waterAfterWorkout', 'water', when, 58, { suggestMl: 500 });
      }
    }

    // ── Training ──
    if (trainingOn) {
      if (day.plan && !day.trained) {
        const usual = f.usual.training ?? DEFAULT_USUAL.training;
        const when = Math.max(6 * 60 + 30, usual - 45);
        push('training', 'training', when, 70, {
          title: day.plan.title,
          exercises: day.plan.exercises,
          minutes: day.plan.exercises * 8 + 5,
          lead: day.plan.lead ?? null,
        });
      }
      if (day.missedYesterday && !day.plan) {
        push('missed', 'training', 9 * 60 + 30, 65, { title: day.missedYesterday.title });
      }
      if (!day.plan && !day.trained && !day.missedYesterday && f.hasSchedule && !ramadan) {
        push('restDay', 'training', 10 * 60 + 30, 15, {
          proteinLeft: foodOn ? Math.max(0, Math.round(f.targets.protein - day.protein)) : null,
        });
      }
      if (day.program?.weekStarting || day.program?.finished) {
        push('program', 'training', 9 * 60, 45, { ...day.program });
      }
    }

    // ── Progress: the day's recap, the good vibes ──
    if (today && day.loggedAnything) {
      push('dayRecap', 'progress', recapMinute(f, ramadan), 80, {
        food: foodOn ? { kcal: Math.round(day.kcal), target: Math.round(f.targets.kcal), protein: Math.round(day.protein), proteinTarget: Math.round(f.targets.protein) } : null,
        water: waterOn ? { ml: day.waterMl, target: f.targets.waterMl } : null,
        training: trainingOn ? { trained: day.trained, title: day.plan?.title ?? null, prs: day.prs, burned: day.burnedKcal } : null,
        body: day.bodyWins,
        streak: Math.max(foodOn ? f.logStreak : 0, trainingOn ? f.workoutStreak : 0),
      });
    }
    // Saturday morning: the week that just ended.
    if (day.date.getDay() === 6 && f.week && f.week.activeDays >= 3) {
      push('weekRecap', 'progress', 10 * 60, 85, {
        ...f.week,
        food: foodOn,
        water: waterOn,
        training: trainingOn,
      });
    }
  });

  // Further out, only if the app stays closed: gentle, then silence.
  for (const d of COMEBACK_DAYS) {
    const day = new Date(f.days[0].date);
    day.setDate(day.getDate() + d);
    out.push({ id: `n-comeback-${d}`, at: at(day, 19 * 60), kind: 'comeback', channel: 'progress', priority: 10, generic: true, params: { step: d } });
  }
  return out;
}

/**
 * The plan: candidates that are still in the future and outside quiet hours,
 * then per day the most useful ones first, within the daily maximum and never
 * two within SPACING_MIN of each other.
 */
export function planNotes(f: NotifyFacts): PlannedNote[] {
  const soon = f.now.getTime() + 60_000;
  const pool = candidates(f).filter((n) => n.at.getTime() > soon && !inQuietHours(n.at, f.prefs));
  const byDay = new Map<string, PlannedNote[]>();
  for (const n of pool) {
    const k = key(n.at);
    byDay.set(k, [...(byDay.get(k) ?? []), n]);
  }
  const chosen: PlannedNote[] = [];
  for (const notes of byDay.values()) {
    const ordered = [...notes].sort((a, b) => b.priority - a.priority || a.at.getTime() - b.at.getTime());
    const picked: PlannedNote[] = [];
    for (const n of ordered) {
      if (picked.length >= f.prefs.maxPerDay) break;
      if (picked.some((p) => Math.abs(p.at.getTime() - n.at.getTime()) < SPACING_MIN * 60_000)) continue;
      picked.push(n);
    }
    chosen.push(...picked);
  }
  return chosen.sort((a, b) => a.at.getTime() - b.at.getTime());
}
