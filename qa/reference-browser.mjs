// The screenshot, rebuilt in the real app: Pec Deck / Chest Fly, set 4, after a
// previous session that ended on a burnout set.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:8099';
const OUT = '/tmp/claude-0/-home-user-CalApp/ecae7b05-0468-5173-bf98-63d45483ae6b/scratchpad/shots12';

const today = new Date();
const at = (daysAgo, hour = 18) => {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const FLY = 'builtin:chest-fly';
const RAISE = 'builtin:lateral-raise';
const w = (id, name, atIso, sets) => ({
  id, at: atIso, updatedAt: atIso, exerciseId: id === 'f' ? FLY : RAISE,
  exerciseName: name, type: 'weight_reps', sets, caloriesBurned: 43,
});

const seed = { state: {
  language: 'en', account: { name: 'T', provider: 'guest' }, tutorialSeen: true,
  profile: { sex:'male', birthDate:'1990-01-01', heightCm:178, weightKg:80, activity:'moderate', goal:'maintain' },
  schedule: {
    [today.getDay()]: {
      title: 'Push',
      exerciseIds: [FLY, RAISE],
      plans: {
        [FLY]: [{ weightKg: 25, reps: 10 }, { weightKg: 25, reps: 10 }, { weightKg: 25, reps: 10 }],
        // Deliberately stale: a copy of a session from months ago that has
        // never moved, while the real lifting has gone up to 28 × 8.
        [RAISE]: [{ weightKg: 18, reps: 12 }, { weightKg: 20, reps: 12 }, { weightKg: 24, reps: 8 }],
      },
    },
  },
  workouts: [
    // Today: three sets already done, so the session screen opens on set 4.
    w('f', 'Pec Deck / Chest Fly', at(0, 8), [
      { weightKg: 25, reps: 10, done: true, isPR: true },
      { weightKg: 25, reps: 9, done: true },
      { weightKg: 20, reps: 9, done: true },
    ]),
    // Last week: a descending session that ENDS on 25 × 7. This final set is
    // what the old "Last time" showed on set 4.
    { ...w('f2', 'Pec Deck / Chest Fly', at(7), [
      { weightKg: 25, reps: 10, done: true },
      { weightKg: 25, reps: 8, done: true },
      { weightKg: 25, reps: 7, done: true },
    ]), exerciseId: FLY },
    { ...w('f3', 'Pec Deck / Chest Fly', at(14), [
      { weightKg: 22.5, reps: 12, done: true },
      { weightKg: 25, reps: 6, done: true },
    ]), exerciseId: FLY },
    // Lateral raise: real lifting, well past the stale plan. Nothing today.
    { ...w('r1', 'Lateral Raise', at(4), [
      { weightKg: 24, reps: 12, done: true },
      { weightKg: 24, reps: 12, done: true },
      { weightKg: 28, reps: 8, done: true, isPR: true },
    ]), exerciseId: RAISE },
  ],
  activeSession: {
    dayKey: `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`,
    exerciseIds: [FLY, RAISE], index: 0, restSeconds: 60, restEndsAt: null,
    startedAt: at(0, 7),
  },
  recipes: [], mealPlanSwaps: {}, mealPlanRecipes: {}, shopping: null,
  exercises: [], meals: [], water: {}, bodyReadings: [], skips: {}, dayOrder: {},
  whoopBurnByDay: {}, whoopWorkoutsByDay: {},
}, version: 13 };

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 980 } });
await ctx.addInitScript((s) => {
  if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s));
}, seed);
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
const squash = (s) => s.replace(/\s+/g, ' ');

