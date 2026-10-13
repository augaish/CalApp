// "Do another day's workout" in the exported web app, English and Arabic:
// pick a day, swap (just this week / update the schedule / new schedule),
// just replace today, undo, a missed day's Do today, a rest day, and the
// workout summary asking whether to keep an exercise that was added.
// Needs the web build on :8099 (the API is not needed).
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:8099';
const SHOTS = process.env.SHOTS ?? '/tmp/bring-shots';
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const today = new Date();
const wd = (n) => (today.getDay() + n + 7) % 7;
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const ago = (n, h = 18) => { const x = new Date(today); x.setDate(x.getDate() - n); x.setHours(h, 0, 0, 0); return x; };
const later = (n) => { const x = new Date(today); x.setDate(x.getDate() + n); return x; };
const longDay = (n, lang = 'en') => later(n).toLocaleDateString(lang, { weekday: 'long' });

// Today Push day; tomorrow Pull day; in 3 days Leg day; 3 days ago Pull day (missed).
const week = (withToday = true) => ({
  ...(withToday ? { [wd(0)]: { title: 'Push day', exerciseIds: ['builtin:bench-press', 'builtin:incline-bench'] } } : {}),
  [wd(1)]: { title: 'Pull day', exerciseIds: ['builtin:lat-pulldown', 'builtin:seated-row'] },
  [wd(3)]: { title: 'Leg day', exerciseIds: ['builtin:squat', 'builtin:leg-press'] },
  [wd(-3)]: { title: 'Back day', exerciseIds: ['builtin:deadlift', 'builtin:bent-over-row'] },
});
const state = (language, extra = {}) => ({
  language, account: { name: 'Sara', provider: 'guest' }, tutorialSeen: true, tourSeen: true, tourSnoozed: 2, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-03-01', heightCm: 165, weightKg: 70, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2200, proteinG: 120, carbsG: 250, fatG: 70 },
  schedule: week(), savedSchedules: [{ id: 'gym', name: 'Gym week', days: week(), createdAt: ago(20).toISOString() }], activeScheduleId: 'gym',
  exercises: [], meals: [], weights: [], recipes: [], water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, dayExtras: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {}, mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null,
  workouts: [], exerciseNotes: [], exerciseSetups: {}, scheduleSince: {}, notifyPrefs: { restAlertAsked: true },
  ...extra,
});

const browser = await chromium.launch();
const open = async (st, path = '/training') => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((v) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(v)); }, { state: st, version: 16 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  return { ctx, page };
};
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store')).state);
const body = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const western = (s) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const tap = (page, name) => page.getByText(name, { exact: true }).filter({ visible: true }).first().click();
const pickDay = (page, label) => page.getByRole('button', { name: new RegExp(label) }).filter({ visible: true }).first().click();
const planToday = (st) => {
  const own = st.occurrences[dayKey(today)];
  const moved = Object.values(st.occurrences).find((o) => o.state === 'scheduled' && o.scheduledDate === dayKey(today) && o.originalDate !== dayKey(today));
  const w = moved ? moved.weekday : own && own.scheduledDate === dayKey(today) ? own.weekday : today.getDay();
  return st.schedule[w]?.title;
};

// ── 1. The card and the missed workout ──
let { ctx, page } = await open(state('en'));
let b = await body(page);
check('the missed card says Missed · <day> with Do today and Skip, no Move', b.toLowerCase().includes(`missed · ${longDay(-3)}`.toLowerCase()) && b.includes('Do today') && !/\bMove\b/.test(b), b.slice(0, 400));
check("today's card offers Do another day's workout", b.includes("Do another day's workout"));
await page.screenshot({ path: `${SHOTS}/training-en.png` });

// ── 2. Swap, just this week, then Undo ──
await tap(page, "Do another day's workout");
await page.waitForTimeout(400);
b = await body(page);
check('the sheet lists the week', b.includes('Which workout today?') && b.includes('Leg day') && b.includes('Missed') && b.includes('Rest'));
await page.screenshot({ path: `${SHOTS}/pick-en.png` });
await pickDay(page, `^${longDay(3)} ${later(3).getDate()}: Leg day$`);
await page.waitForTimeout(300);
b = await body(page);
check('the question: Swap them (picked) or Just replace today', b.includes('Leg day today') && b.includes("What should happen to today's Push day?") && b.includes(`Leg day today, Push day on ${longDay(3)}`) && b.includes('Just replace today'));
await page.screenshot({ path: `${SHOTS}/choose-en.png` });
await tap(page, 'Next');
await page.waitForTimeout(300);
b = await body(page);
check('Keep this swap? with three choices, Just this week picked', b.includes('Keep this swap?') && b.includes('Just this week') && b.includes('Update my weekly schedule') && b.includes('Save as a new schedule'));
await page.screenshot({ path: `${SHOTS}/keep-en.png` });
await tap(page, 'Set it, start later');
await page.waitForTimeout(600);
let st = await store(page);
b = await body(page);
check('just this week: Leg day today, schedule unchanged', planToday(st) === 'Leg day' && st.schedule[wd(0)].title === 'Push day' && b.includes('Swapped: Leg day today.'), planToday(st));
await page.screenshot({ path: `${SHOTS}/swapped-en.png` });
await tap(page, 'Undo');
await page.waitForTimeout(500);
st = await store(page);
check('Undo puts Push day back', planToday(st) === 'Push day' && Object.keys(st.occurrences).length === 0, JSON.stringify(st.occurrences));
await ctx.close();

