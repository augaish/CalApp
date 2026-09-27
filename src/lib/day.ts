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

/** Inverse of store.dateKey — local y-m-d with a ZERO-BASED month, never an
 * ISO string. Reinterpreting it as ISO shifts every date back a month. */
export function dayFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m, d);
}

/**
 * Whole calendar days between an entry and a reference day — 1 for yesterday
 * however few hours ago that was, which is what a person means by "a day ago".
 * Counted from midnight to midnight rather than in 24-hour blocks, so a set at
 * 11pm and one at 7am the next morning are a day apart, not zero.
 */
export function calendarDaysBetween(iso: string, day: Date): number {
  const from = new Date(iso);
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Is `remoteAt` a later instant than `localAt`? Used to decide whether the
 * account's copy should replace this device's.
 *
 * Compared as instants, not as strings. Our own writes are stamped by
 * `toISOString()` ("…123Z") while the value read back from Postgres carries an
 * offset ("…123+00:00"), and '+' sorts below 'Z' — so the same moment compared
 * as text looked older than itself. An unparseable stamp counts as not newer,
 * which pushes rather than pulls and so cannot lose local logs.
 */
export function isNewerStamp(remoteAt: string, localAt: string | null): boolean {
  if (!localAt) return true;
  const remote = Date.parse(remoteAt);
  const local = Date.parse(localAt);
  if (Number.isNaN(remote) || Number.isNaN(local)) return false;
  return remote > local;
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

/**
 * The seven days the strip shows for a selected day. Weeks are fixed pages
 * counted back from today — today's page ends today, the one before ends a
 * week ago, and so on — so stepping a day at a time moves the highlight
 * across a still row and only turns the page at its edge, instead of the
 * whole row sliding under your finger on every tap.
 */
export function weekPageFor(selected: Date, today: Date = new Date()): Date[] {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const back = Math.max(0, Math.round((start(today).getTime() - start(selected).getTime()) / 86_400_000));
  const end = start(today);
  end.setDate(end.getDate() - Math.floor(back / 7) * 7);
  const days: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    days.push(d);
  }
  return days;
}
