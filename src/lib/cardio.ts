import type { Exercise, Units, WorkoutSet } from './types';

/**
 * Cardio machine settings: speed and incline on a treadmill, level on a
 * stair climber, damper on a rower. Stored on the session's set, so they
 * open next time with last time's numbers, read wherever the session is
 * shown ("30 min · 10 km/h · 6% · 5.0 km"), and on the treadmill the
 * incline counts in the calorie estimate. Levels never change the estimate:
 * "level 8" means different things on different brands.
 */

export type CardioField = 'speedKmh' | 'inclinePct' | 'level' | 'floors' | 'rpm' | 'damper';

export const CARDIO_SPEC: Record<CardioField, { step: number; decimals: number; min: number; max: number; optional?: boolean }> = {
  speedKmh: { step: 0.5, decimals: 1, min: 0, max: 30 },
  inclinePct: { step: 0.5, decimals: 1, min: -5, max: 40 },
  level: { step: 1, decimals: 0, min: 0, max: 40 },
  floors: { step: 5, decimals: 0, min: 0, max: 2000, optional: true },
  rpm: { step: 5, decimals: 0, min: 0, max: 250, optional: true },
  damper: { step: 1, decimals: 0, min: 0, max: 10 },
};

const BUILTIN: Record<string, CardioField[]> = {
  treadmill: ['speedKmh', 'inclinePct'],
  'stair-climber': ['level', 'floors'],
  cycling: ['level', 'rpm'],
  elliptical: ['level', 'inclinePct'],
  rowing: ['damper'],
};

/** The settings a cardio machine remembers; empty for everything else. */
export function cardioFieldsFor(ex: Pick<Exercise, 'id' | 'name' | 'nameEn' | 'nameAr' | 'source' | 'category'> | undefined): CardioField[] {
  if (!ex) return [];
  const bare = ex.id.replace(/^builtin:/, '');
  if (ex.source === 'builtin') return BUILTIN[bare] ?? [];
  if (ex.category !== 'cardio') return [];
  const name = [ex.name, ex.nameEn, ex.nameAr].filter(Boolean).join(' ').toLowerCase();
  if (/treadmill|جهاز المشي|سير/.test(name)) return BUILTIN.treadmill;
  if (/stair|step ?mill|درج/.test(name)) return BUILTIN['stair-climber'];
  if (/elliptical|cross ?trainer|أوربتراك|إهليلجي/.test(name)) return BUILTIN.elliptical;
  if (/row|تجديف/.test(name)) return BUILTIN.rowing;
  if (/bike|cycle|دراجة|سايكل/.test(name)) return BUILTIN.cycling;
  return [];
}

/** Distance from speed and time, to the nearest 10 m. */
export function autoDistanceM(speedKmh: number, seconds: number): number {
  if (speedKmh <= 0 || seconds <= 0) return 0;
  return Math.round((speedKmh * 1000 * (seconds / 3600)) / 10) * 10;
}

/** Time-weighted incline of the done sets, as a grade (6% → 0.06). */
export function inclineGrade(sets: WorkoutSet[]): number {
  let secs = 0;
  let weighted = 0;
  for (const s of sets) {
    if (!s.done || s.inclinePct == null) continue;
    const t = s.seconds ?? 0;
    secs += t;
    weighted += t * s.inclinePct;
  }
  return secs > 0 ? weighted / secs / 100 : 0;
}

/** Whether a set carries any machine setting. */
export function hasCardioSettings(s: Partial<WorkoutSet>): boolean {
  return s.speedKmh != null || s.inclinePct != null || s.level != null || s.floors != null || s.rpm != null || s.damper != null;
}

const KM_PER_MILE = 1.609344;
const trim = (n: number, d = 1) => String(Number(n.toFixed(d)));

/** A speed in the person's units: "10 km/h" or "6.2 mph". */
export function speedText(kmh: number, units: Units, t: (k: string) => string): string {
  return units === 'imperial' ? `${trim(kmh / KM_PER_MILE)} ${t('cardio.mph')}` : `${trim(kmh)} ${t('cardio.kmh')}`;
}

/** A distance in the person's units: "5.0 km" or "3.1 mi". */
export function distanceText(m: number, units: Units, t: (k: string) => string): string {
  return units === 'imperial' ? `${(m / 1000 / KM_PER_MILE).toFixed(1)} ${t('cardio.mi')}` : `${(m / 1000).toFixed(1)} ${t('cardio.km')}`;
}

/**
 * One cardio session as a line: "30 min · 10 km/h · 6% incline · 5.0 km",
 * "20 min · level 8 · 95 floors". Settings not recorded are left out, so an
 * older session still reads "30 min · 3.2 km".
 */
export function cardioLine(s: Partial<WorkoutSet>, units: Units, t: (k: string, o?: Record<string, unknown>) => string): string {
  const parts = [t('cardio.minutes', { n: Math.round((s.seconds ?? 0) / 60) })];
  if (s.speedKmh != null && s.speedKmh > 0) parts.push(speedText(s.speedKmh, units, t));
  if (s.inclinePct != null) parts.push(t('cardio.inclineN', { n: trim(s.inclinePct) }));
  if (s.level != null) parts.push(t('cardio.levelN', { n: s.level }));
  if (s.damper != null) parts.push(t('cardio.damperN', { n: s.damper }));
  if (s.rpm != null) parts.push(t('cardio.rpmN', { n: s.rpm }));
  if (s.floors != null) parts.push(t('cardio.floorsN', { n: s.floors }));
  if (s.distanceM) parts.push(distanceText(s.distanceM, units, t));
  return parts.join(' · ');
}
