// AI Support replies draw **bold** and bullets instead of showing the
// symbols, in English and Arabic. Needs the web build on :8099.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:8099';
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const reply = {
  en: "Good question — it's about grip angle:\n\n- **Horizontal handle**: outer lats and rear delts\n- **Vertical handle**: mid-back\n\n### Tip\n1. Start light",
  ar: 'سؤال جيد:\n\n- **مقبض أفقي**: أعلى الظهر\n- **مقبض عمودي**: منتصف الظهر',
};
const state = (language) => ({
  language, account: { name: 'Sara', provider: 'guest' }, tutorialSeen: true, tourSeen: true, tourSnoozed: 2, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'], aiConsent: true,
  profile: { sex: 'female', birthDate: '1994-03-01', heightCm: 165, weightKg: 70, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2200, proteinG: 120, carbsG: 250, fatG: 70 },
  schedule: {}, savedSchedules: [], activeScheduleId: null, exercises: [], meals: [], weights: [], recipes: [], water: [], workouts: [], fastingHistory: [], skips: {}, dayOrder: {}, dayExtras: {}, occurrences: {},
  coachMessages: [{ role: 'user', content: 'Which handle?', at: new Date().toISOString() }, { role: 'assistant', content: reply[language], at: new Date().toISOString() }],
  notifyPrefs: { restAlertAsked: true }, membershipPrompt: { firstSeenAt: new Date().toISOString(), introShown: true, lastShownAt: new Date().toISOString() },
});
const browser = await chromium.launch();
for (const lang of ['en', 'ar']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((v) => localStorage.setItem('calapp-store', JSON.stringify(v)), { state: state(lang), version: 16 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/coach`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const b = await page.evaluate(() => document.body.innerText);
  check(`${lang}: no ** or ### left in the reply`, !b.includes('**') && !b.includes('###'));
  check(`${lang}: bullets drawn`, (b.match(/•/g) ?? []).length >= 2);
  const bold = await page.getByText(lang === 'en' ? 'Horizontal handle' : 'مقبض أفقي', { exact: true }).first().evaluate((el) => getComputedStyle(el).fontWeight).catch(() => '0');
  check(`${lang}: the bold part is bold`, Number(bold) >= 700, bold);
  await page.screenshot({ path: `/tmp/coach-richtext-${lang}.png` });
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
