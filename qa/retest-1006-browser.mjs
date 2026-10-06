// Fixes from the 6 October Android retest, in the exported web app, English
// and Arabic:
//  R01  the Next meal card never says "All meals logged" unless all three are;
//  R03  a weekday that only just got its workout is not offered as missed;
//  L01  a recipe that chills for hours says how long until it is ready;
//  L02  saving a week says it also starts using it;
//  L03  the workout summary shows push-ups as reps, not "0 kg × 10";
//  L04  the recipe screen's back label is a neutral Back.
// (R02, the Android keyboard, and R04, recipe charging, are covered on device
// and in qa/chat-recipe-e2e.mjs.) Needs the web build on :8099.
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:8099';
const SHOTS = process.env.SHOTS ?? '/tmp/retest-1006-shots';
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const western = (s) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٬/g, ',').replace(/٫/g, '.');

// 9 pm today: past dinner time, so the card has no next meal to suggest.
const now = new Date(); now.setHours(21, 0, 0, 0);
const at = (h, back = 0) => { const x = new Date(now); x.setDate(x.getDate() - back); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const food = (lang, name, kcal) => ({ name, portion: '1', calories: kcal, proteinG: 10, carbsG: 10, fatG: 5 });
const meal = (lang, slot, h) => ({ id: `m-${slot}`, at: at(h), mealType: slot, items: [food(lang, `${slot} food`, 300)] });
const BENCH = 'builtin:bench-press';
const PUSH = 'builtin:push-up';
const OATS = {
  id: 'r-oats', name: 'Oats & Yogurt Breakfast Bowl', servings: 2, prepMinutes: 10, cookMinutes: 3, language: 'en', source: 'ai', reviewStatus: 'ready', createdAt: at(8),
  ingredients: [
    { name: 'Rolled oats', key: 'rolled_oats', amount: 80, unit: 'g', state: 'raw', calories: 300, proteinG: 10, carbsG: 54, fatG: 5 },
    { name: 'Greek yogurt', key: 'greek_yogurt', amount: 300, unit: 'g', state: 'raw', calories: 220, proteinG: 30, carbsG: 12, fatG: 6 },
  ],
  steps: ['Mix the oats, yogurt and milk.', 'Cover and refrigerate for at least 4 hours, or overnight.', 'Top with banana and serve.'],
};

const base = (lang, extra = {}) => ({
  language: lang, account: { name: 'Sara', provider: 'guest' }, tutorialSeen: true, tourSeen: true, tourSnoozed: 2, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-03-01', heightCm: 165, weightKg: 70, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2200, proteinG: 120, carbsG: 250, fatG: 70 },
  schedule: {}, savedSchedules: [], activeScheduleId: null, exercises: [], meals: [], weights: [], recipes: [], water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {},
  whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {}, mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, workouts: [], exerciseNotes: [], notifyPrefs: { restAlertAsked: true },
  ...extra,
});

const browser = await chromium.launch();
const open = async (state, path, hour = 21) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((v) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(v)); }, { state, version: 16 });
  const page = await ctx.newPage();
  const time = new Date(now); time.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
  await page.clock.install({ time });
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  return { ctx, page };
};
const text = async (page) => western(await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');

for (const lang of ['en', 'ar']) {
  const ar = lang === 'ar';
  const L = (en, a) => (ar ? a : en);

  // ── R01: the Next meal card at 9 pm ──
  const cases = [
    ['dinner only', ['dinner'], L('Dinner logged', 'سُجّل: العشاء'), L("Breakfast and lunch aren't logged", 'لم يُسجَّل بعد: الفطور والغداء')],
    ['breakfast only', ['breakfast'], L('Breakfast logged', 'سُجّل: الفطور'), L("Lunch and dinner aren't logged", 'لم يُسجَّل بعد: الغداء والعشاء')],
    ['nothing yet', [], L('No meals logged yet', 'لا وجبات مسجّلة بعد'), L("Breakfast, lunch and dinner aren't logged", 'لم يُسجَّل بعد: الفطور، الغداء والعشاء')],
    ['all three', ['breakfast', 'lunch', 'dinner'], L('All meals logged', 'سُجّلت كل الوجبات'), L('Breakfast, lunch and dinner are in', 'الفطور والغداء والعشاء مسجّلة')],
  ];
  for (const [name, slots, title, hint] of cases) {
    // Dinner logged: nothing left to suggest at 9 pm. Otherwise check at
    // 10:30 pm, past dinner time, when the card used to claim all three.
    const late = !slots.includes('dinner');
    const { ctx, page } = await open(base(lang, { meals: slots.map((s) => meal(lang, s, [8, 13, 20][['breakfast', 'lunch', 'dinner'].indexOf(s)])) }), '/', late ? 22.5 : 21);
    const b = await text(page);
    const allClaim = b.includes(L('All meals logged', 'سُجّلت كل الوجبات'));
    check(`${lang} R01 ${name}: "${title}"`, b.includes(title) && b.includes(hint) && (slots.length === 3 || !allClaim), b.match(/(NEXT MEAL|Next meal|الوجبة التالية).{0,160}/i)?.[0]);
    if (name === 'dinner only') {
      check(`${lang} R01 dinner only: offers to log breakfast`, b.includes(L('Log breakfast', 'سجّل الفطور')));
      await page.screenshot({ path: `${SHOTS}/r01-${lang}.png` });
    }
    await ctx.close();
  }

  // ── R03: Sunday push-ups added today; Saturday legs untouched and skipped ──
  {
    const sun = new Date(now); sun.setDate(sun.getDate() - ((sun.getDay() + 7) % 7 || 7));
    const schedule = { 0: { exerciseIds: [PUSH], plans: {} }, 6: { exerciseIds: ['builtin:squat'], plans: {} } };
    const fresh = await open(base(lang, { schedule, scheduleSince: { 0: dayKey(now) } }), '/training');
    let b = await text(fresh.page);
    const sundayLabel = western(sun.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'short' }));
    check(`${lang} R03 Sunday added today is not offered as missed`, !b.includes(sundayLabel), sundayLabel);
    await fresh.page.screenshot({ path: `${SHOTS}/r03-${lang}.png` });
    await fresh.ctx.close();
    const old = await open(base(lang, { schedule }), '/training');
    b = await text(old.page);
    const satDate = new Date(now); satDate.setDate(satDate.getDate() - ((satDate.getDay() + 1) % 7 || 7));
    check(`${lang} R03 a workout that really was missed is still offered`, b.includes(L('Do today', 'أدّه اليوم')) || b.includes(L('Planned for', 'مخطط له في')), b.slice(0, 200));
    await old.ctx.close();
  }

  // ── L01 + L04: the chilled oats recipe ──
  {
    const { ctx, page } = await open(base(lang, { recipes: [OATS] }), `/recipe?id=${OATS.id}`);
    const b = await text(page);
    check(`${lang} L01 "13 min · ready in about 4 h"`, b.includes(L('13 min · ready in about 4 h', '13 دقيقة · جاهزة خلال 4 ساعات تقريباً')) || (b.includes('13') && b.includes(L('ready in about 4 h', 'جاهزة خلال 4 ساعات'))), b.match(/13.{0,60}/)?.[0]);
    const back = await page.getByRole('button', { name: L('Back', 'رجوع'), exact: true }).count();
    check(`${lang} L04 the back label is a neutral Back`, back > 0 && !(await page.getByRole('button', { name: L('Recipes', 'الوصفات'), exact: true }).count()));
    await page.screenshot({ path: `${SHOTS}/l01-${lang}.png` });
    await ctx.close();
  }

  // ── L02: schedules say saving also starts using it ──
  {
    const { ctx, page } = await open(base(lang, { schedule: { 1: { exerciseIds: [BENCH], plans: {} } } }), '/schedules');
    const b = await text(page);
    check(`${lang} L02 "Save and use"`, b.includes(L('Save and use', 'احفظه واستخدمه')) && !b.includes(L('Save this week', 'حفظ هذا الأسبوع')));
    await ctx.close();
  }

  // ── L03: summary with bench on screen and push-ups done ──
  {
    const today = dayKey(now);
    const state = base(lang, {
      schedule: { [now.getDay()]: { exerciseIds: [BENCH, PUSH], plans: {} } },
      workouts: [
        { id: 'w1', at: at(19), exerciseId: BENCH, exerciseName: 'Bench Press', type: 'weight_reps', caloriesBurned: 0, sets: [{ weightKg: 60, reps: 6, done: true }] },
        { id: 'w2', at: at(19), exerciseId: PUSH, exerciseName: 'Push-Up', type: 'bodyweight_reps', caloriesBurned: 0, sets: [{ reps: 10, done: true }] },
      ],
      activeSession: { startedAt: at(19), dayKey: today, exerciseIds: [BENCH, PUSH], index: 0, restEndsAt: null, restSeconds: 90 },
    });
    const { ctx, page } = await open(state, '/session');
    await page.getByText(L('Finish workout', 'إنهاء التمرين'), { exact: true }).last().click();
    await page.waitForTimeout(800);
    const b = await text(page);
    check(`${lang} L03 push-ups read "10 reps", not "0 kg × 10"`, b.includes(`${L('Top set', 'أفضل مجموعة')} 10 ${L('reps', 'تكرار')}`) && !/0 (kg|كغ) × 10/.test(b), b.match(/(Top set|أفضل مجموعة).{0,30}/g)?.join(' | '));
    check(`${lang} L03 bench still reads 60 kg × 6`, /60 (kg|كغ) × 6/.test(b));
    await page.screenshot({ path: `${SHOTS}/l03-${lang}.png` });
    await ctx.close();
  }
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
