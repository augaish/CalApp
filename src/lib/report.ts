import { exerciseName, findExercise } from './exercises';
import {
  actualBurnedForDay,
  isSameDay,
  streakDays,
  totalsForDay,
  waterForDay,
  waterTargetMl,
  workoutStreakDays,
  type AppState,
} from './store';
import type { Language, LoggedWorkout, WeightEntry } from './types';
import { formatWeight, formatWeightDelta } from './units';

/**
 * "Export my data" as a report a person would actually keep: the last 30
 * days of food, training, water and body readings as a colourful, printable
 * page — summary cards, charts and the analysis the app already does — with
 * every day, session and reading listed at the end. Rendered to PDF on the
 * phone (lib/export.ts); the complete machine-readable copy is the separate
 * data file.
 *
 * Pure: no React Native, the clock and the translator are passed in, so the
 * content is tested directly (qa/report-test.ts).
 */

export type Translate = (key: string, values?: Record<string, unknown>) => string;

type State = Pick<
  AppState,
  'account' | 'profile' | 'targets' | 'meals' | 'workouts' | 'exercises' | 'weights' | 'water' | 'units' | 'whoopBurnByDay' | 'whoopWorkoutsByDay'
>;

const DAY_MS = 86_400_000;
const PERIOD_DAYS = 30;

const C = {
  ink: '#211B2E',
  muted: '#6B6380',
  faint: '#9A93AC',
  line: '#E6E1F0',
  bg: '#F5F3FA',
  card: '#FFFFFF',
  tint: '#EEE9F7',
  primary: '#6D5AAB',
  primaryDark: '#59478F',
  gradStart: '#9B86D4',
  gradEnd: '#7FB89B',
  protein: '#3B82F6',
  carbs: '#C27A12',
  fat: '#C46FB0',
  water: '#0284C7',
  success: '#256647',
  warning: '#795017',
};

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Estimated one-rep max (Epley), to rank a lift across rep counts. */
function oneRepMax(kg: number, reps: number): number {
  return reps <= 1 ? kg : kg * (1 + reps / 30);
}

export interface ReportData {
  from: Date;
  to: Date;
  days: {
    date: Date;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    /** Nutrients whose day total is only a known minimum. */
    incomplete: string[];
    waterMl: number;
    burned: number;
    workouts: string[];
  }[];
  targets: { kcal: number; protein: number; carbs: number; fat: number; waterMl: number } | null;
  food: { loggedDays: number; avgKcal: number; avgProtein: number; avgCarbs: number; avgFat: number; onTargetDays: number; proteinDays: number } | null;
  training: {
    sessions: number;
    sets: number;
    perWeek: number[];
    best: { name: string; kg: number; reps: number }[];
    records: number;
  };
  waterAvgMl: number;
  logStreak: number;
  workoutStreak: number;
  body: {
    readings: WeightEntry[];
    first: WeightEntry | null;
    last: WeightEntry | null;
  };
  sessions: { date: Date; name: string; sets: string }[];
}

