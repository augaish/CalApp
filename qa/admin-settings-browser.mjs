// Admin settings say what happened: Monthly AI allowance and Action costs
// confirm the change (or that nothing changed), refuse bad numbers without
// sending them, flag unsaved edits, and really change what the app gets;
// plan locks and the sponsor slot confirm too. The AI tab's red number
// counts new AI failures and clears with "Mark as seen".
//
// Needs: the server on :8787 with ADMIN_TOKEN=e2e-admin and the local
// database (psql on /opt/calgym-pg/pgsock:5433).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
const API = 'http://127.0.0.1:8787';
const run = Date.now().toString(36);
const sql = (q) => execFileSync('/usr/lib/postgresql/16/bin/psql', ['-h', '/opt/calgym-pg/pgsock', '-p', '5433', '-U', 'postgres', '-d', 'calgym', '-Atc', q]).toString().trim();
const admin = (path, body) => fetch(`${API}${path}`, { method: body ? 'POST' : 'GET', headers: { 'x-admin-token': 'e2e-admin', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };

// Keep what was there, to put it back.
const start = await admin('/admin/api/data');
const keep = { limits: { ...start.limits, trial: start.trialLimit }, weights: start.weights, locks: !!start.planLocks, sponsor: start.sponsor };

// One fresh AI failure; anything older is marked seen first.
await admin('/admin/api/ai-failures/seen', {});
await new Promise((r) => setTimeout(r, 20));
sql(`INSERT INTO ai_failures (route, code, detail) VALUES ('/api/refine-meal', 'analysis_failed', 'test ${run}')`);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept());
await page.goto(`${API}/admin`, { waitUntil: 'networkidle' });
await page.fill('#token', 'e2e-admin');
await page.keyboard.press('Enter');
await page.waitForSelector('#p-overview:not([hidden])', { state: 'visible' });
await page.waitForFunction(() => !document.querySelector('#ov_checklist .empty'));

// ── AI badge ──
check('AI tab shows 1 new failure', (await page.textContent('#b-ai')).trim() === '1' && !(await page.getAttribute('#b-ai', 'class')).includes('hide'));
check('Overview explains it', /1 new AI failure in the last 24 hours/.test(await page.textContent('#ov_attention')));
await page.click('#t-ai');
check('AI failures card explains the number', /1 new failure since you last looked/.test(await page.textContent('#aif_seen_text')) && await page.isVisible('#aif_seen_row'));
check('the failure itself is listed', (await page.textContent('#aif_recent')).includes(`test ${run}`));
await page.click('#aif_seen_row button');
await page.waitForFunction(() => document.getElementById('b-ai').classList.contains('hide'));
check('Mark as seen clears the red number', (await page.textContent('#b-ai')).trim() === '');
check('the button goes away', !(await page.isVisible('#aif_seen_row')));
check('the failure stays listed for reference', (await page.textContent('#aif_recent')).includes(`test ${run}`));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.querySelector('#ov_checklist .empty'));
check('still clear after a reload', (await page.getAttribute('#b-ai', 'class')).includes('hide'));
sql(`INSERT INTO ai_failures (route, code, detail) VALUES ('/api/describe-meal', 'analysis_failed', 'later ${run}')`);
await page.click('button:has-text("Refresh")');
await page.waitForFunction(() => document.getElementById('b-ai').textContent.trim() === '1', null, { timeout: 5000 }).catch(() => {});
check('a new failure after that shows again', (await page.textContent('#b-ai')).trim() === '1');
await admin('/admin/api/ai-failures/seen', {});

// ── Monthly AI allowance ──
await page.click('#t-membership');
await page.fill('#lim_free', String(keep.limits.free + 3));
check('editing says unsaved', /Unsaved changes/.test(await page.textContent('#lim_msg')));
await page.click('button[onclick="saveLimits()"]');
await page.waitForFunction(() => /^Saved/.test(document.getElementById('lim_msg').textContent));
const limMsg = await page.textContent('#lim_msg');
check('allowance: says what changed', limMsg.includes(`Free ${keep.limits.free} → ${keep.limits.free + 3}`), limMsg);
check('allowance: green', (await page.getAttribute('#lim_msg', 'class')).includes('good'));
const me = await (await fetch(`${API}/api/me`, { headers: { 'x-calgym-user': `u_set${run}` } })).json();
check('allowance: the app really gets the new number', me.limit === keep.limits.free + 3 || me.plan !== 'free', `limit ${me.limit}`);
await page.click('button[onclick="saveLimits()"]');
await page.waitForFunction(() => /Nothing changed/.test(document.getElementById('lim_msg').textContent));
check('allowance: saving again says nothing changed', true);
await page.fill('#lim_pro', '');
await page.fill('#lim_trial', '-2');
await page.click('button[onclick="saveLimits()"]');
await page.waitForFunction(() => /Not saved/.test(document.getElementById('lim_msg').textContent));
const limBad = await page.textContent('#lim_msg');
check('allowance: blank or negative is refused, naming the boxes', /Pro, Free trial need a whole number/.test(limBad) && (await page.getAttribute('#lim_msg', 'class')).includes('bad'), limBad);
check('allowance: nothing was sent', (await admin('/admin/api/data')).limits.pro === keep.limits.pro);

// ── Action costs ──
await page.fill('#w_coach', String((keep.weights.coach || 1) + 1));
await page.click('button[onclick="saveWeights()"]');
await page.waitForFunction(() => /^Saved/.test(document.getElementById('w_msg').textContent));
const wMsg = await page.textContent('#w_msg');
check('costs: says what changed', wMsg.includes(`Coach msg ${keep.weights.coach || 1} → ${(keep.weights.coach || 1) + 1}`), wMsg);
check('costs: really saved', (await admin('/admin/api/data')).weights.coach === (keep.weights.coach || 1) + 1);
await page.fill('#w_meal', '80');
await page.click('button[onclick="saveWeights()"]');
await page.waitForFunction(() => /Not saved/.test(document.getElementById('w_msg').textContent));
check('costs: out of range is refused', /Meal photo needs a whole number from 1 to 50/.test(await page.textContent('#w_msg')));

// ── Plan locks and sponsor ──
await page.click('#locks_on');
await page.click('button[onclick="saveLocks()"]');
await page.waitForFunction(() => /^Saved|^Not saved/.test(document.getElementById('locks_done').textContent));
const lMsg = await page.textContent('#locks_done');
check('locks: confirms the new state', new RegExp(`Plan locks are now ${keep.locks ? 'OFF' : 'ON'}`).test(lMsg), lMsg);
await page.click('#t-content');
await page.fill('#sp_link', 'http://not-secure.example.com');
await page.click('button:has-text("Save sponsor")');
await page.waitForFunction(() => /^Saved/.test(document.getElementById('sp_msg').textContent));
check('sponsor: warns when a link is dropped', /link URL was cleared: it must start with https/.test(await page.textContent('#sp_msg')));

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();

// Put everything back.
await admin('/admin/api/limits', keep.limits);
await admin('/admin/api/weights', keep.weights);
await admin('/admin/api/plan-locks', { on: keep.locks });
if (keep.sponsor) await admin('/admin/api/sponsor', keep.sponsor);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