// ── 3. Swap kept: update the weekly schedule ──
({ ctx, page } = await open(state('en')));
await tap(page, "Do another day's workout");
await page.waitForTimeout(300);
await pickDay(page, `^${longDay(3)} ${later(3).getDate()}: Leg day$`);
await tap(page, 'Next');
await tap(page, 'Update my weekly schedule');
await tap(page, 'Set it, start later');
await page.waitForTimeout(500);
st = await store(page);
check('update: every week Leg day today and Push day on that day', st.schedule[wd(0)].title === 'Leg day' && st.schedule[wd(3)].title === 'Push day' && Object.keys(st.occurrences).length === 0);
check('update: the saved schedule follows', st.savedSchedules.find((x) => x.id === 'gym').days[wd(0)].title === 'Leg day');
await ctx.close();

// ── 4. Swap kept: save as a new schedule ──
({ ctx, page } = await open(state('en')));
await tap(page, "Do another day's workout");
await page.waitForTimeout(300);
await pickDay(page, `^${longDay(3)} ${later(3).getDate()}: Leg day$`);
await tap(page, 'Next');
await tap(page, 'Save as a new schedule');
await tap(page, 'Set it, start later');
await page.waitForTimeout(500);
st = await store(page);
const fresh = st.savedSchedules.find((x) => x.id === st.activeScheduleId);
check('new: a new active schedule with the swap; the old one kept as it was', st.savedSchedules.length === 2 && fresh.name.startsWith('Gym week · ') && fresh.days[wd(0)].title === 'Leg day' && st.savedSchedules.find((x) => x.id === 'gym').days[wd(0)].title === 'Push day', st.savedSchedules.map((x) => x.name).join(' | '));
await ctx.close();

// ── 5. Just replace today, then start ──
({ ctx, page } = await open(state('en')));
await tap(page, "Do another day's workout");
await page.waitForTimeout(300);
await pickDay(page, `^${longDay(3)} ${later(3).getDate()}: Leg day$`);
await tap(page, 'Just replace today');
await page.waitForTimeout(200);
await tap(page, 'Set it, start later');
await page.waitForTimeout(500);
st = await store(page);
b = await body(page);
check("replace: Leg day today, labelled as that day's workout", planToday(st) === 'Leg day' && b.includes(`${longDay(3)}'s workout, today only`), b.match(/.{0,40}today only/)?.[0]);
check('replace: the Leg day stays on its own day', !Object.values(st.occurrences).some((o) => o.originalDate === dayKey(later(3))));
await ctx.close();
({ ctx, page } = await open(state('en')));
await tap(page, "Do another day's workout");
await page.waitForTimeout(300);
await pickDay(page, `^${longDay(3)} ${later(3).getDate()}: Leg day$`);
await tap(page, 'Just replace today');
await tap(page, 'Start Leg day');
await page.waitForTimeout(1200);
b = await body(page);
check('Start opens the workout on Leg day', page.url().includes('/session') && b.includes('Barbell Squat'), page.url());
await ctx.close();

// ── 6. Missed: Do today ──
({ ctx, page } = await open(state('en')));
await tap(page, 'Do today');
await page.waitForTimeout(400);
b = await body(page);
check("missed Do today: one choice, today's Push day skipped this time", b.includes('Back day today') && b.includes(`It moves from ${longDay(-3)} to today. Push day is skipped this time.`) && !b.includes('Swap them'));
await tap(page, 'Set it, start later');
await page.waitForTimeout(500);
st = await store(page);
b = await body(page);
check('missed moved to today; no missed card left', planToday(st) === 'Back day' && !b.toLowerCase().includes(`missed · ${longDay(-3)}`.toLowerCase()));
await ctx.close();

