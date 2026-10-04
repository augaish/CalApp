// The AI program in the exported web app, against the real server and a fake
// Anthropic: questions → "Calgym is thinking…" → draft → one tailoring
// change → Start. Start makes the program's week a new saved schedule and
// the active one, keeps the week you had in Schedules, and applies targets
// and meal plan; switching back to the old week works. Allergies are saved
// and warn on a recipe. Screenshots go to SHOTS (default: scratch dir).
// Needs: the web build on :8099 (qa/serve.mjs, built with
// EXPO_PUBLIC_API_URL=http://127.0.0.1:8787) and Postgres. Starts its own
// server on :8787.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:8099';
const DB = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost/calgym?host=/opt/calgym-pg/pgsock&port=5433';
const SHOTS = process.env.SHOTS ?? '/tmp/program-shots';
mkdirSync(SHOTS, { recursive: true });
const run = Date.now().toString(36);
const INSTALL = `u_progbrowser_${run}`;

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };

// ── Fake Anthropic: a program on whatever days it likes, with almonds ──
const meal = (slot, name, calories = 500) => ({ slot, name, items: [{ name, portion: '1 plate', calories, proteinG: 35, carbsG: 50, fatG: 15 }] });
const ai = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    const tool = body.tools?.[0]?.name;
    const user = String(body.messages?.at(-1)?.content ?? '');
    let input;
    if (tool === 'propose_program') {
      input = {
        summary: 'Four weeks of full-body strength with a steady 500 kcal deficit.',
        durationWeeks: 8,
        targets: { calories: 2100, proteinG: 165, carbsG: 210, fatG: 65 },
        schedule: { summary: 'Full body, 3 days', days: [1, 3, 5].map((weekday, i) => ({ weekday, title: ['Full body A', 'Full body B', 'Full body C'][i], exercises: [{ name: 'Bench Press', sets: 3, reps: '8-10' }, { name: 'Barbell Squat', sets: 3, reps: '8' }] })) },
        mealPlan: { summary: 'Simple Gulf staples', days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, meals: [meal('breakfast', weekday === 2 ? 'Oats with almonds' : 'Eggs and wholegrain toast', 450), meal('lunch', 'Chicken machboos', 750), meal('dinner', 'Lentil soup and salad', 600)] })) },
      };
    } else if (/must be replaced/.test(user)) {
      input = { reply: '', changes: ['fixed'], mealPlanDays: [{ weekday: 2, meals: [meal('breakfast', 'Shakshuka with bread', 450), meal('lunch', 'Chicken machboos', 750), meal('dinner', 'Lentil soup and salad', 600)] }] };
    } else {
      input = { reply: 'Done — Tuesday dinner is now grilled hammour.', changes: ['Tuesday dinner: lentil soup → grilled hammour'], mealPlanDays: [{ weekday: 2, meals: [meal('breakfast', 'Shakshuka with bread', 450), meal('lunch', 'Chicken machboos', 750), meal('dinner', 'Grilled hammour', 600)] }] };
    }
    // A real build takes a while; the thinking screen should get to show.
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: body.model, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu', name: tool, input }], usage: { input_tokens: 10, output_tokens: 10 } }));
    }, tool === 'propose_program' ? 2500 : 300);
  });
}).listen(8793);

async function startServer() {
  try { await fetch('http://127.0.0.1:8787/health'); throw new Error('port 8787 is already in use'); } catch (e) { if (/in use/.test(e.message)) throw e; }
  const env = { ...process.env, DATABASE_URL: DB, PORT: '8787', ADMIN_TOKEN: 'e2e-admin', REVENUECAT_WEBHOOK_SECRET: 'e2e-hook', ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: 'http://127.0.0.1:8793' };
  delete env.DEEPSEEK_API_KEY;
  const child = spawn('npx', ['tsx', 'src/index.ts'], { cwd: '/home/user/CalApp/server', env, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch('http://127.0.0.1:8787/health')).ok) return child; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}
const server = await startServer();
await fetch('http://127.0.0.1:8787/admin/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': 'e2e-admin' }, body: JSON.stringify({ ref: INSTALL, plan: 'proPlus' }) });