/** Everything the report says, computed once. */
export function reportData(s: State, lang: Language, now: Date = new Date()): ReportData {
  const to = startOfDay(now);
  const from = new Date(to.getTime() - (PERIOD_DAYS - 1) * DAY_MS);
  const meals = Array.isArray(s.meals) ? s.meals : [];
  const workouts = Array.isArray(s.workouts) ? s.workouts : [];
  const water = Array.isArray(s.water) ? s.water : [];
  const custom = Array.isArray(s.exercises) ? s.exercises : [];
  const nameOf = (w: LoggedWorkout) => {
    const ex = findExercise(w.exerciseId, custom);
    return ex ? exerciseName(ex, lang) : w.exerciseName;
  };
  const done = (w: LoggedWorkout) => w.sets.filter((x) => x.done);

  const days: ReportData['days'] = [];
  for (let i = 0; i < PERIOD_DAYS; i++) {
    const date = new Date(from.getTime() + i * DAY_MS);
    const tot = totalsForDay(meals, date);
    const dayWorkouts = workouts.filter((w) => isSameDay(w.at, date) && done(w).length > 0);
    days.push({
      date,
      kcal: Math.round(tot.calories),
      protein: Math.round(tot.proteinG),
      carbs: Math.round(tot.carbsG),
      fat: Math.round(tot.fatG),
      incomplete: tot.incomplete ?? [],
      waterMl: waterForDay(water, date),
      burned: Math.round(actualBurnedForDay(workouts, s.whoopBurnByDay ?? {}, s.whoopWorkoutsByDay ?? {}, date)),
      workouts: [...new Set(dayWorkouts.map(nameOf))],
    });
  }

  const targets = s.targets
    ? {
        kcal: s.targets.calories,
        protein: s.targets.proteinG,
        carbs: s.targets.carbsG,
        fat: s.targets.fatG,
        waterMl: s.profile ? waterTargetMl(s.profile.weightKg) : 0,
      }
    : null;

  const logged = days.filter((d) => d.kcal > 0);
  const avg = (f: (d: (typeof days)[number]) => number) => (logged.length ? Math.round(logged.reduce((a, d) => a + f(d), 0) / logged.length) : 0);
  const food = logged.length
    ? {
        loggedDays: logged.length,
        avgKcal: avg((d) => d.kcal),
        avgProtein: avg((d) => d.protein),
        avgCarbs: avg((d) => d.carbs),
        avgFat: avg((d) => d.fat),
        onTargetDays: targets ? logged.filter((d) => Math.abs(d.kcal - targets.kcal) <= targets.kcal * 0.1).length : 0,
        proteinDays: targets ? logged.filter((d) => d.protein >= targets.protein).length : 0,
      }
    : null;

  const inPeriod = workouts.filter((w) => new Date(w.at).getTime() >= from.getTime() && done(w).length > 0);
  const sessionDays = new Set(inPeriod.map((w) => startOfDay(new Date(w.at)).getTime()));
  const perWeek = [0, 0, 0, 0, 0];
  for (const t of sessionDays) perWeek[Math.min(4, Math.floor((t - from.getTime()) / (7 * DAY_MS)))]++;
  const bestByName = new Map<string, { name: string; kg: number; reps: number; score: number }>();
  for (const w of inPeriod) {
    if (w.type !== 'weight_reps') continue;
    for (const x of done(w)) {
      if (!x.weightKg || !x.reps) continue;
      const score = oneRepMax(x.weightKg, x.reps);
      const name = nameOf(w);
      const cur = bestByName.get(name);
      if (!cur || score > cur.score) bestByName.set(name, { name, kg: x.weightKg, reps: x.reps, score });
    }
  }
  // A record: this period's best beats everything before it.
  let records = 0;
  for (const b of bestByName.values()) {
    const before = workouts
      .filter((w) => new Date(w.at).getTime() < from.getTime() && w.type === 'weight_reps' && nameOf(w) === b.name)
      .flatMap((w) => done(w))
      .reduce((m, x) => Math.max(m, x.weightKg && x.reps ? oneRepMax(x.weightKg, x.reps) : 0), 0);
    if (before > 0 && b.score > before) records++;
  }

  const waterDays = days.filter((d) => d.waterMl > 0);
  const readings = (Array.isArray(s.weights) ? s.weights : []).slice().sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const sessions = inPeriod
    .slice()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .map((w) => ({
      date: new Date(w.at),
      name: nameOf(w),
      sets: done(w)
        .map((x) => (x.weightKg != null && x.reps != null ? `${x.weightKg}×${x.reps}` : x.reps != null ? `×${x.reps}` : x.seconds != null ? `${x.seconds}s` : ''))
        .filter(Boolean)
        .join('  '),
    }));

  return {
    from,
    to,
    days,
    targets,
    food,
    training: {
      sessions: sessionDays.size,
      sets: inPeriod.reduce((a, w) => a + done(w).length, 0),
      perWeek,
      best: [...bestByName.values()].sort((a, b) => b.score - a.score).slice(0, 6).map(({ name, kg, reps }) => ({ name, kg, reps })),
      records,
    },
    waterAvgMl: waterDays.length ? Math.round(waterDays.reduce((a, d) => a + d.waterMl, 0) / waterDays.length) : 0,
    logStreak: streakDays(meals),
    workoutStreak: workoutStreakDays(workouts),
    body: { readings, first: readings[0] ?? null, last: readings[readings.length - 1] ?? null },
    sessions,
  };
}

