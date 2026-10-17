import type { AppState } from './store';

type Week = AppState['schedule'];

const trains = (week: Week, wd: number) => (week[wd]?.exerciseIds?.length ?? 0) > 0;

/** 'move' when the other day is rest, 'swap' when it trains too. */
export function moveKind(week: Week, to: number): 'move' | 'swap' {
  return trains(week, to) ? 'swap' : 'move';
}

/**
 * The weekly schedule with one weekday's workout on another day: onto a rest
 * day it moves (its own day becomes rest); onto a training day the two swap.
 * The day's name, exercises, order and planned sets travel together. Moving
 * `to` back to `from` undoes it, either way.
 */
export function moveWeekday(week: Week, from: number, to: number): Week {
  if (from === to || !trains(week, from)) return week;
  const next: Week = { ...week };
  const a = week[from];
  const b = week[to];
  next[to] = a;
  if (b && trains(week, to)) next[from] = b;
  else delete next[from];
  return next;
}
