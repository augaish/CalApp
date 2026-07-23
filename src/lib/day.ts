import { create } from 'zustand';

/** Non-persisted, app-wide "which day am I viewing" for Overview & Food. */
interface DayState {
  day: Date;
  setDay: (day: Date) => void;
  shift: (delta: number) => void;
}

function notFuture(d: Date): Date {
  return d.getTime() > Date.now() ? new Date() : d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Timestamp to log an entry against the currently viewed day: real "now" when
 * viewing today, otherwise the selected day stamped with the current clock time.
 */
export function timestampFor(day: Date): string {
  const now = new Date();
  if (sameDay(day, now)) return now.toISOString();
  const d = new Date(day);
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return d.toISOString();
}

export const useViewDay = create<DayState>((set, get) => ({
  day: new Date(),
  setDay: (day) => set({ day: notFuture(day) }),
  shift: (delta) => {
    const d = new Date(get().day);
    d.setDate(d.getDate() + delta);
    set({ day: notFuture(d) });
  },
}));