// ── drawing ──

function kcalChart(d: ReportData, t: Translate): string {
  const W = 680, H = 190, pad = 28;
  const max = Math.max(d.targets?.kcal ?? 0, ...d.days.map((x) => x.kcal), 1) * 1.1;
  const bw = (W - pad * 2) / d.days.length;
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const bars = d.days
    .map((x, i) => {
      if (x.kcal <= 0) return '';
      const over = d.targets && x.kcal > d.targets.kcal * 1.1;
      const color = over ? C.warning : C.primary;
      return `<rect x="${(pad + i * bw + 1.5).toFixed(1)}" y="${y(x.kcal).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${(H - pad - y(x.kcal)).toFixed(1)}" rx="3" fill="${color}" opacity="${x.incomplete.includes('calories') ? 0.55 : 1}"/>`;
    })
    .join('');
  const target = d.targets
    ? `<line x1="${pad}" x2="${W - pad}" y1="${y(d.targets.kcal).toFixed(1)}" y2="${y(d.targets.kcal).toFixed(1)}" stroke="${C.gradEnd}" stroke-width="2" stroke-dasharray="6 4"/><text x="${W - pad}" y="${(y(d.targets.kcal) - 6).toFixed(1)}" text-anchor="end" font-size="11" fill="${C.success}">${esc(t('report.target'))} ${d.targets.kcal.toLocaleString('en')}</text>`
    : '';
  const labels = [0, Math.floor(d.days.length / 2), d.days.length - 1]
    .map((i) => `<text x="${(pad + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${C.faint}">${d.days[i].date.getDate()}/${d.days[i].date.getMonth() + 1}</text>`)
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="direction:ltr"><line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" stroke="${C.line}"/>${bars}${target}${labels}</svg>`;
}

function macroDonut(d: ReportData, t: Translate): string {
  if (!d.food) return '';
  const p = d.food.avgProtein * 4, c = d.food.avgCarbs * 4, f = d.food.avgFat * 9;
  const total = p + c + f || 1;
  const R = 54, CIRC = 2 * Math.PI * R;
  let off = 0;
  const seg = (v: number, color: string) => {
    const len = (v / total) * CIRC;
    const s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${color}" stroke-width="22" stroke-dasharray="${len.toFixed(1)} ${(CIRC - len).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 70 70)"/>`;
    off += len;
    return s;
  };
  const pct = (v: number) => Math.round((v / total) * 100);
  const legend = [
    [t('report.protein'), pct(p), C.protein, d.food.avgProtein],
    [t('report.carbs'), pct(c), C.carbs, d.food.avgCarbs],
    [t('report.fat'), pct(f), C.fat, d.food.avgFat],
  ]
    .map(([label, v, color, g]) => `<div class="leg"><span class="dot" style="background:${color}"></span>${esc(label)} <b>${v}%</b> <span class="muted">· ${g} ${esc(t('common.grams'))}</span></div>`)
    .join('');
  return `<div class="donut"><svg viewBox="0 0 140 140" width="140" height="140" style="direction:ltr">${seg(p, C.protein)}${seg(c, C.carbs)}${seg(f, C.fat)}</svg><div>${legend}<div class="muted small">${esc(t('report.macroNote'))}</div></div></div>`;
}

