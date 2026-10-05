// Overview's week strip (opened from the calendar button) turns whole pages instead of sliding a day per tap,
// and a "Today" button brings you back from any other day (Overview and
// Training).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8099';
const OUT = './qa-out/day-nav';
fs.mkdirSync(OUT, { recursive: true });
const state = {
  language: 'en', account: { name: 'Alex', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 78, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2400, proteinG: 150, carbsG: 260, fatG: 80 },
  schedule: {}, savedSchedules: [], activeScheduleId: null, workouts: [], exercises: [], meals: [], weights: [], recipes: [], mealPlanRecipes: {}, mealPlanSwaps: {},
  shopping: null, water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
};
const long = (d) => d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' });
const daysBack = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state, version: 13 });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
// The strip is folded away under the calendar button since the redesign.
await page.getByRole('button', { name: 'Show the week' }).click();
await page.waitForTimeout(300);

const strip = () => page.evaluate((labels) => labels.filter((l) => document.querySelector(`[aria-label="${l}"]`)), Array.from({ length: 28 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - i); return d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' });
}));
const todayPill = () => page.getByRole('button', { name: 'Back to today' });
const prev = () => page.getByRole('button', { name: 'Previous day' }).first().click();

check('on today there is no Today button', (await todayPill().count()) === 0);
const firstPage = await strip();
check('today\'s page: today and the six days before', firstPage.length === 7 && firstPage.includes(long(daysBack(0))) && firstPage.includes(long(daysBack(6))), firstPage.join(' | '));

await prev();
await page.waitForTimeout(300);
check('one day back: a Today button appears', (await todayPill().count()) === 1);
check('one day back: the row has not moved', JSON.stringify(await strip()) === JSON.stringify(firstPage));

for (let i = 0; i < 6; i++) { await prev(); await page.waitForTimeout(150); }
const secondPage = await strip();
check('seven days back: the previous page', secondPage.includes(long(daysBack(7))) && secondPage.includes(long(daysBack(13))) && !secondPage.includes(long(daysBack(0))), secondPage.join(' | '));
await prev();
await page.waitForTimeout(200);
check('eight days back: still the same page', JSON.stringify(await strip()) === JSON.stringify(secondPage));
await page.screenshot({ path: `${OUT}/overview-back.png` });

await todayPill().click();
await page.waitForTimeout(400);
check('Today brings Overview back to today', (await page.getByText('Today', { exact: true }).count()) > 0 && (await todayPill().count()) === 0);
check('and the strip back to today\'s page', JSON.stringify(await strip()) === JSON.stringify(firstPage));

await page.goto(`${BASE}/training`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await prev();
await page.waitForTimeout(300);
check('Training: a Today button away from today', (await todayPill().count()) === 1);
await page.screenshot({ path: `${OUT}/training-back.png` });
await todayPill().click();
await page.waitForTimeout(400);
check('Training: Today returns and the button goes', (await todayPill().count()) === 0);

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