const OLD_WEEK = {
  1: { title: 'Upper', exerciseIds: ['builtin:bench-press'], plans: { 'builtin:bench-press': [{ reps: 10 }] } },
  4: { title: 'Lower', exerciseIds: ['builtin:squat'], plans: {} },
};
const state = (lang = 'en') => ({
  language: lang, account: { name: 'Sara', provider: 'guest' }, installId: INSTALL, aiConsent: 'granted', tutorialSeen: true, tourSeen: true, tourSnoozed: 2, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-03-01', heightCm: 165, weightKg: 70, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 1900, proteinG: 120, carbsG: 210, fatG: 63 },
  schedule: OLD_WEEK, savedSchedules: [], activeScheduleId: null,
  workouts: [], exercises: [], meals: [], weights: [], mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [],
  skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {}, activeProgram: null, planPrefs: null, programDraft: null,
  recipes: [{ id: 'r-almond', name: 'Almond chicken korma', servings: 2, ingredients: [{ name: 'Chicken thigh', key: 'chicken', amount: 400, unit: 'g', calories: 700, proteinG: 80, carbsG: 0, fatG: 40 }, { name: 'Ground almonds', key: 'almonds', amount: 40, unit: 'g', calories: 230, proteinG: 8, carbsG: 8, fatG: 20 }], steps: ['Brown', 'Simmer'], createdAt: new Date().toISOString(), language: 'en', source: 'ai', ready: true }],
});

const browser = await chromium.launch();
const open = async (s, path, theme = 'light') => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme });
  await ctx.addInitScript((v) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(v)); }, { state: s, version: 16 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  return { ctx, page };
};
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store') || '{}').state);
// Visible matches only: earlier screens stay mounted underneath on web.
const tap = async (page, text, exact = true) => { await page.getByText(text, { exact }).locator('visible=true').first().click(); await page.waitForTimeout(450); };
const body = (page) => page.textContent('body');
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

