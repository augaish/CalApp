// Plan locks end to end: the admin switch turns them on, and a free account
// in the app (web build pointed at a local server) meets the membership sheet
// with the right reason at each paid feature — while what is free, and what
// it already made, stays open. A Pro account passes the same doors.
//
// Needs: the server on :8787 with ADMIN_TOKEN=e2e-admin and a database; a
// web export built with EXPO_PUBLIC_API_URL=http://127.0.0.1:8787 served on
// :8098.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const APP = 'http://127.0.0.1:8098';
const API = 'http://127.0.0.1:8787';
const run = Date.now().toString(36);

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const squash = (s) => s.replace(/\s+/g, ' ');
const admin = (path, body) =>
  fetch(`${API}${path}`, { method: 'POST', headers: { 'x-admin-token': 'e2e-admin', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

const WEEK = { 1: { title: 'Push', exerciseIds: ['bench-press'] } };
const base = (lang, installId, extra = {}) => ({
  language: lang, installId, account: { name: 'Sam', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-01-01', heightCm: 165, weightKg: 62, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 1900, proteinG: 120, carbsG: 210, fatG: 63 },
  schedule: WEEK, savedSchedules: [], activeScheduleId: null, workouts: [], exercises: [], meals: [], weights: [],
  recipes: [], mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
  ...extra,
});

const browser = await chromium.launch();
async function openApp(path, installId, extra = {}, lang = 'en') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state: base(lang, installId, extra), version: 13 });
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const body = async (page) => squash(await page.textContent('body'));
const clickText = async (page, text) => { await page.getByText(text, { exact: true }).last().click(); await page.waitForTimeout(900); };

try {
  // ── Locks off: nothing is locked ──
  await admin('/admin/api/plan-locks', { on: false });
  {
    const { ctx, page } = await openApp('/recipes', `u_lk${run}off`);
    await clickText(page, 'Add my recipe');
    check('locks off: a free account can add a recipe', !page.url().includes('/membership'), page.url());
    await ctx.close();
  }

  // ── Locks on: a free account ──
  await admin('/admin/api/plan-locks', { on: true });
  const FREE_ID = `u_lk${run}free`;
  {
    const { ctx, page } = await openApp('/recipes', FREE_ID);
    check('free: the recipe library still opens', /Recipes/.test(await body(page)));
    await clickText(page, 'Add my recipe');
    check('free: adding a recipe opens the membership sheet', page.url().includes('/membership') && page.url().includes('reason=recipes'), page.url());
    check('free: it says recipes come with Pro', /Writing your own recipes comes with Pro/.test(await body(page)));
    await ctx.close();
  }
  {
    const saved = [{ id: 'sch1', name: 'My week', days: WEEK, createdAt: new Date().toISOString() }];
    const { ctx, page } = await openApp('/schedules', FREE_ID, { savedSchedules: saved, activeScheduleId: 'sch1' });
    check('free: the saved schedule is still there', /My week/.test(await body(page)));
    await clickText(page, 'New schedule');
    check('free: a second saved schedule opens the sheet', page.url().includes('reason=schedules'), page.url());
    check('free: it says Free keeps one', /Free keeps one saved schedule/.test(await body(page)));
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/schedules', FREE_ID);
    await clickText(page, 'Save this week');
    const naming = await page.locator('input[placeholder^="Name it"]').count();
    check('free: the first saved schedule is allowed', !page.url().includes('/membership') && naming > 0, page.url());
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/shopping', FREE_ID);
    check('free: the shopping list gives way to the sheet', page.url().includes('reason=shopping') && /shopping list comes with Pro/.test(await body(page)), page.url());
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/program', FREE_ID);
    await clickText(page, 'Build my program');
    check('free: building a program opens the sheet', page.url().includes('reason=program'), page.url());
    check('free: it names Pro and Pro+', /program builder comes with Pro \(one a month\) and Pro\+/.test(await body(page)));
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/body-reading', FREE_ID);
    check('free: typing a reading in stays open', /Weight/.test(await body(page)) && !page.url().includes('/membership'));
    await clickText(page, 'Read from photo');
    check('free: reading a report with AI opens the sheet', page.url().includes('reason=bodyReading'), page.url());
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/health', FREE_ID);
    await page.getByText('Last 30 days', { exact: true }).first().click();
    await page.waitForTimeout(600);
    await clickText(page, 'Last 90 days');
    check('free: 90 days of history opens the sheet', page.url().includes('reason=trends'), page.url());
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/membership?reason=coachDocs', FREE_ID, {}, 'ar');
    check('ar: the coach-memory reason is in Arabic', /متاح في برو بلس/.test(await body(page)));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // ── Locks on: a Pro account passes ──
  const PRO_ID = `u_lk${run}pro`;
  await admin('/admin/api/plan', { ref: PRO_ID, plan: 'pro', days: 30 });
  {
    const { ctx, page } = await openApp('/recipes', PRO_ID);
    await clickText(page, 'Add my recipe');
    check('pro: adding a recipe goes straight to the editor', page.url().includes('/recipe-edit'), page.url());
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/shopping', PRO_ID);
    check('pro: the shopping list opens', !page.url().includes('/membership'), page.url());
    await ctx.close();
  }
} finally {
  await admin('/admin/api/plan-locks', { on: false });
  await browser.close();
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
