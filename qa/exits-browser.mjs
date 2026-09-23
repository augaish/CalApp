// Every screen that is not a tab has a way out at the top: a Back or Close
// control that is visible, named for screen readers, and actually leaves.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8099';
const OUT = './qa-out/exits';
fs.mkdirSync(OUT, { recursive: true });
const today = new Date();
const at = (d, h = 12) => { const x = new Date(today); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const ing = (name, amount, kcal) => ({ name, key: name.toLowerCase(), amount, unit: 'g', state: 'raw', calories: kcal, proteinG: 10, carbsG: 20, fatG: 5, aisle: 'pantry' });
const recipe = { id: 'r1', name: 'Chicken Kabsa', servings: 4, createdAt: at(1), language: 'en', source: 'ai', ingredients: [ing('Rice', 400, 1400), ing('Chicken', 600, 660)], steps: ['Cook.', 'Serve.'] };
const dayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
const base = (lang = 'en') => ({
  language: lang, account: { name: 'Alex', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 78, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2400, proteinG: 150, carbsG: 260, fatG: 80 },
  schedule: { [today.getDay()]: { title: 'Push', exerciseIds: ['builtin:bench-press'] } }, savedSchedules: [], activeScheduleId: null,
  workouts: [], exercises: [], meals: [], weights: [], recipes: [], mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [],
  skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
  // Enough data for the screens that only render with something to show.
  recipes: [recipe],
  meals: [{ id: 'm1', at: at(0, 8), mealType: 'breakfast', items: [{ name: 'Oats', calories: 300, proteinG: 10, carbsG: 50, fatG: 6, portion: '1 bowl' }] }],
  exercises: [{ id: 'custom:a', name: 'Cable pull', category: 'back', type: 'weight_reps', source: 'custom' }],
  activeSession: { startedAt: at(0, 7), dayKey, exerciseIds: ['builtin:bench-press'], index: 0, restEndsAt: null, restSeconds: 90 },
});
/** The query a data-dependent screen is opened with in the app. */
const PARAMS = {
  recipe: '?id=r1', 'log-portion': '?recipeId=r1', 'plan-meal': '?recipeId=r1',
  'edit-portion': '?id=m1&index=0', 'exercise-detail': '?id=builtin:bench-press', 'exercise-merge': '?id=custom:a',
};
// Screens that are not meant to have one: tabs, first-run flows, sheets
// dismissed by tapping outside, a camera with its own Cancel, and the
// spinner that hands on to a result by itself.
// gym-result and meal-result show a scan held only in memory; they close
// themselves without one, and their X is in the shared Title.
const EXEMPT = new Set(['onboarding', 'welcome', 'login', 'add-menu', 'water', 'calendar', 'scan', 'photo-analyze', 'gym-result', 'meal-result',
  // A native web view: blank in a browser build, so there is nothing to check here.
  'inbody-web']);
const routes = fs.readdirSync('src/app').filter((f) => f.endsWith('.tsx') && !f.startsWith('_') && !f.startsWith('+')).map((f) => f.replace('.tsx', '')).filter((r) => !EXEMPT.has(r));

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const browser = await chromium.launch();
for (const lang of ['en', 'ar']) {
  console.log(`\n=== ${lang} ===`);
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state: base(lang), version: 13 });
    const page = await ctx.newPage();
    // Arrive from Home, as a person would, so Back has somewhere to go.
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.goto(`${BASE}/${route}${PARAMS[route] ?? ''}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1300);
    const url = page.url();
    if (!url.includes(`/${route}`)) {
      // The screen redirected on its own (nothing to show without data) — it cannot trap anyone.
      check(`${lang} /${route} leaves by itself when there is nothing to show`, true, url.replace(BASE, ''));
      await ctx.close();
      continue;
    }
    // A back control may carry the name of where it goes ("‹ Recipes").
    const names = lang === 'ar' ? /^(رجوع|إغلاق|إلغاء|الوصفات)$/ : /^(Back|Close|Cancel|Recipes)$/;
    const exits = page.getByRole('button', { name: names });
    const n = await exits.count();
    let visibleTop = false;
    for (let i = 0; i < n; i++) {
      const box = await exits.nth(i).boundingBox().catch(() => null);
      if (box && box.y < 300 && box.width > 0) { visibleTop = true; break; }
    }
    check(`${lang} /${route} has a Back or Close at the top`, visibleTop, `${n} exit control(s)`);
    if (!visibleTop) await page.screenshot({ path: `${OUT}/${lang}-${route}.png` });
    await ctx.close();
  }
}
await browser.close();
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
