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

export const useViewDay = create<DayState>((set, get) => ({
  day: new Date(),
  setDay: (day) => set({ day: notFuture(day) }),
  shift: (delta) => {
    const d = new Date(get().day);
    d.setDate(d.getDate() + delta);
    set({ day: notFuture(d) });
  },
}));
