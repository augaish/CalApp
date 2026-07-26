import { create } from 'zustand';

/** Transient (non-persisted) one-shot celebration message shown as a toast. */
interface CelebrateState {
  message: string | null;
  celebrate: (message: string) => void;
  clear: () => void;
}

export const useCelebrate = create<CelebrateState>((set) => ({
  message: null,
  celebrate: (message) => set({ message }),
  clear: () => set({ message: null }),
}));
