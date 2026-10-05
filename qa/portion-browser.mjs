// Edit meal portions in the running app: a meal saved at ½ before portion
// bases were stored reopens at ½ of the whole plate, the chips and the grams
// box move together, and what is saved reopens where it was left.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:8099';
const OUT = process.env.SHOTS_OUT;
const today = new Date();
const at = (h) => { const x = new Date(today); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const state = (lang) => ({
  language: lang, account: { name: 'Sara', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1995-01-01', heightCm: 165, weightKg: 62, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 1900, proteinG: 110, carbsG: 200, fatG: 60 },
  meals: [{
    id: 'm1', at: at(13), mealType: 'lunch', items: [
      // As saved by the old editor: macros already halved, label untouched.
      { name: lang === 'ar' ? 'أرز بسمتي أبيض مطبوخ' : 'White basmati rice, cooked', portion: lang === 'ar' ? '1 صحن كبير (~400 غ)' : '1 large plate (~400 g)', calories: 262, proteinG: 6, carbsG: 56, fatG: 2, portionMultiplier: 0.5 },
      { name: lang === 'ar' ? 'تونة في ماء مالح' : 'Botan light meat tuna in brine', portion: '185 g', calories: 204, proteinG: 44, carbsG: 0, fatG: 2, basePer100: { calories: 110, proteinG: 24, carbsG: 0, fatG: 1 }, gramsEaten: 185 },
      { name: lang === 'ar' ? 'قهوة عربية' : 'Arabic coffee', portion: lang === 'ar' ? '1 فنجان' : '1 cup', calories: 5, proteinG: 0, carbsG: 1, fatG: 0 },
    ],
  }],
  workouts: [], exercises: [], weights: [], recipes: [], mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
  schedule: {}, savedSchedules: [], activeScheduleId: null,
});

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

const browser = await chromium.launch();
for (const lang of ['en', 'ar']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state: state(lang), version: 15 });
  const page = await ctx.newPage();
  const open = async () => {
    await page.goto(`${BASE}/meal-edit?id=m1`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
  };
  // Every text box in order: per item, the grams box (weighed foods only) then kcal, protein, carbs, fat.
  // Read as Western digits: in Arabic the boxes show ٠–٩ (checked separately below).
  const shown = () => page.$$eval('input', (els) => els.map((e) => e.value));
  const inputs = async () => (await shown()).map((x) => x.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
  // Chip labels show Arabic-Indic digits in Arabic (١½); compared in Western digits.
  const toAr = (x) => (lang === 'ar' ? x.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]) : x);
  const chipsOn = () => page.$$eval('[aria-selected="true"]', (els) => els.map((e) => e.textContent.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))));
  const chip = (item, label) => page.getByText(toAr(label), { exact: true }).nth(item);

  await open();
  if (lang === 'ar') {
    const raw = await shown();
    const numbers = raw.filter((x) => /^[0-9٠-٩]+$/.test(x));
    check('ar: number boxes show Arabic-Indic digits', numbers.length > 0 && numbers.every((x) => !/[0-9]/.test(x)), raw.join(','));
  }
  let v = await inputs();
  // [name, grams, 4 macros] rice · [name, grams, 4] tuna · [name, 4] coffee
  check(`${lang}: rice reopens at ½ = 200 g, 262 kcal`, v[1] === '200' && v[2] === '262', v.join(','));
  check(`${lang}: tuna reopens at 1 = 185 g`, v[7] === '185' && v[8] === '204', v.join(','));
  check(`${lang}: chips lit ½, 1, 1`, JSON.stringify(await chipsOn()) === JSON.stringify(['½', '1', '1']), JSON.stringify(await chipsOn()));
  if (OUT) await page.screenshot({ path: `${OUT}/edit-meal-${lang}-reopened.png` });

  await chip(0, '1').click();
  v = await inputs();
  check(`${lang}: tap 1 → 400 g, 524 kcal (was stuck at 262)`, v[1] === '400' && v[2] === '524', v.join(','));
  await chip(0, '1½').click();
  v = await inputs();
  check(`${lang}: tap 1½ → 600 g, 786 kcal`, v[1] === '600' && v[2] === '786', v.join(','));

  // Grams typed: 250 g of rice → 328 kcal, no chip lit.
  const grams = page.locator('input').nth(1);
  await grams.fill('250');
  await page.waitForTimeout(200);
  v = await inputs();
  check(`${lang}: 250 g → 328 kcal, no rice chip lit`, v[2] === '328' && (await chipsOn()).length === 2, `${v.join(',')} ${JSON.stringify(await chipsOn())}`);
  await chip(0, '½').click();

  // Tuna ½ via the chip, then + on the coffee.
  await chip(1, '½').click();
  v = await inputs();
  check(`${lang}: tuna ½ → 93 g, 102 kcal`, v[7] === '93' && v[8] === '102', v.join(','));
  const plus = page.getByLabel(lang === 'ar' ? 'زيادة' : 'Increase', { exact: true });
  await plus.nth(2).click();
  await plus.nth(2).click();
  v = await inputs();
  check(`${lang}: coffee + + → 1½ cups, 8 kcal`, v[13] === '8', v.join(','));
  if (OUT) await page.screenshot({ path: `${OUT}/edit-meal-${lang}-changed.png` });

  await page.getByText(lang === 'ar' ? 'حفظ التغييرات' : 'Save changes', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store')).state.meals[0].items);
  check(`${lang}: saved rice ½ with its whole-plate basis`, saved[0].portionMultiplier === 0.5 && Math.round(saved[0].portionBase.macros.calories) === 524 && saved[0].calories === 262, JSON.stringify(saved[0]));
  check(`${lang}: saved rice label follows the portion`, saved[0].portion === (lang === 'ar' ? '½ صحن كبير (~200 غ)' : '½ large plate (~200 g)'), saved[0].portion);
  check(`${lang}: saved tuna 93 g`, saved[1].gramsEaten === 93 && saved[1].portion === '93 g');
  if (OUT) await page.screenshot({ path: `${OUT}/food-${lang}.png` });
  const listText = await page.evaluate(() => document.body.innerText);
  check(`${lang}: Food list shows the ½ label`, listText.includes(lang === 'ar' ? '½ صحن كبير (~٢٠٠ غ)' : '½ large plate (~200 g)'));

  await open();
  v = await inputs();
  check(`${lang}: reopened after save → rice ½ 200 g, tuna ½ 93 g`, v[1] === '200' && v[2] === '262' && v[7] === '93', v.join(','));
  await chip(0, '2').click();
  v = await inputs();
  check(`${lang}: then 2 → 800 g, 1048 kcal`, v[1] === '800' && v[2] === '1048', v.join(','));
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
