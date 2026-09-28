// The Notifications screen: one main switch, Food / Water / Training, quiet
// hours, a daily maximum, and a "Coming up" preview planned from the person's
// own logs — in English and Arabic.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8099';
const OUT = './qa-out/notifications';
fs.mkdirSync(OUT, { recursive: true });

const iso = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const state = (language) => ({
  language, account: { name: 'Alex', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 78, activityLevel: 'moderate', goal: 'lose' },
  targets: { calories: 2400, proteinG: 150, carbsG: 260, fatG: 80 },
  schedule: { 0: { title: 'Push', exerciseIds: ['bench-press'] }, 1: { title: 'Pull', exerciseIds: ['barbell-row'] }, 2: { title: 'Legs', exerciseIds: ['squat'] }, 3: { title: 'Push', exerciseIds: ['bench-press'] }, 4: { title: 'Pull', exerciseIds: ['barbell-row'] }, 5: { title: 'Legs', exerciseIds: ['squat'] }, 6: { title: 'Push', exerciseIds: ['bench-press'] } },
  savedSchedules: [], activeScheduleId: null, workouts: [], exercises: [],
  meals: [{ id: 'm1', at: iso(0, 30), items: [{ name: 'Eggs', calories: 300, proteinG: 24, carbsG: 2, fatG: 20, portion: '3' }], mealType: 'breakfast' }],
  weights: [], recipes: [], mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
  remindMeals: true, remindWater: true, remindWorkouts: true, remindersInitialized: true,
});

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const browser = await chromium.launch();
async function open(path, lang = 'en') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 1400 } });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state: state(lang), version: 15 });
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  return { ctx, page };
}
const body = (page) => page.evaluate(() => document.body.innerText);

{
  const { ctx, page } = await open('/notifications');
  const b = await body(page);
  check('one main switch', /Smart reminders, your daily recap and your wins/.test(b));
  check('three areas: Food, Water, Training', ['Food', 'Water', 'Training'].every((x) => b.includes(x)) && /What to hear about/.test(b));
  check('the hints explain the smart behaviour', /Only meals you haven't logged/.test(b) && /quiet once you reach your goal/.test(b));
  check('quiet hours 23:00–07:00 and a daily maximum', /Quiet from[\s\S]*23:00/.test(b) && /Quiet until[\s\S]*07:00/.test(b) && /At most, per day/.test(b));
  check('coming up: planned from the logs', /Coming up/.test(b) && !/Nothing planned right now/.test(b), b.match(/Coming up[\s\S]{0,300}/)?.[0]);
  check('breakfast was logged, so no breakfast reminder is planned for today', !/Today[^\n]*\n[^\n]*(Breakfast not logged|How was Breakfast|Breakfast time)/.test(b));
  await page.screenshot({ path: `${OUT}/settings.png`, fullPage: true });

  await page.getByRole('button', { name: 'Quiet from +1' }).click();
  await page.waitForTimeout(400);
  check('quiet hours can be changed', /Quiet from[\s\S]*00:00/.test(await body(page)));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store')).state.notifyPrefs);
  check('…and are saved', saved?.quietStart === 0, JSON.stringify(saved));

  await page.getByRole('switch', { name: 'Notifications' }).first().click({ force: true });
  await page.waitForTimeout(500);
  const off = await body(page);
  check('main switch off hides the rest', !/What to hear about/.test(off) && !/Coming up/.test(off));
  check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}
{
  const { ctx, page } = await open('/notifications', 'ar');
  const b = await body(page);
  check('Arabic: the areas and timing', ['التغذية', 'الماء', 'التمارين', 'هدوء من', 'القادم'].every((x) => b.includes(x)));
  await page.screenshot({ path: `${OUT}/settings-ar.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
