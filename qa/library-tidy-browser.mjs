// A library like the reported one — custom "سحب علوي" and friends filed under
// Full body — loaded by the real app: the v15 migration runs on hydration and
// the Full body list comes out clean.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:8099';
const OUT = '/tmp/claude-0/-home-user-CalApp/ecae7b05-0468-5173-bf98-63d45483ae6b/scratchpad/shots12';

const today = new Date();
const at = (d, h = 18) => { const x = new Date(today); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const seed = (lang) => ({ state: {
  language: lang, account: { name: 'T', provider: 'guest' }, tutorialSeen: true, tourSeen: true,
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 80, activityLevel: 'moderate', goal: 'maintain' },
  exercises: [
    { id: 'custom:a', name: 'سحب علوي', category: 'fullBody', type: 'weight_reps', source: 'custom' },
    { id: 'custom:b', name: 'Seated cable row wide', category: 'fullBody', type: 'weight_reps', source: 'custom' },
    { id: 'custom:c', name: 'Machine 7', category: 'fullBody', type: 'weight_reps', source: 'scan' },
    { id: 'custom:d', name: 'ضغط كتف بالدمبل جالس', category: 'fullBody', type: 'weight_reps', source: 'custom' },
  ],
  workouts: [
    { id: 'w1', at: at(3), updatedAt: at(3), exerciseId: 'custom:a', exerciseName: 'سحب علوي', type: 'weight_reps', caloriesBurned: 20, sets: [{ weightKg: 55, reps: 12, done: true }, { weightKg: 60, reps: 9, done: true, isPR: true }] },
  ],
  schedule: { [today.getDay()]: { title: 'Pull', exerciseIds: ['custom:a', 'custom:b'] } },
  savedSchedules: [], activeScheduleId: null,
  recipes: [], mealPlanSwaps: {}, mealPlanRecipes: {}, shopping: null, meals: [], water: [], weights: [], bodyReadings: [], skips: {}, dayOrder: {},
  whoopBurnByDay: {}, whoopWorkoutsByDay: {}, activeSession: null,
}, version: 14 });

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const squash = (s) => s.replace(/\s+/g, ' ');

const browser = await chromium.launch();
for (const lang of ['en', 'ar']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, seed(lang));
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/exercise-library`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  console.log(`=== ${lang}: the library after load ===`);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store')));
  check('the store is on v15', stored.version === 15, String(stored.version));
  const ids = stored.state.exercises.map((e) => e.id);
  check('the custom "سحب علوي" is gone (folded into Lat Pulldown)', !ids.includes('custom:a'), ids.join(','));
  check('  its two sets now belong to the built-in', stored.state.workouts[0].exerciseId === 'builtin:lat-pulldown' && stored.state.workouts[0].sets.length === 2);
  check('  and the schedule day lists the built-in', stored.state.schedule[String(today.getDay())].exerciseIds[0] === 'builtin:lat-pulldown', JSON.stringify(stored.state.schedule));
  const cat = (id) => stored.state.exercises.find((e) => e.id === id)?.category;
  check('"Seated cable row wide" is under back', cat('custom:b') === 'back', cat('custom:b'));
  check('"ضغط كتف بالدمبل جالس" is under shoulders', cat('custom:d') === 'shoulders', cat('custom:d'));
  check('"Machine 7" is the only one left in Full body', cat('custom:c') === 'fullBody' && stored.state.exercises.filter((e) => e.category === 'fullBody').length === 1);

  // The Full body chip in the library shows only the whole-body movements.
  const chip = lang === 'ar' ? 'الجسم كامل' : 'Full body';
  const chipEl = page.getByText(chip, { exact: true }).first();
  if (await chipEl.count()) {
    await chipEl.click();
    await page.waitForTimeout(600);
    const body = squash(await page.textContent('body'));
    await page.screenshot({ path: `${OUT}/library-fullbody-${lang}.png`, fullPage: true });
    check('Full body list has no pulldown in it', !/سحب علوي|Seated cable row wide|ضغط كتف/.test(body), body.match(/(سحب علوي|Seated cable row wide|ضغط كتف).{0,20}/)?.[0]);
    check('  Machine 7 is still there, as the honest leftover', /Machine 7/.test(body));
    check('  and the built-in whole-body movements are', /Burpee|البيربي/.test(body));
  } else {
    check(`the ${chip} chip exists`, false);
  }
  const real = errors.filter((e) => !/Notifications\./.test(e));
  check('no page errors', real.length === 0, real.slice(0, 2).join(' | '));
  await ctx.close();
}
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);
