// Usage: node shot.mjs <outdir> <lang> <route> [route...]   (route may be "name=/path")
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const [outDir, lang, ...routes] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'http://127.0.0.1:8099';
const today = new Date();
const at = (d, h = 12) => { const x = new Date(today); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const ing = (name, amount, kcal, extra = {}) => ({ name, key: name.toLowerCase().replace(/\s+/g, '_'), amount, unit: 'g', state: 'raw', calories: kcal, proteinG: 10, carbsG: 20, fatG: 5, aisle: 'pantry', ...extra });
const recipe = (id, name, over = {}) => ({ id, name, servings: 4, createdAt: at(1), language: 'en', source: 'ai', reviewStatus: 'ready', ingredients: [ing('Red lentils', 320, 1100), ing('Tomatoes', 400, 72), ing('Onion', 160, 64), ing('Olive oil', 40, 354)], steps: ['Rinse the lentils.', 'Soften the onion, then add tomatoes.', 'Add lentils and water; simmer until tender.'], prepMinutes: 25, ...over });
const gymPlan = (n) => Array.from({ length: 3 }, () => ({ weightKg: 60, reps: n }));
const gymDays = {
  [(today.getDay() + 6) % 7]: { title: 'Lower body', exerciseIds: ['builtin:squat', 'builtin:deadlift', 'builtin:lunge', 'builtin:seated-calf-raise'] },
  [today.getDay()]: { title: 'Upper body', exerciseIds: ['builtin:bench-press', 'builtin:seated-row', 'builtin:shoulder-press', 'builtin:lat-pulldown', 'builtin:tricep-pushdown'], plans: { 'builtin:bench-press': gymPlan(10), 'builtin:seated-row': gymPlan(10), 'builtin:shoulder-press': gymPlan(10), 'builtin:lat-pulldown': gymPlan(10), 'builtin:tricep-pushdown': gymPlan(12) } },
  [(today.getDay() + 2) % 7]: { title: 'Core', exerciseIds: ['builtin:plank', 'builtin:crunch', 'builtin:bird-dog'] },
  [(today.getDay() + 4) % 7]: { title: 'Cardio', exerciseIds: ['builtin:treadmill', 'builtin:cycling'] },
};
const seedFile = process.env.SEED; // optional JSON override
const base = seedFile ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : {
  language: lang, account: process.env.NOACCOUNT ? null : { name: 'Alex', provider: 'guest' }, units: process.env.UNITS || 'metric', focusAreas: ['food', 'training'], tutorialSeen: true, tourSeen: true, checklistDismissed: true,
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 74.8, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2000, proteinG: 120, carbsG: 245, fatG: 60 },
  schedule: gymDays,
  savedSchedules: [
    { id: 'sched:gym', name: 'Gym', days: gymDays, createdAt: at(30), activatedAt: at(2) },
    { id: 'sched:home', name: 'Home', days: { [(today.getDay() + 6) % 7]: { title: 'Strength', exerciseIds: ['builtin:push-up', 'builtin:squat', 'builtin:plank'] }, [today.getDay()]: { title: 'Full body', exerciseIds: ['builtin:push-up', 'builtin:squat', 'builtin:lunge', 'builtin:plank', 'builtin:crunch'] }, [(today.getDay() + 2) % 7]: { title: 'Mobility', exerciseIds: ['builtin:cat-cow', 'builtin:bird-dog', 'builtin:plank', 'builtin:one-leg-stretch'] } }, createdAt: at(20) },
    { id: 'sched:travel', name: 'Travel', days: { [(today.getDay() + 1) % 7]: { exerciseIds: ['builtin:push-up', 'builtin:squat'] }, [(today.getDay() + 4) % 7]: { exerciseIds: ['builtin:plank', 'builtin:lunge'] } }, createdAt: at(10) },
  ], activeScheduleId: 'sched:gym',
  workouts: [
    { id: 'w1', at: at(2, 18), exerciseId: 'builtin:bench-press', exerciseName: 'Barbell Bench Press', type: 'weight_reps', sets: [{ weightKg: 60, reps: 10, done: true }] },
    { id: 'w2', at: at(1, 18), exerciseId: 'builtin:bench-press', exerciseName: 'Barbell Bench Press', type: 'weight_reps', sets: [{ weightKg: 70, reps: 8, done: true }, { weightKg: 55, reps: 10, done: true }] },
    { id: 'w3', at: at(1, 18), exerciseId: 'builtin:seated-row', exerciseName: 'Seated Cable Row', type: 'weight_reps', sets: [{ weightKg: 45, reps: 10, done: true }, { weightKg: 45, reps: 10, done: true }] },
    ...(process.env.SESSION ? [{ id: 'w4', at: at(0, 17), exerciseId: 'builtin:bench-press', exerciseName: 'Barbell Bench Press', type: 'weight_reps', sets: [{ weightKg: 60, reps: 10, done: true }] }] : []),
  ], exercises: [],
  coachMessages: process.env.COACH ? [
    { role: 'user', content: lang === 'ar' ? 'ماذا يمكنني أن أطبخ بالعدس؟' : 'What can I make with lentils?', at: at(0, 9), focus: 'food' },
    { role: 'assistant', content: lang === 'ar' ? 'جرّب شوربة العدس. يمكنك مراجعة المكونات والحصص قبل الحفظ.' : 'Try a lentil stew. You can review ingredients and portions before saving.', at: at(0, 9) },
    { role: 'user', content: lang === 'ar' ? 'اقترح لي جدول ثلاثة أيام' : 'Suggest a three-day schedule', at: at(0, 9), focus: 'training' },
    { role: 'assistant', content: lang === 'ar' ? 'هذه مسودة لثلاثة أيام.' : 'Here is a three-day draft.', at: at(0, 9), schedulePlan: { summary: lang === 'ar' ? 'دفع / سحب / أرجل، ثلاثة أيام في الأسبوع' : 'Push / pull / legs, three days a week', days: [ { weekday: 1, title: 'Push', exercises: [{ name: 'Barbell Bench Press', sets: 3, reps: 8 }, { name: 'Shoulder Press', sets: 3, reps: 10 }] }, { weekday: 3, title: 'Pull', exercises: [{ name: 'Lat Pulldown', sets: 3, reps: 10 }, { name: 'Seated Row', sets: 3, reps: 10 }] }, { weekday: 5, title: 'Legs', exercises: [{ name: 'Squat', sets: 4, reps: 8 }, { name: 'Lunge', sets: 3, reps: 12 }] } ] } },
  ] : [],
  activeSession: process.env.SESSION ? { startedAt: at(0, 17), dayKey: `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`, exerciseIds: ['builtin:bench-press', 'builtin:seated-row', 'builtin:shoulder-press', 'builtin:lat-pulldown', 'builtin:tricep-pushdown'], index: 0, restEndsAt: null, restSeconds: 90 } : null,
  meals: [
    { id: 'm1', at: at(0, 8), mealType: 'breakfast', items: [{ name: 'Yogurt & fruit bowl', calories: 520, proteinG: 30, carbsG: 60, fatG: 12, portion: '1 bowl' }] },
    { id: 'm2', at: at(0, 15), mealType: 'snack', items: [{ name: 'Tuna sandwich', calories: 340, proteinG: 30, carbsG: 50, fatG: 8, portion: '1 sandwich' }] },
  ],
  water: [{ at: at(0, 9), ml: 500 }, { at: at(0, 11), ml: 700 }],
  weights: [{ at: at(0, 8), kg: 74.8, source: 'manual' }, { at: at(7, 8), kg: 75.4, source: 'manual' }, { at: at(14, 8), kg: 75.0, source: 'manual' }, { at: at(21, 8), kg: 76.1, source: 'manual' }, { at: at(28, 8), kg: 76.3, source: 'manual' }],
  recipes: [recipe('r1', 'Home-style lentil stew'), recipe('r2', 'Chicken kabsa', { source: 'custom', favorite: true, ingredients: [ing('Basmati rice', 400, 1400), ing('Chicken', 600, 660)] }), recipe('r3', 'Egg & labneh wrap', { servings: 1, source: 'ai', reviewStatus: 'needs_review', ingredients: [ing('Eggs', 100, 155), ing('Labneh', 60, 100)] })],
  mealPlanSwaps: {}, mealPlanRecipes: {}, shopping: null, fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {},
};
const browser = await chromium.launch();
for (const r of routes) {
  const eq = r.indexOf('='); const [name, path] = eq > 0 ? [r.slice(0, eq), r.slice(eq + 1)] : [r.replace(/[^a-z0-9]+/gi, '_') || 'root', r];
  const ctx = await browser.newContext({ viewport: { width: 390, height: Number(process.env.SHOT_H || 1400) }, deviceScaleFactor: 2 });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state: base, version: 13 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${outDir}/${name}-${lang}.png`, fullPage: true });
  console.log(`${name}-${lang}.png`, errs.length ? 'ERRORS: ' + errs.join(' | ') : 'ok');
  await ctx.close();
}
await browser.close();
