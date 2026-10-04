// Profile is about you (account, plan, goals, help); Settings, behind the
// gear, is about the app. Every row that used to be on Profile still has a
// home, and each one opens what it did before. English and Arabic.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:8099';
const base = (lang, account) => ({
  language: lang, account, tutorialSeen: true, tourSeen: true, tourSnoozed: 2, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-03-01', heightCm: 166, weightKg: 63, activityLevel: 'moderate', goal: 'lose' },
  targets: { calories: 1850, proteinG: 120, carbsG: 190, fatG: 60 },
  meals: [], workouts: [], weights: [], exercises: [], schedule: {}, savedSchedules: [], water: [], recipes: [],
});
const SARA = { name: 'Sara', email: 'sara@example.com', provider: 'email' };
const GUEST = { name: 'Guest', provider: 'guest' };
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const squash = (s) => s.replace(/\s+/g, ' ');
const browser = await chromium.launch();
async function open(lang, account, path = '/profile') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state: base(lang, account), version: 16 });
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const body = async (page) => squash(await page.textContent('body'));

console.log('=== Profile (English, signed in) ===');
let { ctx, page } = await open('en', SARA);
let b = await body(page);
check('name, email, and the edit route', /Sara/.test(b) && /sara@example\.com/.test(b));
check('initial instead of the person icon', (await page.getByText('S', { exact: true }).count()) >= 1);
check('membership card, food targets, plan preferences, help, sign out', /AI actions this month/.test(b) && /Food targets/.test(b) && /1850 kcal/.test(b) && /Plan preferences/.test(b) && /Help & feedback/.test(b) && /Log out/.test(b));
check('moved off Profile: language, units, appearance, notifications, privacy, export, redeem', !/Language|Units|Appearance|Notifications|Privacy|Export my data|Redeem a code/.test(b), b.match(/Language|Units|Appearance|Notifications|Privacy|Export my data|Redeem a code/)?.[0]);
check('no "Signed in" pill any more', !/Signed in/.test(b));
check('header has the Settings gear (AI Support stays on the tabs)', (await page.getByRole('button', { name: 'Settings' }).count()) === 1 && (await page.getByRole('button', { name: 'AI Support' }).count()) === 0);
check('header still has Back', (await page.getByRole('button', { name: 'Back' }).count()) >= 1);
await page.getByRole('button', { name: 'Settings' }).click(); await page.waitForTimeout(800);
check('gear opens Settings', page.url().endsWith('/settings'), page.url());
b = await body(page);
check('Settings: language, units, appearance, notifications', /Language\s*English/.test(b) && /Units\s*kg \/ cm/.test(b) && /Appearance\s*Light/.test(b) && /Notifications/.test(b), b.slice(0, 300));
check('Settings: privacy & data and redeem', /Privacy & data/.test(b) && /Redeem a code/.test(b));
check('Settings back button says Profile', (await page.getByRole('button', { name: 'Profile' }).count()) >= 1);
await page.getByText('Notifications', { exact: true }).click(); await page.waitForTimeout(800);
check('Notifications opens its screen', page.url().includes('/notifications'), page.url());
await page.goBack(); await page.waitForTimeout(800);
await page.getByText('Redeem a code', { exact: true }).click(); await page.waitForTimeout(800);
check('Redeem a code opens the redeem screen', page.url().includes('/redeem'), page.url());
await page.goBack(); await page.waitForTimeout(800);
await page.getByText('Privacy & data', { exact: true }).click(); await page.waitForTimeout(800);
b = await body(page);
check('Privacy & data: titled so, with Export my data', page.url().includes('/privacy') && /Privacy & data/.test(b) && /Export my data/.test(b) && /Delete my account|Delete account/.test(b), b.slice(0, 200));
check('no page errors', page.errors.length === 0, page.errors.join(' | '));
await ctx.close();

console.log('=== Guest ===');
({ ctx, page } = await open('en', GUEST));
b = await body(page);
check('guest: Guest, device line, sync row, no sign out', /Guest/.test(b) && /Using Calgym on this device/.test(b) && /Save and sync my data/.test(b) && !/Log out/.test(b));
await ctx.close();

console.log('=== Arabic ===');
({ ctx, page } = await open('ar', SARA));
b = await body(page);
check('ar: Profile in Arabic with the help row', /المساعدة والملاحظات/.test(b) && /تسجيل الخروج/.test(b));
check('ar: gear labelled', (await page.getByRole('button', { name: 'الإعدادات' }).count()) === 1);
await page.getByRole('button', { name: 'الإعدادات' }).click(); await page.waitForTimeout(800);
b = await body(page);
check('ar: Settings rows in Arabic', /اللغة/.test(b) && /الخصوصية والبيانات/.test(b), b.slice(0, 200));
await ctx.close();

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
