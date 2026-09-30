import { normalizeDigits } from './numbers';
import { loggedBasis, scaleMacros, servingCountLabel, type Macros } from './recipes';
import type { FoodItem, PortionBase } from './types';

/**
 * Portions of a logged food: what "1" is, how many of it were eaten, and the
 * label and macros that follow.
 *
 * The macros saved on an item are already scaled to what was eaten, so
 * rescaling from them treats ½ plate as if it were the whole plate — reopening
 * a meal saved at ½ and tapping 1 used to keep the half-plate calories. Every
 * portion change here multiplies the unrounded one-portion basis instead, and
 * that basis is saved with the item, so a portion changed any number of times
 * lands where changing it once would.
 */

/** The ¼ ½ 1 1½ 2 chips. */
export const PORTION_CHIPS = [0.25, 0.5, 1, 1.5, 2] as const;

/** Where − and + go for foods counted in portions rather than weighed. */
const COUNT_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

const DIGITS = '[0-9٠-٩۰-۹]';
const NUM = `${DIGITS}+(?:[.,٫]${DIGITS}+)?`;
// A weight or volume as the scan writes it: "~400 g", "185 g", "٢٠٠ غ", "250 ml".
// The unit must end the word, so "2 glasses" is not 2 g.
const AMOUNT_RE = new RegExp(
  `([~≈]\\s*)?(${NUM})\\s*(grams?|gr|gm|g|ml|mL|غرام|غم|غ|جرام|جم|مل)(?![A-Za-z\\u0600-\\u06FF])`,
  'g',
);

type Unit = 'g' | 'ml';
const unitOf = (u: string): Unit => (/^(ml|mL|مل)$/.test(u) ? 'ml' : 'g');
const toNumber = (s: string): number => parseFloat(normalizeDigits(s).replace(',', '.'));
const hasArabicDigits = (s: string): boolean => /[٠-٩]/.test(s);
const arabicDigits = (s: string): string => s.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

interface AmountMatch {
  index: number;
  length: number;
  approx: string;
  number: string;
  unitText: string;
  amount: number;
  unit: Unit;
}

function amountMatches(label: string): AmountMatch[] {
  const out: AmountMatch[] = [];
  for (const m of label.matchAll(AMOUNT_RE)) {
    const amount = toNumber(m[2]);
    if (!(amount > 0)) continue;
    out.push({
      index: m.index ?? 0,
      length: m[0].length,
      approx: m[1] ?? '',
      number: m[2],
      unitText: m[3],
      amount,
      unit: unitOf(m[3]),
    });
  }
  return out;
}

/**
 * The one weight a portion label gives, if it gives exactly one it can be
 * trusted for. "1 large plate (~400 g)" is 400 g; "2 slices (60 g) + filling
 * (160 g)" names two parts and no total, so it gives none unless one of them
 * is marked as the approximate whole.
 */
function mainAmount(label: string): AmountMatch | undefined {
  const all = amountMatches(label);
  if (all.length === 1) return all[0];
  const approx = all.filter((m) => m.approx);
  return approx.length === 1 ? approx[0] : undefined;
}

export function parsePortionAmount(label: string): { amount: number; unit: Unit } | undefined {
  const m = mainAmount(label);
  return m ? { amount: m.amount, unit: m.unit } : undefined;
}

export type PortionKind = 'weight' | 'count' | 'serving';

export interface PortionState {
  base: PortionBase;
  /** How many of `base` were eaten. */
  mult: number;
  /** weight: an amount box in g/ml; count: portions of the label; serving: recipe servings. */
  kind: PortionKind;
}

const macrosOf = (i: Macros): Macros => ({ calories: i.calories, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG });

/**
 * What "1" is for this item and how many were eaten — from the basis saved
 * with it, or, for anything logged before bases were saved, worked back from
 * the scaled macros and the chip that was picked.
 */
export function portionState(item: FoodItem): PortionState | null {
  const servings = item.recipeServings;
  if (typeof servings === 'number' && servings > 0) {
    const basis = loggedBasis(item);
    if (!basis) return null;
    return { base: { label: '', macros: basis }, mult: servings, kind: 'serving' };
  }
  if (item.portionBase && item.portionBase.macros) {
    const mult = item.portionMultiplier && item.portionMultiplier > 0 ? item.portionMultiplier : 1;
    return { base: item.portionBase, mult, kind: item.portionBase.amount ? 'weight' : 'count' };
  }
  // A packaged food: "1" is the amount it was logged at.
  if (item.basePer100 && item.gramsEaten && item.gramsEaten > 0) {
    const g = item.gramsEaten;
    return {
      base: { label: `${Math.round(g)} g`, amount: g, unit: 'g', macros: scaleMacros(item.basePer100, g / 100) },
      mult: 1,
      kind: 'weight',
    };
  }
  // Older records: the label was never rewritten, so it still describes one
  // portion, and the saved macros are that portion times the chip picked.
  const mult = item.portionMultiplier && item.portionMultiplier > 0 ? item.portionMultiplier : 1;
  const parsed = parsePortionAmount(item.portion ?? '');
  return {
    base: {
      label: item.portion ?? '',
      ...(parsed ? { amount: parsed.amount, unit: parsed.unit } : {}),
      macros: scaleMacros(macrosOf(item), 1 / mult),
    },
    mult,
    kind: parsed ? 'weight' : 'count',
  };
}

const isWhole = (n: number) => Math.abs(n - Math.round(n)) < 1e-6;
/** ¼ ½ ¾ and whole numbers read as fractions; anything else is a custom amount. */
function isNiceMultiple(m: number): boolean {
  const q = m * 4;
  return isWhole(q) && m > 0;
}

