import { create } from 'zustand';

/** Transient (non-persisted) one-shot celebration message shown as a toast. */
interface CelebrateState {
  message: string | null;
  /** How long it stays up, in ms (default: a short beat). */
  hold: number | null;
  celebrate: (message: string, holdMs?: number) => void;
  clear: () => void;
}

export const useCelebrate = create<CelebrateState>((set) => ({
  message: null,
  hold: null,
  celebrate: (message, holdMs) => set({ message, hold: holdMs ?? null }),
  clear: () => set({ message: null, hold: null }),
}));
