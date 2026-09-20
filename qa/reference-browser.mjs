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
check('the Best tile is the only reference tile', !/Last time\s*25 kg × 7/.test(body));

console.log('\n=== Last time, set by set, one tap away ===');
// The same-reps box is gone; last week's whole session is the reference.
check('the same-reps box is gone', !/-rep set/.test(body), body.match(/.{0,10}-rep set.{0,20}/)?.[0]);
check('last time is dated a week back', /Last time · 7 days ago/.test(body), body.match(/Last time.{0,20}/)?.[0]);
check('  and lists all three of its sets in order', /1\s*25 kg × 10\s*2\s*25 kg × 8\s*3\s*25 kg × 7/.test(body), body.match(/Last time[^]{0,80}/)?.[0]);
const inputVal = async (i) => page.locator('input').nth(i).inputValue();
check('the steppers open on the set just finished (20 × 9)', (await inputVal(0)) === '20' && (await inputVal(1)) === '9', `${await inputVal(0)} × ${await inputVal(1)}`);
// Tap the third chip: both fields follow.
await page.getByRole('button', { name: /Last time 3: 25 kg × 7/ }).click();
await page.waitForTimeout(400);
check('tapping a last-time set fills weight and reps', (await inputVal(0)) === '25' && (await inputVal(1)) === '7', `${await inputVal(0)} × ${await inputVal(1)}`);
await page.screenshot({ path: `${OUT}/session-lasttime.png`, fullPage: true });

console.log('\n=== Reps, one tap away ===');
const quick = await page.getByRole('button', { name: /^\d+ reps$/ }).allTextContents();
check('quick rep counts are offered: 6 8 10 12 plus last time\'s 7', quick.join(' ') === '× 6 × 7 × 8 × 10 × 12', quick.join(' '));
await page.getByRole('button', { name: /^12 reps$/ }).click();
await page.waitForTimeout(300);
check('tapping × 12 sets the reps field', (await inputVal(1)) === '12', await inputVal(1));
// A number typed into the field reaches the log without leaving the field.
const repsField = page.locator('input').nth(1);
await repsField.fill('7');
await page.waitForTimeout(200);
await page.getByText('Complete set').first().click();
await page.waitForTimeout(800);
body = squash(await page.textContent('body'));
check('Complete set with the field still focused logs the typed 7', /4\s*25 kg × 7\s*Undo/.test(body), body.match(/Completed sets[^]{0,120}/)?.[0]);
check('  as set 4, i.e. exactly one set was added', /Set 5/.test(body) && !/5\s*25 kg/.test(body), body.match(/Set \d/)?.[0]);

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
const raiseRecords = () => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store')).state.workouts.filter((w) => w.exerciseId === 'builtin:lateral-raise').length);
const recordsBefore = await raiseRecords();
await page.goto(`${BASE}/exercise-detail?id=${encodeURIComponent(RAISE)}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
body = squash(await page.textContent('body'));
await page.screenshot({ path: `${OUT}/detail-reference.png`, fullPage: true });
check('the exercise page shows last time as a reference, with Use on each row', /Last time[^]{0,40}24 kg × 12\s*Use/.test(body), body.match(/Last time[^]{0,80}/)?.[0]);
check('  opening it wrote no record', (await raiseRecords()) === recordsBefore, `${recordsBefore} → ${await raiseRecords()}`);
await page.getByRole('button', { name: /Last time 3 28 kg × 8/ }).click();
await page.waitForTimeout(300);
check('  Use fills the steppers', (await page.locator('input').nth(0).inputValue()) === '28' && (await page.locator('input').nth(1).inputValue()) === '8');
await page.goto(`${BASE}/training`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
body = squash(await page.textContent('body'));
await page.screenshot({ path: `${OUT}/training-after-visit.png`, fullPage: true });
const after = (await chips()).join(', ');
check('the same three sets are there afterwards', after.includes('24kg × 12, 24kg × 12, 28kg × 8'), after);
check('  the numbers did not change by visiting', before === after, `before=[${before}]  after=[${after}]`);
check('  and they are still labelled last time, not today', /Lateral Raise\s*Last time/.test(body), body.match(/Lateral Raise.{0,30}/)?.[0]);

console.log('\n=== A session into a preview record does not double it ===');
// The doubled day from the report: a preview of last time (unlifted rows)
// already filed for today, then Start workout → Complete set × 3.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('calapp-store'));
  const d = new Date(); d.setHours(8, 0, 0, 0);
  s.state.workouts.unshift({ id: 'prev', at: d.toISOString(), updatedAt: d.toISOString(), exerciseId: 'builtin:lateral-raise', exerciseName: 'Lateral Raise', type: 'weight_reps', caloriesBurned: 0,
    sets: [{ weightKg: 24, reps: 12, done: false }, { weightKg: 24, reps: 12, done: false }, { weightKg: 28, reps: 8, done: false }] });
  s.state.activeSession = { ...s.state.activeSession, index: 1 };
  localStorage.setItem('calapp-store', JSON.stringify(s));
});
await page.goto(`${BASE}/session`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
body = squash(await page.textContent('body'));
check('the session opens on set 1 of Lateral Raise', /Lateral Raise\s*Set 1/.test(body), body.match(/Lateral Raise.{0,20}/)?.[0]);
for (let i = 0; i < 3; i++) {
  await page.getByText('Complete set').first().click();
  await page.waitForTimeout(500);
  const skip = page.getByText('Skip rest');
  if (await skip.count()) await skip.first().click();
  await page.waitForTimeout(300);
}
const setsNow = await page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store')).state.workouts.find((w) => w.id === 'prev' || (w.exerciseId === 'builtin:lateral-raise' && new Date(w.at).toDateString() === new Date().toDateString())).sets);
check('three completed sets are three sets, not six', setsNow.length === 3, JSON.stringify(setsNow));
check('  all of them lifted', setsNow.every((s) => s.done));
await page.goto(`${BASE}/training`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
body = squash(await page.textContent('body'));
await page.screenshot({ path: `${OUT}/training-after-session.png`, fullPage: true });
check('the Training card says 3 sets for Lateral Raise', /Lateral Raise\s*3 sets/.test(body), body.match(/Lateral Raise.{0,40}/)?.[0]);

// expo-notifications has no web implementation; that warning predates this
// change and has nothing to do with it.
const real = errors.filter((e) => !/Notifications\./.test(e));
check('no page errors', real.length === 0, real.slice(0, 2).join(' | '));
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);
