// Exercise notes in the exported web app: an earlier note shows on the
// workout screen; writing today's note during a rest leaves the rest and the
// sets alone; saving twice edits the same note; another exercise's note never
// shows; older set comments are in History; Arabic works.
// Needs the web build on :8099 (the API is not needed).
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:8099';
const SHOTS = process.env.SHOTS ?? '/tmp/notes-shots';
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const today = new Date();
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const ago = (n, h = 18) => { const x = new Date(today); x.setDate(x.getDate() - n); x.setHours(h, 0, 0, 0); return x; };
const BENCH = 'builtin:bench-press';
const OHP = 'builtin:shoulder-press';
const state = (language) => ({
  language, account: { name: 'Sara', provider: 'guest' }, tutorialSeen: true, tourSeen: true, tourSnoozed: 2, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-03-01', heightCm: 165, weightKg: 70, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2200, proteinG: 120, carbsG: 250, fatG: 70 },
  schedule: { [today.getDay()]: { title: 'Push', exerciseIds: [BENCH, OHP], plans: {} } }, savedSchedules: [], activeScheduleId: null,
  exercises: [], meals: [], weights: [], recipes: [], water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {}, mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null,
  workouts: [
    { id: 'old1', at: ago(14).toISOString(), exerciseId: BENCH, exerciseName: 'Bench Press', type: 'weight_reps', caloriesBurned: 0, sets: [{ weightKg: 60, reps: 10, done: true }, { weightKg: 65, reps: 6, done: true, comment: '65 felt heavy on the last set.' }] },
    { id: 'old2', at: ago(7).toISOString(), exerciseId: BENCH, exerciseName: 'Bench Press', type: 'weight_reps', caloriesBurned: 0, sets: [{ weightKg: 60, reps: 10, done: true }] },
  ],
  exerciseNotes: [
    { id: 'note:old', exerciseId: BENCH, exerciseName: 'Bench Press', dayKey: dayKey(ago(7)), at: ago(7).toISOString(), text: 'Keep elbows close. Slow on the way down.', updatedAt: ago(7).toISOString() },
    { id: 'note:ohp', exerciseId: OHP, exerciseName: 'Shoulder Press', dayKey: dayKey(ago(7)), at: ago(7).toISOString(), text: 'OHP note — must not show on bench.', updatedAt: ago(7).toISOString() },
  ],
  // A workout in progress with a rest running.
  activeSession: { startedAt: ago(0, 7).toISOString(), dayKey: dayKey(today), exerciseIds: [BENCH, OHP], index: 0, restEndsAt: new Date(Date.now() + 120000).toISOString(), restSeconds: 120 },
});
const browser = await chromium.launch();
const open = async (lang) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((v) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(v)); }, { state: state(lang), version: 16 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/session`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  return { ctx, page };
};
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store')).state);
const body = (page) => page.evaluate(() => document.body.innerText);

let { ctx, page } = await open('en');
let b = await body(page);
check('previous note from last week shows on the workout', /Exercise notes/.test(b) && /Keep elbows close\. Slow on the way down\./.test(b));
check("another exercise's note does not", !/OHP note/.test(b));
check('no note today yet → "Add a note"', /Add a note/.test(b));
await page.screenshot({ path: `${SHOTS}/card-en.png`, fullPage: true });
const before = await store(page);
await page.getByText('Add a note', { exact: true }).click();
await page.waitForTimeout(500);
b = await body(page);
// Section labels are drawn in capitals, so compare case-insensitively.
check('editor lists previous notes, newest first, with the set comment', /previous notes/i.test(b) && b.indexOf('Keep elbows close') < b.indexOf('65 felt heavy') && /set 2/i.test(b));
await page.getByLabel("Today's note").fill('Last set felt controlled.\nTry 65 kg next time.');
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/sheet-en.png` });
await page.getByRole('button', { name: 'Save note' }).click();
await page.waitForTimeout(500);
let s = await store(page);
const mine = s.exerciseNotes.filter((n) => n.exerciseId === BENCH && n.dayKey === dayKey(today));
check('saved once, for this exercise and today', mine.length === 1 && mine[0].text === 'Last set felt controlled.\nTry 65 kg next time.', JSON.stringify(mine));
check('rest still running, end time unchanged', s.activeSession.restEndsAt === before.activeSession.restEndsAt);
check('no set logged by writing a note', s.workouts.length === before.workouts.length);
check('last week\'s note untouched', s.exerciseNotes.find((n) => n.id === 'note:old')?.text === 'Keep elbows close. Slow on the way down.');
b = await body(page);
check('card shows today\'s note and "Saved on this device"', /Last set felt controlled\./.test(b) && /Saved on this device/.test(b));
// Edit: same note, new text.
await page.getByRole('button', { name: /^Today: Last set felt controlled/ }).click();
await page.waitForTimeout(400);
await page.getByLabel("Today's note").fill('Felt strong.');
await page.getByRole('button', { name: 'Save note' }).click();
await page.waitForTimeout(400);
s = await store(page);
const edited = s.exerciseNotes.filter((n) => n.exerciseId === BENCH && n.dayKey === dayKey(today));
check('editing updates the same note (no duplicate)', edited.length === 1 && edited[0].text === 'Felt strong.' && edited[0].id === mine[0].id);
// Cancel keeps saved text.
await page.getByRole('button', { name: /^Today: Felt strong/ }).click();
await page.waitForTimeout(400);
await page.getByLabel("Today's note").fill('');
page.once('dialog', (d) => d.accept().catch(() => {}));
await page.getByRole('button', { name: 'Cancel' }).click();
await page.waitForTimeout(600);
s = await store(page);
check('cancel leaves the saved note as it was', s.exerciseNotes.find((n) => n.id === mine[0].id)?.text === 'Felt strong.');
// Reload: it's still there.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
check('still there after reopening', /Felt strong\./.test(await body(page)));
await ctx.close();

({ ctx, page } = await open('ar'));
b = await body(page);
check('Arabic card', /ملاحظات التمرين/.test(b) && /أضف ملاحظة/.test(b) && /السابقة/.test(b));
await page.screenshot({ path: `${SHOTS}/card-ar.png`, fullPage: true });
await ctx.close();
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