await page.goto(`${BASE}/session`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
let body = squash(await page.textContent('body'));
await page.screenshot({ path: `${OUT}/session-set4.png`, fullPage: true });

console.log('=== The session screen, on set 4 ===');
check('it is set 4', /Set 4/.test(body), body.match(/Set \d/)?.[0]);
// Set 4 on a three-set plan: there is no fourth target, so none is shown.
check('no target is invented past the plan', !/Target/.test(body), body.match(/Target.{0,20}/)?.[0]);
check('THE FIX: the reference is now "Best"', /Best\s*25 kg × 10/.test(body), body.match(/Best.{0,22}/)?.[0]);
check('  NOT the burnout set 25 kg × 7', !/(Last time|Best)\s*25 kg × 7/.test(body));
const todayLabel = new Date().toLocaleDateString('en', { month: 'short', day: 'numeric' });
check('  and it says when', new RegExp('Best\\s*25 kg × 10\\s*(today|' + todayLabel + ')').test(body), body.match(/Best.{0,28}/)?.[0]);
check('"Last time" is gone from the reference row', !/Last time/.test(body));

console.log('\n=== Same reps, live off the stepper ===');
// Past the plan the steppers open on the set just finished — 20 kg × 9 —
// so the reference opens at 9 reps to match.
check('it opens on the reps just performed', /Last 9-rep set:\s*25 kg/.test(body), body.match(/Last \d+-rep set:.{0,22}/)?.[0]);
check('  dated today (set 2 of this session)', new RegExp('Last 9-rep set:\\s*25 kg\\s*· (today|' + todayLabel + ')').test(body));

// Turn the reps stepper and watch the reference follow. The stepper value is
// a real text field, so setting it is exactly what a thumb on ± produces.
const setReps = async (n) => {
  const reps = page.locator('input').nth(1);
  await reps.fill(String(n));
  await reps.blur();
  await page.waitForTimeout(500);
};
await setReps(10);
body = squash(await page.textContent('body'));
await page.screenshot({ path: `${OUT}/session-reps10.png`, fullPage: true });
check('turning the stepper to 10 moves the reference with it', new RegExp('Last 10-rep set:\\s*25 kg\\s*· (today|' + todayLabel + ')').test(body), body.match(/Last \d+-rep set:.{0,22}/)?.[0]);
await setReps(7);
body = squash(await page.textContent('body'));
check('at 7 reps it finds last week, not today', /Last 7-rep set:\s*25 kg/.test(body), body.match(/Last \d+-rep set:.{0,24}/)?.[0]);
const weekAgoLabel = new Date(Date.now() - 7 * 86400000).toLocaleDateString('en', { month: 'short', day: 'numeric' });
check('  and dates it a week back', new RegExp('Last 7-rep set:\\s*25 kg\\s*· (7 days ago|' + weekAgoLabel + ')').test(body), body.match(/Last 7-rep set:.{0,26}/)?.[0]);

// A rep count never attempted falls back and says which.
await setReps(5);
body = squash(await page.textContent('body'));
await page.screenshot({ path: `${OUT}/session-reps5.png`, fullPage: true });
check('5 reps was never done → it says so and labels the 6 it found', /No previous 5-rep set · nearest × 6:\s*25 kg/.test(body), body.match(/No previous.{0,50}/)?.[0]);

console.log('\n=== The Training card, without going in ===');
await page.goto(`${BASE}/training`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
body = squash(await page.textContent('body'));
await page.screenshot({ path: `${OUT}/training-card.png`, fullPage: true });
check('Lateral Raise is on the card', /Lateral Raise/.test(body));
check('THE FIX: it shows last time, not the stale plan', /Last time · 3 sets\s*Best 28 kg × 8\s*24kg × 12\s*24kg × 12\s*28kg × 8/.test(body),
  body.match(/Lateral Raise[^]{0,90}/)?.[0]);
check('  the stale 18kg × 12 is nowhere', !/18kg × 12/.test(body));
check('  and the strip says which numbers these are', /Last time/.test(body));
check('Best reads the record', /Best\s*28 kg × 8/.test(body), body.match(/Best ?[0-9.]+ kg × \d+/g)?.join(' | '));
check('the exercise logged today carries no "Last time" label', /Chest Fly[^]{0,60}20kg × 9/.test(body),
  body.match(/Chest Fly[^]{0,80}/)?.[0]);

console.log('\n=== Going in and out changes nothing ===');
// Read the chips as elements — running a regex over concatenated page text
// cannot tell "24kg × 12" followed by "24kg × 12" from "24kg × 1224kg × 12".
// The label is allowed to change (the chips become "today's" once the visit
// seeds them); the numbers are not.
const chips = () => page.$$eval('div', (els) =>
  els.filter((e) => e.children.length === 0 && /^\d+(\.\d+)?kg × \d+$/.test((e.textContent || '').trim()))
     .map((e) => e.textContent.trim()));
const before = (await chips()).join(', ');
await page.goto(`${BASE}/exercise-detail?id=${encodeURIComponent(RAISE)}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.goto(`${BASE}/training`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
body = squash(await page.textContent('body'));
await page.screenshot({ path: `${OUT}/training-after-visit.png`, fullPage: true });
const after = (await chips()).join(', ');
check('the same three sets are there afterwards', after.includes('24kg × 12, 24kg × 12, 28kg × 8'), after);
check('  the numbers did not change by visiting', before === after, `before=[${before}]  after=[${after}]`);

// expo-notifications has no web implementation; that warning predates this
// change and has nothing to do with it.
const real = errors.filter((e) => !/Notifications\./.test(e));
check('no page errors', real.length === 0, real.slice(0, 2).join(' | '));
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);
