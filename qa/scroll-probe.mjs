// Scroll each root tab and capture the compact sticky bar. Usage: node scroll-probe.mjs <outdir> <lang>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const [outDir, lang = 'en'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'http://127.0.0.1:8099';
const today = new Date();
const at = (d, h = 12) => { const x = new Date(today); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const dk = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const ing = (name, amount, kcal) => ({ name, key: name.toLowerCase(), amount, unit: 'g', state: 'raw', calories: kcal, proteinG: 10, carbsG: 20, fatG: 5, aisle: 'pantry' });
const recipe = (id, name) => ({ id, name, servings: 4, createdAt: at(1), language: 'en', source: 'custom', reviewStatus: 'ready', ingredients: [ing('Rice', 400, 1400), ing('Chicken', 600, 660)], steps: ['Cook.'] });
const seg = { leftArm: 3.2, rightArm: 3.3, trunk: 26.1, leftLeg: 9.4, rightLeg: 9.5 };
const state = {
  language: lang, account: { name: 'Alex', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 78.4, activityLevel: 'moderate', goal: 'lose' },
  targets: { calories: 2200, proteinG: 157, carbsG: 229, fatG: 73 },
  schedule: { [today.getDay()]: { title: 'Lower body', exerciseIds: ['builtin:squat', 'builtin:deadlift', 'builtin:lunge'] } }, savedSchedules: [], activeScheduleId: null,
  workouts: [{ id: 'w1', at: at(1, 18), exerciseId: 'builtin:bench-press', exerciseName: 'Barbell Bench Press', type: 'weight_reps', sets: [{ weightKg: 60, reps: 10, done: true }] }], exercises: [],
  meals: [
    { id: 'm1', at: at(0, 8), mealType: 'breakfast', items: [{ name: 'Tuna sandwich', calories: 420, proteinG: 30, carbsG: 45, fatG: 12, portion: '1 sandwich' }] },
    { id: 'm2', at: at(0, 13), mealType: 'lunch', items: [{ name: 'Chicken kabsa', calories: 760, proteinG: 45, carbsG: 90, fatG: 20, portion: '1 plate' }] },
  ],
  weights: [
    { at: at(3, 8), kg: 78.4, bodyFatPercent: 20.6, skeletalMuscleMassKg: 35.2, segmentalLeanMassKg: seg, source: 'scan', reportLabel: 'InBody 270' },
    { at: at(20, 8), kg: 79.3, bodyFatPercent: 21.4, skeletalMuscleMassKg: 34.8, source: 'scan' },
    { at: at(28, 8), kg: 79.5, source: 'manual' },
  ],
  recipes: [recipe('r1', 'Lentil soup'), recipe('r2', 'Chicken kabsa')], mealPlanRecipes: { [dk(today)]: { dinner: { recipeId: 'r1', servings: 1 } } }, mealPlanSwaps: {}, shopping: null,
  water: [{ at: at(0, 9), ml: 500 }], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state, version: 13 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
for (const [name, path] of [['overview', '/'], ['training', '/training'], ['food', '/food'], ['health', '/health']]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/${name}-top.png` });
  // Scroll the page's own scroller (the first scrollable element) by 420px.
  await page.mouse.move(195, 500); await page.mouse.wheel(0, 420);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${name}-scrolled.png` });
  const bar = await page.evaluate(() => {
    const t = document.body.textContent;
    return { hasAI: /AI Support|الدعم الذكي/.test(t) };
  });
  console.log(name, JSON.stringify(bar));
}
await browser.close();
