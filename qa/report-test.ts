// The PDF report (src/lib/report.ts): what it computes from sample data, the
// wording in both languages, and a rendered PDF + page images for a look
// (qa-out/report/). Run with the storage shim, e.g.
//   server/node_modules/.bin/tsx --import <shim> qa/report-test.ts
import i18next from 'i18next';
import { en } from '../src/lib/locales/en';
import { ar } from '../src/lib/locales/ar';
import { buildReportHtml, reportData } from '../src/lib/report';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

const now = new Date(2026, 8, 29, 20, 0);
const at = (daysAgo: number, h = 12) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const meals = Array.from({ length: 26 }, (_, i) => ({
  id: `m${i}`, at: at(i, 13), mealType: 'lunch' as const,
  items: [{ name: 'Chicken kabsa', calories: 1650 + ((i * 97) % 500), proteinG: 120 + ((i * 13) % 40), carbsG: 170, fatG: 55, ...(i === 3 ? { nutritionIncomplete: true, incompleteNutrients: ['proteinG' as const] } : {}) }],
}));
const w = (id: string, daysAgo: number, ex: string, name: string, sets: [number, number][]) => ({ id, at: at(daysAgo, 18), exerciseId: `builtin:${ex}`, exerciseName: name, type: 'weight_reps' as const, sets: sets.map(([kg, reps]) => ({ weightKg: kg, reps, done: true })) });
const workouts = [
  w('a', 40, 'bench-press', 'Bench', [[70, 8]]),
  w('b', 1, 'bench-press', 'Bench', [[75, 8], [75, 7]]),
  w('c', 3, 'squat', 'Squat', [[100, 6], [105, 5]]),
  w('d', 8, 'lat-pulldown', 'Pulldown', [[60, 10]]),
  w('e', 15, 'bench-press', 'Bench', [[72.5, 8]]),
];
const weights = Array.from({ length: 6 }, (_, i) => ({ at: at(50 - i * 10, 7), kg: +(86 - i * 0.7).toFixed(1), bodyFatPercent: +(24 - i * 0.4).toFixed(1), skeletalMuscleMassKg: +(35 + i * 0.1).toFixed(1), source: (i === 5 ? 'scan' : 'manual') as 'scan' | 'manual', reportLabel: i === 5 ? 'InBody270' : undefined }));
const state = {
  account: { name: 'Sara', provider: 'apple' as const },
  profile: { sex: 'female' as const, birthDate: '1993-04-12', heightCm: 168, weightKg: 82.5, activityLevel: 'moderate' as const, goal: 'lose' as const },
  targets: { calories: 1900, proteinG: 150, carbsG: 180, fatG: 60 },
  meals, workouts, exercises: [], weights, water: [{ at: at(0, 9), ml: 1500 }, { at: at(1, 9), ml: 2300 }],
  units: 'metric' as const, whoopBurnByDay: {}, whoopWorkoutsByDay: {},
};

const d = reportData(state as never, 'en', now);
check('30 days, oldest first, ending today', d.days.length === 30 && d.days[29].date.getDate() === 29);
check('food: 26 logged days averaged', d.food?.loggedDays === 26, JSON.stringify(d.food));
check('training: 4 workout days in the 30, the one 40 days ago left out', d.training.sessions === 4, String(d.training.sessions));
check('best lifts ranked, squat 105×5 first', d.training.best[0]?.kg === 105, JSON.stringify(d.training.best));
check('a record: bench beat its pre-period best', d.training.records === 1, String(d.training.records));
check('body readings oldest → newest', d.body.first?.kg === 86 && d.body.last?.kg === 82.5);
check('a day with unknown protein marks protein only, not calories', d.days.some((x) => x.incomplete.length === 1 && x.incomplete[0] === 'proteinG'));

await i18next.init({ resources: { en: { translation: en }, ar: { translation: ar } }, lng: 'en', interpolation: { escapeValue: false } });
for (const lang of ['en', 'ar'] as const) {
  const t = i18next.getFixedT(lang);
  const html = buildReportHtml(state as never, t as never, lang, now);
  check(`${lang}: no missing wording`, !/report\.|export\.|common\./.test(html.replace(/<style[\s\S]*?<\/style>/, '')), (html.match(/(report|export|common)\.[a-zA-Z]+/) ?? [''])[0]);
  check(`${lang}: direction`, lang === 'ar' ? html.includes('dir="rtl"') : html.includes('dir="ltr"'));
  check(`${lang}: charts drawn`, (html.match(/<svg/g) ?? []).length >= 3);
  check(`${lang}: user text is escaped`, !buildReportHtml({ ...state, account: { name: '<b>x</b>', provider: 'apple' } } as never, t as never, lang, now).includes('<b>x</b>'));
  // A real PDF and page images, for a look.
  const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs' as string);
  const fs = await import('node:fs');
  fs.mkdirSync('qa-out/report', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.pdf({ path: `qa-out/report/report-${lang}.pdf`, format: 'A4', printBackground: true });
  await page.screenshot({ path: `qa-out/report/report-${lang}.png`, fullPage: true });
  await browser.close();
  check(`${lang}: PDF written`, fs.statSync(`qa-out/report/report-${lang}.pdf`).size > 20_000);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
