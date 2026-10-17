// Weekly schedule → "Move Monday to another day": to a rest day it moves, to
// a training day they swap, Undo puts it back; Arabic reads the same.
// Needs the web build on :8099 (qa/serve.mjs).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:8099';
const SHOTS = process.env.SHOTS ?? '/tmp/move-day-shots';
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const week = {
  1: { title: 'Push', exerciseIds: ['builtin:bench-press', 'builtin:shoulder-press'], plans: {} },
  3: { title: 'Pull', exerciseIds: ['builtin:lat-pulldown'], plans: {} },
  5: { title: 'Legs', exerciseIds: ['builtin:squat'], plans: {} },
};
const state = (language) => ({
  language, account: { name: 'Sara', provider: 'guest' }, tutorialSeen: true, tourSeen: true, tourSnoozed: 2, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-03-01', heightCm: 165, weightKg: 70, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2200, proteinG: 120, carbsG: 250, fatG: 70 },
  schedule: week, savedSchedules: [], activeScheduleId: null, exercises: [], meals: [], weights: [], recipes: [], water: [], workouts: [], fastingHistory: [], skips: {}, dayOrder: {}, dayExtras: {}, occurrences: {},
  coachMessages: [], notifyPrefs: { restAlertAsked: true }, membershipPrompt: { firstSeenAt: new Date().toISOString(), introShown: true, lastShownAt: new Date().toISOString() },
});
const browser = await chromium.launch();
const open = async (lang) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((v) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(v)); }, { state: state(lang), version: 16 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/schedule?weekday=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  return { ctx, page };
};
const sched = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store')).state.schedule);
const titles = (s) => [0, 1, 2, 3, 4, 5, 6].map((d) => s[d]?.title ?? '-').join(' ');

let { ctx, page } = await open('en');
await page.getByText('Move Monday to another day', { exact: true }).click();
await page.waitForTimeout(500);
let b = await page.evaluate(() => document.body.innerText);
check('sheet: Move Push to… with the week', b.includes('Move Push to…') && b.includes('Every week, from now on') && b.includes('Now'));
await page.getByLabel('Sunday: Rest', { exact: true }).click();
await page.waitForTimeout(300);
b = await page.evaluate(() => document.body.innerText);
check('picking a rest day explains a move', b.includes('Push moves to Sunday. Monday becomes a rest day.') && b.includes('Move to Sunday'));
await page.screenshot({ path: `${SHOTS}-pick.png` });
await page.getByText('Move to Sunday', { exact: true }).click();
await page.waitForTimeout(600);
let s = await sched(page);
check('moved: Push on Sunday, Monday rest', titles(s) === 'Push - - Pull - Legs -', titles(s));
b = await page.evaluate(() => document.body.innerText);
check('editor follows to Sunday with an Undo bar', b.includes('Exercises · Sunday') && b.includes('Push moved to Sunday') && b.includes('Undo'));
await page.screenshot({ path: `${SHOTS}-moved.png` });
await page.getByText('Undo', { exact: true }).click();
await page.waitForTimeout(500);
s = await sched(page);
check('Undo puts it back', titles(s) === '- Push - Pull - Legs -', titles(s));

// Swap with Wednesday
await page.getByText('Move Monday to another day', { exact: true }).click();
await page.waitForTimeout(400);
await page.getByLabel('Wednesday: Pull', { exact: true }).click();
await page.waitForTimeout(300);
b = await page.evaluate(() => document.body.innerText);
check('picking a training day explains a swap', b.includes('Wednesday already has Pull, so the two swap') && b.includes('Swap Monday and Wednesday'));
await page.getByText('Swap Monday and Wednesday', { exact: true }).click();
await page.waitForTimeout(600);
s = await sched(page);
check('swapped: Pull Monday, Push Wednesday', titles(s) === '- Pull - Push - Legs -', titles(s));
b = await page.evaluate(() => document.body.innerText);
check('Undo bar says swapped', b.includes('Monday and Wednesday swapped'));
await ctx.close();

// Rest day: no move row
({ ctx, page } = await open('en'));
await page.getByText('Tue', { exact: true }).click();
await page.waitForTimeout(300);
b = await page.evaluate(() => document.body.innerText);
check('a rest day has no move row', !b.includes('to another day'));
await ctx.close();

// Arabic
({ ctx, page } = await open('ar'));
b = await page.evaluate(() => document.body.innerText);
check('Arabic: the row', b.includes('نقل الاثنين إلى يوم آخر'));
await page.getByText('نقل الاثنين إلى يوم آخر', { exact: true }).click();
await page.waitForTimeout(400);
await page.getByLabel('الأحد: راحة', { exact: true }).click();
await page.waitForTimeout(300);
b = await page.evaluate(() => document.body.innerText);
check('Arabic: sheet and button', b.includes('نقل «Push» إلى…') && b.includes('نقل إلى الأحد'));
await page.screenshot({ path: `${SHOTS}-ar.png` });
await ctx.close();

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
