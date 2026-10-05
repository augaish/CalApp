// The test-report fixes (5 October), in the exported web app:
// F01 a recipe with unknown protein says so, never "0 g"; F02 the weekly
// review's protein average is "at least" when some food had no protein
// value; F03 the Training edit button says it edits the weekly schedule;
// F04 Arabic: the AI Support button is an icon so the title fits, arrows
// point the Arabic way, numbers use Arabic-Indic digits, plurals are right;
// and the usage bar is empty at 0.
// Needs the web build on :8099 and the API on :8787. Screenshots: SHOTS.
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:8099';
const SHOTS = process.env.SHOTS ?? '/tmp/fixes-shots';
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };

const today = new Date();
const at = (d, h = 12) => { const x = new Date(today); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const item = (name, calories, proteinG, extra = {}) => ({ name, calories, proteinG, carbsG: 20, fatG: 10, portion: '1 plate', ...extra });
const BENCH = 'builtin:bench-press';
const state = (language) => ({
  language, account: { name: 'Sara', provider: 'guest' }, aiConsent: 'granted', tutorialSeen: true, tourSeen: true, tourSnoozed: 2, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-03-01', heightCm: 165, weightKg: 70, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2525, proteinG: 120, carbsG: 322, fatG: 84 },
  schedule: { [today.getDay()]: { title: 'Push', exerciseIds: [BENCH], plans: { [BENCH]: [{ reps: 10 }, { reps: 10 }] } } },
  savedSchedules: [], activeScheduleId: null, exercises: [], weights: [], water: [], coachMessages: [], fastingHistory: [],
  skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {}, mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null,
  workouts: [{ id: 'w1', at: at(0, 7), exerciseId: BENCH, exerciseName: 'Bench Press', type: 'weight_reps', caloriesBurned: 29, sets: [{ weightKg: 60, reps: 10, done: true }, { weightKg: 60, reps: 10, done: true }] }],
  meals: [
    { id: 'm1', at: at(0, 13), mealType: 'lunch', items: [item('Chicken Kabsa', 664, 32)] },
    // A recipe logged with its protein unknown: the week's protein is a lower bound.
    { id: 'm2', at: at(1, 13), mealType: 'lunch', items: [item('QA soup', 200, 0, { nutritionIncomplete: true, incompleteNutrients: ['proteinG', 'carbsG', 'fatG'] })] },
  ],
  recipes: [{ id: 'r-qa', name: 'QA soup', servings: 2, language: 'en', source: 'custom', createdAt: at(2), steps: ['Boil'],
    ingredients: [{ name: 'Test broth', key: 'broth', amount: 200, unit: 'g', calories: 400, proteinG: 0, carbsG: 0, fatG: 0, macrosUnknown: true, unknownNutrients: ['proteinG', 'carbsG', 'fatG'] }] }],
});

const browser = await chromium.launch();
const open = async (lang, path) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: lang === 'ar' ? 'ar' : 'en-US' });
  await ctx.addInitScript((v) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(v)); }, { state: state(lang), version: 16 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  return { ctx, page };
};
const text = (page) => page.evaluate(() => document.body.innerText);
const go = async (page, path) => { await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1300); };

// ── English ──
let { ctx, page } = await open('en', '/recipes');
let b = await text(page);
check('F01 recipe card: "protein unknown", not "0g protein"', /QA soup[\s\S]*200 kcal · protein unknown/.test(b) && !/0g protein/.test(b), b.match(/QA soup[^\n]*\n[^\n]*\n[^\n]*/)?.[0]);
await page.screenshot({ path: `${SHOTS}/f01-recipes.png` });
await go(page, '/review');
b = await text(page);
check('F02 weekly review: protein marked as a lower bound', /at least \d+ g protein/.test(b), b.match(/[^\n]*protein[^\n]*/i)?.[0]);
await page.screenshot({ path: `${SHOTS}/f02-review.png` });
await go(page, '/training');
b = await text(page);
const day = today.toLocaleDateString('en-US', { weekday: 'long' });
check('F03 "Edit weekly schedule" with the weekday it changes', /Edit weekly schedule/.test(b) && new RegExp(`Changes apply to every ${day}`).test(b) && !/Edit today's plan/.test(b));
await page.screenshot({ path: `${SHOTS}/f03-training.png` });
await go(page, '/profile');
const fills = await page.$$eval('[role="progressbar"]', (els) => els.map((e) => e.children.length));
check('usage bar empty at 0 (no fill drawn)', fills.length > 0 && fills.every((n) => n === 0), JSON.stringify(fills));
await ctx.close();

// ── Arabic ──
({ ctx, page } = await open('ar', '/food'));
b = await text(page);
check('Food in Arabic: no Western digits anywhere', !/[0-9]/.test(b), (b.match(/[^\n]*[0-9][^\n]*/g) ?? []).slice(0, 4).join(' | '));
check('…and Arabic-Indic numbers shown', /٦٦٤/.test(b) && /٢٬٥٢٥/.test(b));
const aiLabel = await page.getByRole('button', { name: 'الدعم الذكي' }).first().innerText().catch(() => 'missing');
check('AI Support is icon-only in Arabic (same name for screen readers)', aiLabel.trim() === '' || !/الدعم/.test(aiLabel), JSON.stringify(aiLabel));
await page.screenshot({ path: `${SHOTS}/f04-food-ar.png` });
await go(page, '/training');
b = await text(page);
check('Arabic plural: مجموعتان, not "2 مجموعة"', /مجموعتان/.test(b) && !/2 مجموعة|٢ مجموعة/.test(b), b.match(/[^\n]*مجموع[^\n]*/)?.[0]);
check('Arabic edit button wording', /تعديل الجدول الأسبوعي/.test(b) && /تنطبق التغييرات على كل/.test(b));
await page.screenshot({ path: `${SHOTS}/f04-training-ar.png` });
await go(page, '/profile');
// Ionicons glyphs: U+F229 is chevron-back, U+F23B chevron-forward.
const back = await page.getByRole('button', { name: /رجوع/ }).first().evaluate((el) => [...el.innerText].map((c) => c.codePointAt(0).toString(16)).join(','));
check('Arabic back button points right (→)', back.includes('f23b') && !back.includes('f229'), back);
const rowChevrons = await page.evaluate(() => [...document.querySelectorAll('div')].map((d) => d.innerText).filter((s) => s.length === 1 && (s.codePointAt(0) === 0xf229 || s.codePointAt(0) === 0xf23b)).map((s) => s.codePointAt(0).toString(16)));
// Every chevron but the back button's is a row's "open": it points left.
check('row chevrons point left (←) in Arabic', rowChevrons.filter((c) => c === 'f229').length >= 4 && rowChevrons.filter((c) => c === 'f23b').length === 1, rowChevrons.join());
await page.screenshot({ path: `${SHOTS}/f04-profile-ar.png` });
await ctx.close();

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
