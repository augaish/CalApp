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
