import type { ExerciseNote, LoggedWorkout } from './types';

/** Local y-m-d key, the same as store.dateKey (zero-based month). */
function keyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** One line of an exercise's note history. */
export interface NoteEntry {
  key: string;
  /** When the workout was, for "Mon, Sep 29". */
  at: string;
  dayKey: string;
  text: string;
  /** A comment left on one set (from the exercise's history screen), not a whole note. */
  setNo?: number;
}

/**
 * Earlier notes for an exercise, newest workout first: the notes written in a
 * workout, plus any comment left on a single set. The workout in progress
 * (`excludeDayKey`) is left out — that one is "Today", shown on its own.
 * Matched by the exercise's id, so a renamed or translated exercise keeps
 * its history and a different exercise never borrows it.
 */
export function previousNotes(
  notes: ExerciseNote[],
  workouts: LoggedWorkout[],
  exerciseId: string,
  excludeDayKey?: string,
): NoteEntry[] {
  const out: NoteEntry[] = [];
  for (const n of notes) {
    if (n.exerciseId !== exerciseId || n.dayKey === excludeDayKey) continue;
    out.push({ key: n.id, at: n.at, dayKey: n.dayKey, text: n.text });
  }
  for (const w of workouts) {
    if (w.exerciseId !== exerciseId) continue;
    const dayKey = keyOf(w.at);
    if (dayKey === excludeDayKey) continue;
    w.sets.forEach((s, i) => {
      const text = s.comment?.trim();
      if (text) out.push({ key: `${w.id}:${i}`, at: w.at, dayKey, text, setNo: i + 1 });
    });
  }
  // Newest workout first; within one, the whole note before set comments, sets in order.
  return out.sort((a, b) => b.at.localeCompare(a.at) || (a.setNo ?? 0) - (b.setNo ?? 0) || a.key.localeCompare(b.key));
}

/** The note for this exercise on this workout day, if one was saved. */
export function noteFor(notes: ExerciseNote[], exerciseId: string, dayKey: string): ExerciseNote | undefined {
  return notes.find((n) => n.exerciseId === exerciseId && n.dayKey === dayKey);
}
