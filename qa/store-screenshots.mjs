// App Store screenshots (iPhone 6.9", 1290 × 2796) in English and Arabic,
// from the exported web app with realistic sample data. Run against
// `npx expo export -p web` served on :8099 (qa/serve.mjs).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { data, now } from './sample-state.mjs';
// The e2e build (API on :8787) so the plan and allowance are real; the
// sample installs are granted Pro through the admin API first.
const BASE = process.env.SHOTS_BASE ?? 'http://127.0.0.1:8098';
const API = process.env.SHOTS_API ?? 'http://127.0.0.1:8787';
for (const lang of ['en', 'ar']) {
  await fetch(`${API}/admin/api/plan`, { method: 'POST', headers: { 'x-admin-token': 'e2e-admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: `u_shots_${lang}`, plan: 'pro', days: 365 }) }).catch(() => {});
}
// SHOTS_SIZE: '6.9' (default, 1290 × 2796), '6.5' (Apple's 6.5", 1284 × 2778)
// or 'play' (Google Play phone, 1080 × 1920: the Play Console asks for 9:16).
// SHOTS_OUT overrides the folder.
const SIZE = process.env.SHOTS_SIZE ?? '6.9';
const VIEWS = { '6.9': { width: 430, height: 932 }, '6.5': { width: 428, height: 926 }, play: { width: 360, height: 640 } };
const DEFAULT_OUT = { '6.9': './docs/store-screenshots', '6.5': './docs/store-screenshots-6.5', play: './docs/play-screenshots' };
const OUT = process.env.SHOTS_OUT ?? DEFAULT_OUT[SIZE];
const VIEW = VIEWS[SIZE];

const SHOTS = [
  ['01-overview', '/'],
  ['02-food', '/food'],
  ['03-recipe', '/recipe?id=r-kabsa'],
  ['04-meal-plan', '/food?tab=plan'],
  ['05-training', '/training'],
  ['06-workout-rest', '/session'],
  ['07-health', '/health'],
  ['08-coach', '/coach'],
  // The plans a new person sees (store preview prices), and the moment after subscribing.
  ['09-plans', '/membership?storePreview=1', { installId: 'u_shots_free', membershipPrompt: undefined }],
  ['10-welcome', '/plan-welcome?tier=pro&focus=both&trial=14'],
];

const browser = await chromium.launch();
for (const lang of ['en', 'ar']) {
  fs.mkdirSync(`${OUT}/${lang}`, { recursive: true });
  for (const [name, path, extra] of SHOTS) {
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 3, colorScheme: 'light', locale: lang === 'ar' ? 'ar-SA' : 'en-US' });
    await ctx.addInitScript((s) => localStorage.setItem('calapp-store', JSON.stringify(s)), { state: { ...data(lang, path === '/session'), ...(extra ?? {}) }, version: 16 });
    const page = await ctx.newPage();
    await page.clock.install({ time: now });
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(path.startsWith('/plan-welcome') ? 4200 : 1800);
    await page.screenshot({ path: `${OUT}/${lang}/${name}.png` });
    console.log(lang, name, page.url().replace(BASE, ''));
    await ctx.close();
  }
}
await browser.close();
