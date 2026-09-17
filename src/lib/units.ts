import type { Units } from './types';

/**
 * Display units (S20 Units preference). Every stored value stays metric —
 * kilograms and centimetres — and only the presentation converts, so a
 * preference change never rewrites a record.
 */
const LB_PER_KG = 2.2046226218;
const IN_PER_CM = 0.3937007874;

export function kgToDisplay(kg: number, units: Units): number {
  return units === 'imperial' ? kg * LB_PER_KG : kg;
}

export function displayToKg(value: number, units: Units): number {
  return units === 'imperial' ? value / LB_PER_KG : value;
}

export function cmToDisplay(cm: number, units: Units): number {
  return units === 'imperial' ? cm * IN_PER_CM : cm;
}

/** "kg" or "lb" — the unit word, in the user's language. */
export function weightUnit(units: Units, t: (key: string) => string): string {
  return units === 'imperial' ? t('units.lb') : t('progress.kg');
}

export function lengthUnit(units: Units, t: (key: string) => string): string {
  return units === 'imperial' ? t('units.in') : t('units.cm');
}

/** A weight for display, e.g. "74.8 kg" / "164.9 lb", rounded to one decimal. */
export function formatWeight(kg: number, units: Units, t: (key: string) => string, decimals = 1): string {
  const v = kgToDisplay(kg, units);
  const shown = decimals === 0 ? String(Math.round(v)) : v.toFixed(decimals).replace(/\.0$/, '');
  return `${shown} ${weightUnit(units, t)}`;
}

/** A signed change, e.g. "+0.6 kg" / "−1.3 lb". Neutral wording; the sign is the fact. */
export function formatWeightDelta(deltaKg: number, units: Units, t: (key: string) => string): string {
  const v = kgToDisplay(Math.abs(deltaKg), units);
  const sign = deltaKg > 0 ? '+' : deltaKg < 0 ? '−' : '';
  return `${sign}${v.toFixed(1)} ${weightUnit(units, t)}`;
}