function weightChart(d: ReportData, s: State): string {
  const pts = d.body.readings;
  if (pts.length < 2) return '';
  const W = 680, H = 170, pad = 30;
  const t0 = new Date(pts[0].at).getTime(), t1 = new Date(pts[pts.length - 1].at).getTime();
  const lo = Math.min(...pts.map((p) => p.kg)) - 0.5, hi = Math.max(...pts.map((p) => p.kg)) + 0.5;
  const x = (at: string) => pad + ((new Date(at).getTime() - t0) / Math.max(1, t1 - t0)) * (W - pad * 2);
  const y = (kg: number) => H - pad - ((kg - lo) / (hi - lo)) * (H - pad * 2);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)} ${y(p.kg).toFixed(1)}`).join(' ');
  const dots = pts.map((p) => `<circle cx="${x(p.at).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="3.5" fill="${C.card}" stroke="${C.primary}" stroke-width="2"/>`).join('');
  const unit = s.units === 'imperial' ? 'lb' : 'kg';
  const show = (kg: number) => (s.units === 'imperial' ? kg * 2.20462 : kg).toFixed(1);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="direction:ltr">
    <defs><linearGradient id="wg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${C.gradStart}" stop-opacity="0.35"/><stop offset="1" stop-color="${C.gradStart}" stop-opacity="0"/></linearGradient></defs>
    <path d="${path} L${x(pts[pts.length - 1].at).toFixed(1)} ${H - pad} L${x(pts[0].at).toFixed(1)} ${H - pad} Z" fill="url(#wg)"/>
    <path d="${path}" fill="none" stroke="${C.primary}" stroke-width="2.5"/>${dots}
    <text x="${pad}" y="14" font-size="10" fill="${C.faint}">${show(hi)} ${unit}</text>
    <text x="${pad}" y="${H - pad - 4}" font-size="10" fill="${C.faint}">${show(lo)} ${unit}</text>
    <text x="${pad}" y="${H - pad + 16}" font-size="10" fill="${C.faint}">${new Date(pts[0].at).toLocaleDateString('en-GB')}</text>
    <text x="${W - pad}" y="${H - pad + 16}" text-anchor="end" font-size="10" fill="${C.faint}">${new Date(pts[pts.length - 1].at).toLocaleDateString('en-GB')}</text>
  </svg>`;
}

function weekBars(d: ReportData, t: Translate): string {
  const max = Math.max(1, ...d.training.perWeek);
  return `<div class="weeks">${d.training.perWeek
    .map((n, i) => `<div class="wk"><div class="wkbar"><div style="height:${Math.round((n / max) * 100)}%"></div></div><div class="small muted">${esc(t('report.weekN', { n: i + 1 }))}</div><b>${n}</b></div>`)
    .join('')}</div>`;
}

/** The whole report as one HTML page, ready for PDF. */
export function buildReportHtml(s: State, t: Translate, lang: Language, now: Date = new Date()): string {
  const d = reportData(s, lang, now);
  const ar = lang === 'ar';
  const n = (v: number) => Math.round(v).toLocaleString('en');
  const day = (date: Date) => date.toLocaleDateString(ar ? 'ar' : 'en', { day: 'numeric', month: 'short' });
  const range = `${day(d.from)} – ${day(d.to)} ${d.to.getFullYear()}`;
  const kg = (v: number) => formatWeight(v, s.units ?? 'metric', t);
  const name = s.account?.name && s.account.provider !== 'guest' ? s.account.name : '';

  const card = (label: string, value: string, sub = '', color = C.primary) =>
    `<div class="card stat"><div class="label">${esc(label)}</div><div class="value" style="color:${color}">${value}</div>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>`;

  const body = d.body;
  const bodyDelta = (pick: (w: WeightEntry) => number | undefined, fmt: (v: number) => string) => {
    const a = body.readings.find((w) => pick(w) != null);
    const b = [...body.readings].reverse().find((w) => pick(w) != null);
    if (!a || !b || a === b) return '';
    const delta = pick(b)! - pick(a)!;
    return fmt(delta);
  };

  const summary = [
    d.food && d.targets
      ? card(t('report.avgCalories'), `${n(d.food.avgKcal)} <small>/ ${n(d.targets.kcal)}</small>`, esc(t('report.onTargetDays', { n: d.food.onTargetDays, total: d.food.loggedDays })))
      : d.food
        ? card(t('report.avgCalories'), n(d.food.avgKcal))
        : '',
    d.food && d.targets
      ? card(t('report.avgProtein'), `${n(d.food.avgProtein)} <small>/ ${n(d.targets.protein)} ${esc(t('common.grams'))}</small>`, esc(t('report.proteinDays', { n: d.food.proteinDays })), C.protein)
      : '',
    card(t('report.workouts'), n(d.training.sessions), esc(t('report.setsTotal', { n: d.training.sets })), C.success),
    card(t('report.daysLogged'), `${d.food?.loggedDays ?? 0} <small>/ ${d.days.length}</small>`, esc(t('report.streaks', { food: d.logStreak, training: d.workoutStreak }))),
    d.waterAvgMl > 0 ? card(t('report.water'), `${(d.waterAvgMl / 1000).toFixed(1)} <small>L</small>`, d.targets?.waterMl ? esc(t('report.waterTarget', { l: (d.targets.waterMl / 1000).toFixed(1) })) : '', C.water) : '',
    body.first && body.last && body.first !== body.last
      ? card(t('report.weightChange'), esc(formatWeightDelta(body.last.kg - body.first.kg, s.units ?? 'metric', t)), esc(`${kg(body.first.kg)} → ${kg(body.last.kg)}`), C.primaryDark)
      : body.last
        ? card(t('report.weight'), esc(kg(body.last.kg)), esc(day(new Date(body.last.at))), C.primaryDark)
        : '',
  ]
    .filter(Boolean)
    .join('');

  // Plain-language highlights from the numbers above.
  const notes: string[] = [];
  if (d.food && d.targets) {
    const diff = d.food.avgKcal - d.targets.kcal;
    notes.push(Math.abs(diff) <= d.targets.kcal * 0.05 ? t('report.noteOnTarget') : diff > 0 ? t('report.noteAbove', { n: n(diff) }) : t('report.noteBelow', { n: n(-diff) }));
    notes.push(d.food.avgProtein >= d.targets.protein ? t('report.noteProteinHit') : t('report.noteProteinShort', { n: n(d.targets.protein - d.food.avgProtein) }));
  }
  if (d.training.sessions > 0) notes.push(t('report.noteTraining', { count: d.training.sessions, w: (d.training.sessions / (d.days.length / 7)).toFixed(1) }));
  if (d.training.records > 0) notes.push(t('report.noteRecords', { count: d.training.records }));
  const fatDelta = bodyDelta((w) => w.bodyFatPercent, (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`);
  const muscleDelta = bodyDelta((w) => w.skeletalMuscleMassKg, (v) => formatWeightDelta(v, s.units ?? 'metric', t));
  if (fatDelta) notes.push(t('report.noteFat', { d: fatDelta }));
  if (muscleDelta) notes.push(t('report.noteMuscle', { d: muscleDelta }));

  const bestRows = d.training.best
    .map((b) => `<tr><td>${esc(b.name)}</td><td class="num">${esc(kg(b.kg))} × ${b.reps}</td></tr>`)
    .join('');

  // "≥" only on the nutrient whose total is a known minimum, never the whole row.
  const cell = (x: ReportData['days'][number], k: string, v: number) => (x.kcal || v ? `${x.incomplete.includes(k) ? '≥' : ''}${n(v)}` : '—');
  const dayRows = [...d.days]
    .reverse()
    .filter((x) => x.kcal > 0 || x.waterMl > 0 || x.workouts.length > 0)
    .map(
      (x) =>
        `<tr><td>${esc(day(x.date))}</td><td class="num">${cell(x, 'calories', x.kcal)}</td><td class="num">${cell(x, 'proteinG', x.protein)}</td><td class="num">${cell(x, 'carbsG', x.carbs)}</td><td class="num">${cell(x, 'fatG', x.fat)}</td><td class="num">${x.waterMl ? (x.waterMl / 1000).toFixed(1) : '—'}</td><td>${esc(x.workouts.join('، ').slice(0, 60)) || '—'}</td></tr>`,
    )
    .join('');

  const readingRows = [...body.readings]
    .reverse()
    .map(
      (w) =>
        `<tr><td>${esc(day(new Date(w.at)))} ${new Date(w.at).getFullYear()}</td><td class="num">${esc(kg(w.kg))}</td><td class="num">${w.bodyFatPercent != null ? `${w.bodyFatPercent}%` : '—'}</td><td class="num">${w.skeletalMuscleMassKg != null ? esc(kg(w.skeletalMuscleMassKg)) : '—'}</td><td>${esc(w.source === 'scan' ? (w.reportLabel ?? t('report.scan')) : t('report.manual'))}</td></tr>`,
    )
    .join('');

  const sessionRows = d.sessions
    .map((x) => `<tr><td>${esc(day(x.date))}</td><td>${esc(x.name)}</td><td class="num sets">${esc(x.sets)}</td></tr>`)
    .join('');

  return `<!doctype html>
<html lang="${lang}" dir="${ar ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(t('report.title'))}</title>
<style>
  @page { margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, 'Noto Sans Arabic', 'Geeza Pro', Arial, sans-serif; color: ${C.ink}; background: ${C.bg}; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hero { background: linear-gradient(120deg, ${C.gradStart}, ${C.gradEnd}); color: #fff; border-radius: 18px; padding: 22px 24px; }
  .hero h1 { margin: 0; font-size: 26px; letter-spacing: -0.3px; }
  .hero .sub { opacity: 0.92; margin-top: 4px; font-size: 13px; }
  .brand { font-weight: 800; font-size: 13px; opacity: 0.9; letter-spacing: 0.4px; text-transform: uppercase; }
  h2 { font-size: 16px; margin: 22px 2px 10px; color: ${C.primaryDark}; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
  .card { background: ${C.card}; border-radius: 14px; padding: 14px; box-shadow: 0 1px 3px rgba(58,45,92,0.08); page-break-inside: avoid; }
  .stat .label { font-size: 11px; color: ${C.muted}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
  .stat .value { font-size: 24px; font-weight: 800; margin-top: 4px; }
  .stat small { font-size: 12px; color: ${C.muted}; font-weight: 600; }
  .muted { color: ${C.muted}; } .small { font-size: 11px; } .faint { color: ${C.faint}; }
  .notes { background: ${C.tint}; border-radius: 14px; padding: 12px 16px; margin-top: 12px; }
  .notes li { margin: 4px 0; }
  .donut { display: flex; gap: 18px; align-items: center; }
  .leg { margin: 5px 0; font-size: 13px; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 5px; margin: 0 6px; vertical-align: middle; }
  .two { display: grid; grid-template-columns: 1.4fr 1fr; gap: 10px; }
  .weeks { display: flex; gap: 10px; align-items: flex-end; height: 120px; }
  .wk { flex: 1; text-align: center; }
  .wkbar { height: 70px; background: ${C.tint}; border-radius: 8px; display: flex; align-items: flex-end; overflow: hidden; margin-bottom: 4px; }
  .wkbar div { width: 100%; background: ${C.success}; border-radius: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: start; color: ${C.muted}; font-weight: 700; padding: 6px 6px; border-bottom: 1.5px solid ${C.line}; font-size: 10.5px; text-transform: uppercase; }
  td { padding: 5px 6px; border-bottom: 1px solid ${C.line}; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sets { text-align: start; direction: ltr; color: ${C.muted}; }
  .key { display: flex; gap: 14px; font-size: 11px; color: ${C.muted}; margin-top: 4px; }
  .foot { margin-top: 22px; font-size: 10px; color: ${C.faint}; text-align: center; line-height: 1.5; }
  .appendix { page-break-before: always; }
</style>
</head>
<body>
  <div class="hero">
    <div class="brand">Calgym</div>
    <h1>${esc(t('report.title'))}</h1>
    <div class="sub">${esc(name ? `${name} · ` : '')}${esc(range)} · ${esc(t('report.generated', { date: now.toLocaleDateString(ar ? 'ar' : 'en', { day: 'numeric', month: 'long', year: 'numeric' }) }))}</div>
  </div>

  <div class="grid">${summary}</div>
  ${notes.length ? `<div class="notes"><b>${esc(t('report.highlights'))}</b><ul>${notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}

  ${d.food ? `<h2>${esc(t('report.nutrition'))}</h2>
  <div class="card">${kcalChart(d, t)}
    <div class="key"><span><span class="dot" style="background:${C.primary}"></span>${esc(t('report.caloriesDay'))}</span><span><span class="dot" style="background:${C.warning}"></span>${esc(t('report.overTarget'))}</span><span><span class="dot" style="background:${C.gradEnd}"></span>${esc(t('report.target'))}</span></div>
  </div>
  <div class="card" style="margin-top:10px">${macroDonut(d, t)}</div>` : ''}

  <h2>${esc(t('report.training'))}</h2>
  <div class="two">
    <div class="card"><div class="label muted small"><b>${esc(t('report.sessionsPerWeek'))}</b></div>${weekBars(d, t)}</div>
    <div class="card"><div class="muted small"><b>${esc(t('report.bestLifts'))}</b></div>${bestRows ? `<table><tbody>${bestRows}</tbody></table>` : `<p class="muted">${esc(t('report.noLifts'))}</p>`}</div>
  </div>

  ${body.readings.length ? `<h2>${esc(t('report.body'))}</h2>
  <div class="card">${weightChart(d, s) || `<p class="muted">${esc(t('report.oneReading'))}</p>`}</div>` : ''}

  <div class="appendix">
    <h2>${esc(t('report.dailyLog'))}</h2>
    <div class="card"><table>
      <thead><tr><th>${esc(t('report.date'))}</th><th class="num">${esc(t('common.kcal'))}</th><th class="num">${esc(t('report.proteinShort'))}</th><th class="num">${esc(t('report.carbsShort'))}</th><th class="num">${esc(t('report.fatShort'))}</th><th class="num">${esc(t('report.waterL'))}</th><th>${esc(t('report.training'))}</th></tr></thead>
      <tbody>${dayRows || `<tr><td colspan="7" class="muted">${esc(t('report.nothingLogged'))}</td></tr>`}</tbody>
    </table><div class="small faint" style="margin-top:6px">${esc(t('report.incompleteKey'))}</div></div>

    ${sessionRows ? `<h2>${esc(t('report.sessions'))}</h2><div class="card"><table><thead><tr><th>${esc(t('report.date'))}</th><th>${esc(t('report.exercise'))}</th><th>${esc(t('report.sets'))}</th></tr></thead><tbody>${sessionRows}</tbody></table></div>` : ''}

    ${readingRows ? `<h2>${esc(t('report.readings'))}</h2><div class="card"><table><thead><tr><th>${esc(t('report.date'))}</th><th class="num">${esc(t('report.weight'))}</th><th class="num">${esc(t('report.bodyFat'))}</th><th class="num">${esc(t('report.muscle'))}</th><th>${esc(t('report.source'))}</th></tr></thead><tbody>${readingRows}</tbody></table></div>` : ''}
  </div>

  <div class="foot">${esc(t('report.disclaimer'))}<br/>Calgym · ${esc(now.toISOString().slice(0, 10))}</div>
</body>
</html>`;
}
