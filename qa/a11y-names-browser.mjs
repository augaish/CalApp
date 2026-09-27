// Every control a finger can tap can also be found and named by a screen
// reader: it says it is a button (or link, tab…), and it has a name —
// its visible text, or a label when it is only an icon.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8099';
const today = new Date();
const at = (d, h = 12) => { const x = new Date(today); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const dayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
const ing = (name, amount, kcal) => ({ name, key: name.toLowerCase(), amount, unit: 'g', state: 'raw', calories: kcal, proteinG: 10, carbsG: 20, fatG: 5, aisle: 'pantry' });
const base = (lang) => ({
  language: lang, account: { name: 'Alex', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 78, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2400, proteinG: 150, carbsG: 260, fatG: 80 },
  schedule: { [today.getDay()]: { title: 'Push', exerciseIds: ['builtin:bench-press', 'builtin:squat'] } }, savedSchedules: [], activeScheduleId: null,
  workouts: [{ id: 'w1', at: at(2), exerciseId: 'builtin:bench-press', exerciseName: 'Bench', type: 'weight_reps', caloriesBurned: 0, sets: [{ weightKg: 60, reps: 8, done: true }] }],
  exercises: [{ id: 'custom:a', name: 'Cable pull', category: 'back', type: 'weight_reps', source: 'custom' }],
  meals: [{ id: 'm1', at: at(0, 8), mealType: 'breakfast', items: [{ name: 'Oats', calories: 300, proteinG: 10, carbsG: 50, fatG: 6, portion: '1 bowl' }] }],
  weights: [{ at: at(1, 8), kg: 78, source: 'manual' }],
  recipes: [{ id: 'r1', name: 'Chicken Kabsa', servings: 4, createdAt: at(1), language: 'en', source: 'ai', ingredients: [ing('Rice', 400, 1400), ing('Chicken', 600, 660)], steps: ['Cook.', 'Serve.'] }],
  mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
  activeSession: { startedAt: at(0, 7), dayKey, exerciseIds: ['builtin:bench-press'], index: 0, restEndsAt: null, restSeconds: 90 },
});
const PARAMS = { recipe: '?id=r1', 'log-portion': '?recipeId=r1', 'plan-meal': '?recipeId=r1', 'edit-portion': '?id=m1&index=0', 'exercise-detail': '?id=builtin:bench-press', 'exercise-merge': '?id=custom:a', 'meal-edit': '?id=m1' };
const SKIP = new Set(['onboarding', 'welcome', 'login', 'scan', 'photo-analyze', 'gym-result', 'meal-result', 'inbody-web']);
const routes = ['/', '/food', '/training', '/health',
  ...fs.readdirSync('src/app').filter((f) => f.endsWith('.tsx') && !f.startsWith('_') && !f.startsWith('+')).map((f) => f.replace('.tsx', '')).filter((r) => !SKIP.has(r)).map((r) => `/${r}`)];

let fails = 0;
const browser = await chromium.launch();
for (const lang of ['en', 'ar']) {
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state: base(lang), version: 13 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}${route}${PARAMS[route.slice(1)] ?? ''}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const problems = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('[tabindex="0"], [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"]')) {
        if (el.closest('[aria-hidden="true"]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') continue;
        const role = el.getAttribute('role');
        const name = (el.getAttribute('aria-label') || el.innerText || '').trim();
        const icon = /^[-\s]*$/.test(name);
        if (!role) out.push(`no role: "${name.slice(0, 40)}"`);
        else if (!name || icon) out.push(`no name: ${role} at ${Math.round(r.x)},${Math.round(r.y)} ${el.innerHTML.includes('svg') ? '(svg)' : ''}`);
      }
      return [...new Set(out)];
    });
    if (problems.length) { fails += problems.length; console.log(`FAIL  ${lang} ${route}: ${problems.slice(0, 6).join(' | ')}${problems.length > 6 ? ` (+${problems.length - 6})` : ''}`); }
    else console.log(`PASS  ${lang} ${route}`);
    await ctx.close();
  }
}
await browser.close();
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} unnamed or role-less controls`);
process.exit(fails === 0 ? 0 : 1);