try {
  let { ctx, page } = await open(state(), '/program');
  check('intro explains the four steps', /A few quick questions/.test(await body(page)));
  await tap(page, 'Build my program');
  check('Build opens the questions', page.url().includes('/program-build'), page.url());
  check('step 1 of 5: what to plan', /What should we plan\?/.test(await body(page)) && /Step 1 of 5/.test(await body(page)));
  await shot(page, '01-scope');
  await tap(page, 'Next');
  // Starts from the week you have now: Monday and Thursday.
  let st = await body(page);
  check('training step pre-filled from your schedule', /Your training week/.test(st));
  await page.getByRole('button', { name: '3', exact: true }).locator('visible=true').click(); await page.waitForTimeout(300);
  // 3 days from Mon+Thu fills with Sunday: then pick Sun/Tue/Thu by hand.
  const dayBtn = (n) => page.getByRole('button', { name: n, exact: true }).locator('visible=true');
  await dayBtn('Mon').click(); await page.waitForTimeout(200);
  await dayBtn('Tue').click(); await page.waitForTimeout(200);
  await tap(page, '45 min');
  await tap(page, 'Beginner');
  await shot(page, '02-training');
  await tap(page, 'Next');
  check('food step', /How you eat/.test(await body(page)));
  await page.getByRole('checkbox', { name: 'Nuts' }).locator('visible=true').click(); await page.waitForTimeout(200);
  await tap(page, '3 meals');
  await shot(page, '03-food');
  await tap(page, 'Next');
  await tap(page, 'Lose');
  await shot(page, '04-goal');
  await tap(page, 'Next');
  st = await body(page);
  check('review lists days, allergy and goal', /Ready to build/.test(st) && /3 days \(Sun · Tue · Thu\)/.test(st) && /Nuts/.test(st) && /Lose · Steady/.test(st), st.slice(0, 400));
  check('review says what it costs', /2 changes are free; after that each change is 1 AI action/.test(st));
  await shot(page, '05-review');
  await page.getByRole('button', { name: 'Build my program' }).click();
  await page.waitForTimeout(900);
  check('Calgym is thinking…', /Calgym is thinking/.test(await body(page)) && /Fitting 3 training days/.test(await body(page)) && /Without Nuts/.test(await body(page)));
  await shot(page, '06-thinking');
  await page.waitForURL(/\/program$/, { timeout: 30000 });
  await page.waitForTimeout(800);
  st = await body(page);
  check('ends on a draft', /Draft/.test(st) && /Start this program/.test(st) && /Tailor it with AI · 2 free changes/.test(st), st.slice(0, 300));
  let s = await store(page);
  check('nothing applied yet: schedule untouched', JSON.stringify(s.schedule) === JSON.stringify(OLD_WEEK));
  check('draft training only on Sun/Tue/Thu (the AI picked Mon/Wed/Fri)', s.programDraft.program.schedule.days.map((d) => d.weekday).join() === '0,2,4', s.programDraft.program.schedule.days.map((d) => d.weekday).join());
  check('no almonds in the draft', !JSON.stringify(s.programDraft.program.mealPlan).includes('lmond'));
  check('answers saved with the allergy', JSON.stringify(s.planPrefs?.allergies) === '["nuts"]' && s.planPrefs.weekdays.join() === '0,2,4');
  await shot(page, '07-draft');

  await page.getByRole('button', { name: /Tailor it with AI/ }).click();
  await page.waitForTimeout(700);
  check('tailor opens with suggestions and the free counter', /Change 0 of 2 free used/.test(await body(page)) && /No fish/.test(await body(page)));
  await page.getByRole('textbox').fill('Grilled fish on Tuesday instead of lentil soup');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByText('What changed').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  st = await body(page);
  check('what changed card, counter moves to 1 of 2', /Tuesday dinner: lentil soup → grilled hammour/.test(st) && /Change 1 of 2 free used/.test(st) && /Free change/.test(st));
  await shot(page, '08-tailor');
  s = await store(page);
  check('draft updated in place', s.programDraft.program.mealPlan.days.find((d) => d.weekday === 2).meals.find((m) => m.slot === 'dinner').name === 'Grilled hammour' && s.programDraft.freeLeft === 1);
  await page.getByRole('button', { name: /^Draft/ }).first().click();
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: 'Start this program' }).click();
  await page.waitForTimeout(1200);
  st = await body(page);
  check('started: one tap, confirmation says what moved', /Your program is on/.test(st) && /now your active schedule/.test(st) && /saved in Schedules/.test(st), st.slice(0, 300));
  await shot(page, '09-started');
  s = await store(page);
  const program = s.savedSchedules.find((x) => x.id === s.activeScheduleId);
  const before = s.savedSchedules.find((x) => x.name.startsWith('Before AI program'));
  check('the program week is a new saved schedule, and active', !!program && program.name.startsWith('AI program') && Object.keys(s.schedule).sort().join() === '0,2,4', JSON.stringify(s.savedSchedules.map((x) => x.name)));
  check('the whole week is replaced: old Monday is rest, Thursday is the program\'s', !s.schedule[1] && s.schedule[4]?.title === 'Full body C', JSON.stringify(s.schedule[4]?.title));
  check('the old week is kept in Schedules', !!before && JSON.stringify(before.days) === JSON.stringify(OLD_WEEK));
  check('targets and meal plan applied', s.targets.calories === 2100 && !!s.activeProgram?.mealPlan && s.activeProgram.scheduleId === program.id);
  check('goal follows the answers', s.profile.goal === 'lose' && s.profile.paceKgPerWeek === 0.5);
  check('draft cleared', s.programDraft === null);

  // Switch back to the old week, from Schedules.
  await page.goto(`${BASE}/schedule-activate?id=${encodeURIComponent(before.id)}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /^Activate/ }).click();
  await page.waitForTimeout(800);
  s = await store(page);
  check('switching back to the old week works', JSON.stringify(s.schedule) === JSON.stringify(OLD_WEEK) && s.activeScheduleId === before.id);
  check('the program and its meal plan stay on', !!s.activeProgram?.mealPlan && s.targets.calories === 2100);
  await page.goto(`${BASE}/program`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('program screen offers the way back to its week', /Switch back to “AI program/.test(await body(page)));

  // Allergies: Profile row, the preferences page, and a warning on a recipe.
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('Profile: Plan preferences · 1 allergy', /Plan preferences/.test(await body(page)) && /1 allergy/.test(await body(page)));
  await tap(page, 'Plan preferences');
  check('Plan preferences shows the saved allergy', (await page.getByRole('checkbox', { name: 'Nuts' }).locator('visible=true').getAttribute('aria-checked')) === 'true');
  await shot(page, '10-preferences');
  await page.goto(`${BASE}/recipe?id=r-almond`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('recipe warns: May contain: Nuts', /May contain: Nuts/.test(await body(page)));
  await shot(page, '11-recipe-warning');
  await ctx.close();

  // Arabic, dark: the thinking screen and the draft.
  ({ ctx, page } = await open({ ...state('ar'), installId: INSTALL }, '/program-build', 'dark'));
  await page.getByRole('button', { name: 'تخطَّ الأسئلة، وابنِ من بياناتي' }).click();
  await page.waitForTimeout(900);
  check('Arabic thinking screen', /Calgym يفكّر/.test(await body(page)));
  await shot(page, '12-thinking-ar-dark');
  await page.waitForURL(/\/program$/, { timeout: 30000 });
  await page.waitForTimeout(800);
  check('Arabic draft', /ابدأ هذا البرنامج/.test(await body(page)));
  await shot(page, '13-draft-ar-dark');
  await ctx.close();
} finally {
  await browser.close();
  process.kill(-server.pid, 'SIGTERM');
  ai.close();
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
