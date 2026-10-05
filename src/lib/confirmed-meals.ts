/**
 * Meals whose logging screen already said "Added to Lunch" with its own
 * Undo. Food skips its own "Added to…" for these, so the same meal is
 * never confirmed twice. Kept in memory only: it is about the last minute.
 */
const confirmed = new Set<string>();

export function markConfirmed(mealId: string): void {
  confirmed.add(mealId);
  if (confirmed.size > 50) confirmed.delete(confirmed.values().next().value as string);
}

export function wasConfirmed(mealId: string): boolean {
  return confirmed.has(mealId);
}
