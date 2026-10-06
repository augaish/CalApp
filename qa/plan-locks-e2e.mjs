// The launch offer end to end: the admin switches plan locks on, and the app
// (web build pointed at a local server) behaves per plan — no plan is
// view-only, Essentials shows and allows only its module (plus Health), an
// Essentials member without a focus is asked to choose, and Pro passes.
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
const me = (ref) => fetch(`${API}/api/me`, { headers: { 'x-calgym-user': ref } }).then((r) => r.json());

const WEEK = { 1: { title: 'Push', exerciseIds: ['bench-press'] } };
const base = (lang, installId, extra = {}) => ({
  language: lang, installId, account: { name: 'Sam', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-01-01', heightCm: 165, weightKg: 62, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 1900, proteinG: 120, carbsG: 210, fatG: 63 },
  schedule: WEEK, savedSchedules: [], activeScheduleId: null, workouts: [], exercises: [], meals: [], weights: [],
  recipes: [], mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
  // Seen the after-onboarding offer already, so it doesn't open on its own mid-test.
  membershipPrompt: { firstSeenAt: new Date().toISOString(), introShown: true, lastShownAt: new Date().toISOString() },
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
    check('locks off: anyone can add a recipe', page.url().includes('/recipe-edit'), page.url());
    await ctx.close();
  }

  await admin('/admin/api/plan-locks', { on: true });

  // ── No plan: view-only ──
  const NONE = `u_lk${run}none`;
  {
    const m = await me(NONE);
    check('server: no plan has no AI allowance', m.plan === 'free' && m.limit === 0 && m.locks === true, JSON.stringify({ plan: m.plan, limit: m.limit }));
    const { ctx, page } = await openApp('/', NONE);
    const b = await body(page);
    check('no plan: Overview says records are safe', /Your records are safe/.test(b));
    check('no plan: both modules still there to look back on', /Nutrition today/.test(b));
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/recipes', NONE);
    await clickText(page, 'Add my recipe');
    check('no plan: adding a recipe opens the sheet', page.url().includes('reason=subscribe'), page.url());
    check('no plan: the sheet says start the trial', /Start your free trial to keep logging/.test(await body(page)));
    await ctx.close();
  }
  {
    // The store-level guard: logging water from its own screen does nothing
    // and brings the sheet, even though the screen itself opened.
    const { ctx, page } = await openApp('/water', NONE);
    const add = page.getByText(/^\+?\s*250/).first();
    if (await add.count()) {
      await add.click();
      await page.waitForTimeout(900);
      check('no plan: a write from any screen is refused with the sheet', page.url().includes('reason=subscribe'), page.url());
    } else {
      check('no plan: water screen has a quick-add button to try', false, 'no 250 button found');
    }
    await ctx.close();
  }

  // ── Essentials · Training ──
  const TRAIN = `u_lk${run}train`;
  await admin('/admin/api/plan', { ref: TRAIN, plan: 'essentials', module: 'training', days: 30 });
  {
    const m = await me(TRAIN);
    check('server: Essentials Training, 20 actions', m.plan === 'essentials' && m.module === 'training' && m.limit === 20, JSON.stringify({ plan: m.plan, module: m.module, limit: m.limit }));
    const { ctx, page } = await openApp('/', TRAIN);
    const b = await body(page);
    check('Essentials Training: Overview has no nutrition card', !/Nutrition today/.test(b));
    check('Essentials Training: Overview keeps training, weight and water', /(Your next workout|Rest day|In progress|Done today)/i.test(b) && /Latest weight/i.test(b) && /Water/.test(b));
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/food', TRAIN);
    check('Essentials Training: Food tab shows the banner, history still there', /Food isn't in your plan/.test(await body(page)));
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/recipes', TRAIN);
    await clickText(page, 'Add my recipe');
    check('Essentials Training: adding a recipe opens the sheet for food', page.url().includes('reason=food'), page.url());
    const b = await body(page);
    check('the sheet explains and opens on Pro', /Food isn't part of your plan/.test(b) && /Pro\s*Recommended/.test(b));
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/schedules', TRAIN);
    await clickText(page, 'Save and use');
    const naming = await page.locator('input[placeholder^="Name it"]').count();
    check('Essentials Training: saving a schedule is allowed', !page.url().includes('/membership') && naming > 0, page.url());
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/program', TRAIN);
    await clickText(page, 'Build my program');
    check('Essentials: the program builder is Pro', page.url().includes('reason=program'), page.url());
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/profile', TRAIN);
    const b = await body(page);
    check('Profile: plan, focus and usage in plain words', /Essentials · Training/.test(b) && /0 of 20 used/.test(b) && /resets/.test(b), b.match(/Membership.{0,160}/)?.[0]);
    check('Profile: change focus offered', /Change focus/.test(b));
    await ctx.close();
  }

  // ── Essentials without a focus ──
  const NOFOCUS = `u_lk${run}nofocus`;
  await admin('/admin/api/plan', { ref: NOFOCUS, plan: 'essentials', days: 30 });
  {
    const { ctx, page } = await openApp('/', NOFOCUS);
    check('Essentials without focus: asked to choose', /Choose Food or Training/.test(await body(page)));
    await clickText(page, 'Choose Food or Training');
    check('the card opens the focus screen', page.url().includes('/focus'), page.url());
    await page.getByRole('radio', { name: /Food/ }).first().click();
    await page.getByText('Save', { exact: true }).last().click();
    await page.waitForTimeout(1500);
    const m = await me(NOFOCUS);
    check('choosing Food saves it on the server', m.module === 'food', String(m.module));
    await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const b = await body(page);
    check('Overview now shows food, not training', /Nutrition today/.test(b) && !/Choose Food or Training/.test(b));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // ── Pro passes ──
  // ── A free trial is everything, whichever plan follows ──
  const TRIAL = `u_lk${run}trial`;
  await admin('/admin/api/plan', { ref: TRIAL, plan: 'essentials', module: 'food', days: 30 });
  {
    const hook = await fetch(`${API}/api/billing/revenuecat`, {
      method: 'POST',
      headers: { authorization: 'e2e-hook', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: { id: `ev-${run}-trial`, type: 'INITIAL_PURCHASE', app_user_id: TRIAL, product_id: 'calgym_essentials_monthly', entitlement_ids: ['essentials'], period_type: 'TRIAL', expiration_at_ms: Date.now() + 14 * 864e5, event_timestamp_ms: Date.now() } }),
    }).then((r) => r.json());
    const m = await me(TRIAL);
    check('server: an Essentials Food trial opens Pro features', hook.result === 'grant' && m.plan === 'essentials' && m.trial === true && m.scope === 'all' && m.features.coachDocs === true, JSON.stringify({ hook, plan: m.plan, trial: m.trial, scope: m.scope }));
    const { ctx, page } = await openApp('/', TRIAL);
    const b = await body(page);
    check('trial: Overview shows Food and Training', /Nutrition today/.test(b) && /(Your next workout|Rest day|In progress|Done today)/i.test(b));
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/training', TRIAL);
    check('trial: Training has no "not in your plan" banner', !/Training isn't in your plan/.test(await body(page)));
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/profile', TRIAL);
    const b = await body(page);
    check('trial: Profile says everything is included, then Essentials · Food', /Free trial · everything included/.test(b) && /then Essentials · Food/.test(b), b.match(/Free trial[^.]{0,80}/)?.[0]);
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/profile', TRIAL, {}, 'ar');
    check('ar: the trial line in Arabic', /تجربة مجانية · كل المزايا/.test(await body(page)));
    await ctx.close();
  }

  const PRO = `u_lk${run}pro`;
  await admin('/admin/api/plan', { ref: PRO, plan: 'pro', days: 30 });
  {
    const { ctx, page } = await openApp('/recipes', PRO);
    await clickText(page, 'Add my recipe');
    check('Pro: adding a recipe goes to the editor', page.url().includes('/recipe-edit'), page.url());
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/', PRO);
    const b = await body(page);
    check('Pro: Overview shows both', /Nutrition today/.test(b) && /(Your next workout|Rest day|In progress|Done today)/i.test(b));
    await ctx.close();
  }
  {
    const { ctx, page } = await openApp('/membership?reason=coachDocs', PRO, {}, 'ar');
    check('ar: the coach-memory reason is in Arabic', /إرسال ملفات وصور يتذكرها المدرب/.test(await body(page)));
    await ctx.close();
  }
} finally {
  await admin('/admin/api/plan-locks', { on: false });
  await browser.close();
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
