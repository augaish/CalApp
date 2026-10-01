// Appearance: Light by default; System / Light / Dark from Profile → Settings, and the palette follows.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:8099';
const state = (appearance) => ({
  language: 'en', account: { name: 'A', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', focusAreas: ['food'],
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 78, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2400, proteinG: 150, carbsG: 260, fatG: 80 }, schedule: {}, savedSchedules: [], activeScheduleId: null, workouts: [], exercises: [], meals: [], weights: [],
  recipes: [], mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {}, activeSession: null,
  ...(appearance ? { appearance } : {}),
});
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const browser = await chromium.launch();
// The page background under the header: the app's own background colour.
const pageBg = (page) => page.evaluate(() => {
  // The colour a person sees in empty space mid-screen, below the header.
  let el = document.elementFromPoint(6, 600);
  while (el && getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)') el = el.parentElement;
  return el ? getComputedStyle(el).backgroundColor : null;
});
async function open(appearance, scheme, path = '/food') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state: state(appearance), version: 13 });
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' }); await page.waitForTimeout(1800);
  return { ctx, page };
}
const LIGHT = 'rgb(245, 243, 250)';
const DARK = 'rgb(20, 16, 33)';
let { ctx, page } = await open(undefined, 'light');
check('an existing store (no setting) on a light phone stays light', (await pageBg(page)) === LIGHT, await pageBg(page));
await ctx.close();
({ ctx, page } = await open(undefined, 'dark'));
check('no choice made: light, even on a dark phone', (await pageBg(page)) === LIGHT, await pageBg(page));
await ctx.close();
({ ctx, page } = await open('system', 'dark'));
check('on System, a dark phone gets the dark palette', (await pageBg(page)) === DARK, await pageBg(page));
await ctx.close();
{
  // Signed out, first launch, on a dark phone: the login screen is light.
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto(`${BASE}/`, { waitUntil: 'load' }); await p.waitForTimeout(1800);
  const bg = await p.evaluate(() => { let el = document.elementFromPoint(6, 780); while (el && getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)') el = el.parentElement; return el ? getComputedStyle(el).backgroundColor : null; });
  check('the login screen is light on a dark phone', bg === LIGHT, String(bg));
  await c.close();
}
({ ctx, page } = await open('light', 'dark'));
check('Light pinned stays light on a dark phone', (await pageBg(page)) === LIGHT, await pageBg(page));
await ctx.close();
({ ctx, page } = await open('dark', 'light', '/settings'));
check('Dark pinned is dark on a light phone', (await pageBg(page)) === DARK, await pageBg(page));
const b = (await page.textContent('body')).replace(/\s+/g, ' ');
check('Settings shows the Appearance setting with its value', /Appearance\s*Dark/.test(b));
check('no page errors', page.errors.length === 0, page.errors.join(' | '));
await ctx.close();
await browser.close();
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