// ── 7. Rest day today ──
({ ctx, page } = await open(state('en', { schedule: week(false), savedSchedules: [] , activeScheduleId: null })));
b = await body(page);
check("rest day: Do another day's workout is offered", b.includes("Do another day's workout"));
await tap(page, "Do another day's workout");
await page.waitForTimeout(300);
await pickDay(page, `^${longDay(3)} ${later(3).getDate()}: Leg day$`);
b = await body(page);
check('rest day: Swap (that day becomes rest) or Just add it', b.includes('Today is a rest day.') && b.includes(`Leg day today, ${longDay(3)} becomes a rest day`) && b.includes('Just add it'));
await tap(page, 'Just add it');
await tap(page, 'Set it, start later');
await page.waitForTimeout(500);
st = await store(page);
check('rest day add: Leg day today, the day keeps it', planToday(st) === 'Leg day' && !Object.values(st.occurrences).some((o) => o.originalDate === dayKey(later(3))));
await ctx.close();

// ── 8. Summary: keep an added exercise ──
const extra = { id: 'w-fly', at: ago(0, 9).toISOString(), exerciseId: 'builtin:pec-fly-cable', exerciseName: 'Cable Pec Fly', type: 'weight_reps', caloriesBurned: 0, sets: [{ weightKg: 20, reps: 12, done: true }] };
const bench = { id: 'w-bench', at: ago(0, 9).toISOString(), exerciseId: 'builtin:bench-press', exerciseName: 'Bench', type: 'weight_reps', caloriesBurned: 0, sets: [{ weightKg: 60, reps: 8, done: true }] };
({ ctx, page } = await open(state('en', { workouts: [bench, extra], dayExtras: { [dayKey(today)]: ['builtin:pec-fly-cable'] }, activeSession: { startedAt: ago(0, 8).toISOString(), dayKey: dayKey(today), exerciseIds: ['builtin:bench-press'], index: 0, restEndsAt: null, restSeconds: 90 } }), '/session'));
await page.getByText('Finish workout', { exact: true }).last().click();
await page.waitForTimeout(600);
b = await body(page);
check('summary asks about the added exercise', b.includes('You added Cable Pec Fly today') && b.includes('Keep it in Push day?') && b.includes('Add it to every Push day'));
await page.screenshot({ path: `${SHOTS}/summary-en.png`, fullPage: true });
await tap(page, 'Add it to every Push day');
await page.getByText('Save workout', { exact: true }).last().click();
await page.waitForTimeout(600);
st = await store(page);
check('kept: Cable Pec Fly is now in every Push day', st.schedule[wd(0)].exerciseIds.includes('builtin:pec-fly-cable') && st.savedSchedules[0].days[wd(0)].exerciseIds.includes('builtin:pec-fly-cable'));
await ctx.close();
({ ctx, page } = await open(state('en', { workouts: [bench, extra], activeSession: { startedAt: ago(0, 8).toISOString(), dayKey: dayKey(today), exerciseIds: ['builtin:bench-press'], index: 0, restEndsAt: null, restSeconds: 90 } }), '/session'));
await page.getByText('Finish workout', { exact: true }).last().click();
await page.waitForTimeout(500);
await page.getByText('Save workout', { exact: true }).last().click();
await page.waitForTimeout(500);
st = await store(page);
check('Just today (the default) leaves the schedule alone', !st.schedule[wd(0)].exerciseIds.includes('builtin:pec-fly-cable'));
await ctx.close();

// ── 9. Arabic ──
({ ctx, page } = await open(state('ar')));
b = western(await body(page));
check('Arabic: the button and the missed card', b.includes('تمرين يوم آخر') && b.includes(`فائت · ${longDay(-3, 'ar')}`));
await tap(page, 'تمرين يوم آخر');
await page.waitForTimeout(300);
b = western(await body(page));
check('Arabic: the week list', b.includes('أي تمرين اليوم؟') && b.includes('Leg day') && b.includes('فائت'));
await pickDay(page, `^${longDay(3, 'ar')} [0-9٠-٩]+: Leg day$`);
await page.waitForTimeout(300);
b = western(await body(page));
check('Arabic: swap or replace', b.includes('بدّل اليومين') && b.includes('استبدل اليوم فقط') && b.includes('Leg day اليوم'));
await page.screenshot({ path: `${SHOTS}/choose-ar.png` });
await tap(page, 'التالي');
await page.waitForTimeout(300);
b = western(await body(page));
check('Arabic: keep this swap', b.includes('تحتفظ بهذا التبديل؟') && b.includes('هذا الأسبوع فقط') && b.includes('حدّث جدولي الأسبوعي'));
await page.screenshot({ path: `${SHOTS}/keep-ar.png` });
await ctx.close();

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
