/**
 * The water sheet's quick buttons.
 *
 * They start as the three common sizes — a glass, a can, a small bottle — and
 * learn from the person: an amount they keep logging by hand, over weeks
 * rather than one afternoon, takes the place of the default they use least.
 * Pure, so the rule can be tested on its own.
 */

export const DEFAULT_WATER_BUTTONS = [250, 330, 500];

/** How far back the habit is read. */
const WINDOW_DAYS = 30;
/** An amount becomes a button after this many logs… */
const MIN_LOGS = 5;
/** …spread over at least this many different days. */
const MIN_DAYS = 3;

function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function waterButtons(
  entries: { at: string; ml: number }[],
  now: Date = new Date(),
): number[] {
  const since = now.getTime() - WINDOW_DAYS * 86_400_000;
  const uses = new Map<number, { count: number; days: Set<string> }>();
  for (const e of entries) {
    const t = new Date(e.at).getTime();
    if (!(t >= since) || !(e.ml > 0)) continue;
    const ml = Math.round(e.ml);
    const u = uses.get(ml) ?? { count: 0, days: new Set<string>() };
    u.count += 1;
    u.days.add(localDay(e.at));
    uses.set(ml, u);
  }
  const count = (ml: number) => uses.get(ml)?.count ?? 0;

  const buttons = [...DEFAULT_WATER_BUTTONS];
  const habits = [...uses.entries()]
    .filter(([ml, u]) => !buttons.includes(ml) && u.count >= MIN_LOGS && u.days.size >= MIN_DAYS)
    .sort((a, b) => b[1].count - a[1].count || a[0] - b[0]);

  for (const [ml, u] of habits) {
    // Replace the least-used button, but only one the habit outnumbers —
    // a size used just as often keeps its place.
    let weakest = 0;
    for (let i = 1; i < buttons.length; i++) {
      if (count(buttons[i]) < count(buttons[weakest])) weakest = i;
    }
    if (u.count > count(buttons[weakest])) buttons[weakest] = ml;
  }
  return buttons.sort((a, b) => a - b);
}