function fmtAmount(n: number, like: string): string {
  const s = String(Math.round(n));
  return hasArabicDigits(like) ? arabicDigits(s) : s;
}

/**
 * The label for `mult` of a portion, in the language the portion was written
 * in: "½ large plate (~200 g)", "93 g", "1½ × 1 cup", "~250 g".
 */
export function portionLabelFor(base: PortionBase, mult: number): string {
  const label = base.label.trim();
  if (Math.abs(mult - 1) < 1e-6) return label;
  const main = mainAmount(label);
  const scaledAmount = (m: AmountMatch) => `${m.approx}${fmtAmount(m.amount * mult, m.number)} ${m.unitText}`;
  // The label is only an amount ("185 g"): the new amount is the whole label.
  if (main && main.index === 0 && main.length === label.length) {
    return `${fmtAmount(main.amount * mult, main.number)} ${main.unitText}`;
  }
  if (!isNiceMultiple(mult)) {
    if (main) return `~${fmtAmount(main.amount * mult, main.number)} ${main.unitText}`;
    return `${servingCountLabel(mult)} × ${label}`;
  }
  const count = servingCountLabel(mult);
  // "1 large plate (~400 g)" at a fraction → "½ large plate (~200 g)". Above
  // one the noun would need its plural, which a label from the scan can't be
  // given reliably in either language, so it reads "1½ × 1 large plate".
  const one = /^(1|١)(?![0-9٠-٩.,٫/])\s*/.exec(label);
  if (one && mult < 1) {
    let rest = label.slice(one[0].length);
    if (main) {
      const at = main.index - one[0].length;
      rest = rest.slice(0, at) + scaledAmount(main) + rest.slice(at + main.length);
    }
    return `${count} ${rest}`;
  }
  return `${count} × ${label}`;
}

const roundMacros = (m: Macros): Macros => ({
  calories: Math.round(m.calories),
  proteinG: Math.round(m.proteinG),
  carbsG: Math.round(m.carbsG),
  fatG: Math.round(m.fatG),
});

/** The item at `mult` portions. Returns the item unchanged for a bad amount. */
export function withPortion(item: FoodItem, mult: number): FoodItem {
  const state = portionState(item);
  if (!state || !(mult > 0) || !Number.isFinite(mult)) return item;
  const macros = roundMacros(scaleMacros(state.base.macros, mult));
  if (state.kind === 'serving') {
    return { ...item, ...macros, recipeServings: mult, recipeBasis: state.base.macros };
  }
  const next: FoodItem = {
    ...item,
    ...macros,
    portion: portionLabelFor(state.base, mult),
    portionBase: state.base,
    portionMultiplier: mult,
  };
  if ((item.basePer100 || item.gramsEaten != null) && state.base.amount) next.gramsEaten = Math.round(state.base.amount * mult);
  return next;
}

/** The item at an amount in its own unit (grams or ml) — weight kind only. */
export function withAmount(item: FoodItem, amount: number): FoodItem {
  const state = portionState(item);
  if (!state?.base.amount || !(amount > 0)) return item;
  return withPortion(item, amount / state.base.amount);
}

/** The amount shown in the box: grams/ml for weighed foods, else the multiple. */
export function shownAmount(state: PortionState): number {
  return state.kind === 'weight' && state.base.amount ? Math.round(state.base.amount * state.mult) : state.mult;
}

/** One press of − or +. */
export function stepPortion(state: PortionState, dir: 1 | -1): number | null {
  if (state.kind === 'weight' && state.base.amount) {
    const step = state.base.amount >= 100 ? 10 : 5;
    const now = Math.round(state.base.amount * state.mult);
    // Land on the step grid first, so 93 g goes to 90/100, not 83/103.
    const next = dir > 0 ? Math.floor(now / step) * step + step : Math.ceil(now / step) * step - step;
    return next >= step ? next / state.base.amount : null;
  }
  const m = state.mult;
  const next = dir > 0 ? COUNT_STEPS.find((s) => s > m + 1e-6) : [...COUNT_STEPS].reverse().find((s) => s < m - 1e-6);
  return next ?? null;
}

/**
 * Macros typed by hand. The typed number is what was eaten at the current
 * portion, so it becomes that portion's share of the basis — changing the
 * portion afterwards scales the corrected figure instead of throwing it away.
 * Per-100 g label data no longer matches, so it goes.
 */
export function withMacroEdit(item: FoodItem, patch: Partial<Macros>): FoodItem {
  const state = portionState(item);
  const next: FoodItem = { ...item, ...patch };
  delete next.basePer100;
  if (!state) {
    delete next.portionMultiplier;
    delete next.portionBase;
    return next;
  }
  const macros = { ...state.base.macros };
  for (const k of Object.keys(patch) as (keyof Macros)[]) {
    const v = patch[k];
    if (typeof v === 'number') macros[k] = v / state.mult;
  }
  if (state.kind === 'serving') {
    next.recipeBasis = macros;
    return next;
  }
  next.portionBase = { ...state.base, macros };
  next.portionMultiplier = state.mult;
  return next;
}

/**
 * A packaged food as it is about to be logged: "1" becomes the amount logged,
 * so reopening it offers ½ of what was eaten rather than ½ of 100 g.
 */
export function settleLoggedPortion(item: FoodItem): FoodItem {
  if (!item.basePer100 || !item.gramsEaten || item.gramsEaten <= 0) return item;
  const g = Math.round(item.gramsEaten);
  return {
    ...item,
    portion: `${g} g`,
    gramsEaten: g,
    portionBase: { label: `${g} g`, amount: g, unit: 'g', macros: scaleMacros(item.basePer100, g / 100) },
    portionMultiplier: 1,
  };
}
