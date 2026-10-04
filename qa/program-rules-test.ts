// The AI program's hard rules (server/src/program-rules.ts, allergens.ts):
// training only on the days picked, no meal naming an allergen (English or
// Arabic), a vegetarian plan without meat — and a tailoring change laid over
// the draft without touching the rest.
import { readFileSync } from 'node:fs';
import { allergensIn, mentions } from '/home/user/CalApp/server/src/allergens';
import { applyRevision, sanitizeProgram, sanitizeRevision } from '/home/user/CalApp/server/src/parse';
import { answersRules, answersText, fitProgram, fitToWeekdays, mealViolations, sanitizeAnswers, stripViolations } from '/home/user/CalApp/server/src/program-rules';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

check('app and server allergen lists are the same file',
  readFileSync('/home/user/CalApp/src/lib/allergens.ts', 'utf8') === readFileSync('/home/user/CalApp/server/src/allergens.ts', 'utf8'));

console.log('=== Allergen words ===');
const yes: [string, string][] = [
  ['nuts', 'Oats with almonds and honey'], ['nuts', 'شوفان باللوز'], ['nuts', 'Peanut butter toast'], ['nuts', 'بقلاوة'],
  ['dairy', 'Greek yogurt bowl'], ['dairy', 'لبنة وزعتر'], ['dairy', 'الجبنة البيضاء'], ['dairy', 'Chicken with cream sauce'],
  ['gluten', 'Whole wheat bread'], ['gluten', 'خبز بر'], ['gluten', 'Chicken shawarma wrap'], ['gluten', 'معكرونة بالدجاج'],
  ['eggs', 'Boiled eggs'], ['eggs', 'بيض مسلوق'], ['eggs', 'شكشوكة'], ['eggs', 'وبيضتين'],
  ['seafood', 'Grilled salmon'], ['seafood', 'سمك هامور مشوي'], ['seafood', 'روبيان'], ['seafood', 'Shrimp fried rice'],
  ['sesame', 'Hummus with olive oil'], ['sesame', 'طحينة'], ['meat', 'Chicken kabsa'], ['meat', 'مندي لحم'],
];
for (const [g, t] of yes) check(`"${t}" → ${g}`, mentions(t, g as never));
const no: [string, string][] = [
  ['eggs', 'Eggplant moussaka'], ['eggs', 'أرز أبيض'], ['nuts', 'Coconut water'], ['nuts', 'Nutmeg latte'],
  ['dairy', 'Peanut butter toast'], ['dairy', 'Coconut milk curry'], ['dairy', 'Lebanese salad'], ['dairy', 'سلطة لبنانية'],
  ['gluten', 'Gluten-free bread'], ['gluten', 'Grilled chicken and rice'], ['seafood', 'Codfish-free?'.replace('Codfish-free?', 'Chicken')],
  ['dairy', 'Lactose-free milk'], ['meat', 'Lentil soup'], ['meat', 'شوربة عدس'], ['dairy', 'مشروب بروتين نباتي'],
];
for (const [g, t] of no) check(`"${t}" is not ${g}`, !mentions(t, g as never));
check('a free-text allergy is matched as written', allergensIn('Kiwi smoothie', [], 'kiwi, mango').join() === 'kiwi');
check('Arabic free text too', allergensIn('عصير مانجو', [], 'مانجو').join() === 'مانجو');

console.log('=== Answers ===');
const a = sanitizeAnswers({ scope: 'both', days: 9, weekdays: [6, 0, 2, 4, 4, 9], sessionMinutes: 60, place: 'gym', experience: 'intermediate',
  mealsPerDay: '3+snack', eatingStyle: 'high_protein', allergies: ['nuts', 'dairy', 'bogus'], allergyOther: 'kiwi', goal: 'lose', pace: 'steady', injuries: 'left knee' })!;
check('weekdays cleaned, sorted, unique', JSON.stringify(a.weekdays) === '[0,2,4,6]', JSON.stringify(a.weekdays));
check('day count follows the weekdays', a.days === 4);
check('unknown allergy ids dropped', JSON.stringify(a.allergies) === '["nuts","dairy"]');
const text = answersText(a);
check('prompt names the days and the pace', /Sunday \(0\), Tuesday \(2\), Thursday \(4\), Saturday \(6\)/.test(text) && /0.5 kg a week/.test(text), text);
check('prompt names the allergies as never', /ALLERGIES \(never include.*nuts, dairy, kiwi/.test(text));
check('rules: only these weekdays', /ONLY on these weekdays: 0, 2, 4, 6/.test(answersRules(a)));
check('junk is no answers', sanitizeAnswers('x') === undefined);

console.log('=== Days ===');
const day = (weekday: number, title: string) => ({ weekday, title, exercises: [{ name: 'Squat', sets: 3, reps: '8' }] });
const fitted = fitToWeekdays([day(1, 'A'), day(2, 'B'), day(3, 'C'), day(5, 'D'), day(6, 'E')], a);
check('kept on chosen days, others moved in order, extras dropped',
  fitted.map((d) => `${d.weekday}${d.title}`).join() === '0A,2B,4C,6E', fitted.map((d) => `${d.weekday}${d.title}`).join());
check('a count without weekdays caps the week', fitToWeekdays([day(0, 'A'), day(1, 'B'), day(2, 'C')], { scope: 'both', days: 2 }).length === 2);

console.log('=== Meals ===');
const meal = (slot: string, name: string, items: string[]) => ({ slot, name, items: items.map((n) => ({ name: n, portion: '1', calories: 300, proteinG: 20, carbsG: 30, fatG: 10 })) });
const raw = {
  summary: 's', durationWeeks: 8, targets: { calories: 2200, proteinG: 160, fatG: 70 },
  schedule: { days: [day(1, 'Push'), day(3, 'Pull')] },
  mealPlan: { days: [
    { weekday: 0, meals: [meal('breakfast', 'Oats with almonds', ['Oats', 'Almonds']), meal('lunch', 'Chicken and rice', ['Chicken', 'Rice'])] },
    { weekday: 1, meals: [meal('breakfast', 'فول مدمس', ['فول']), meal('dinner', 'سلطة مع لبنة', ['خيار', 'لبنة'])] },
  ] },
};
const p = sanitizeProgram(raw)!;
const v = mealViolations(p.mealPlan, a);
check('finds the almond breakfast and the labneh dinner', v.map((x) => `${x.weekday}${x.slot}:${x.hits}`).join() === '0breakfast:nuts,1dinner:dairy', JSON.stringify(v));
const stripped = stripViolations(p.mealPlan, a)!;
check('stripping drops only those meals', stripped.days.map((d) => d.meals.map((m) => m.slot).join('+')).join() === 'lunch,breakfast');
const veg = mealViolations(p.mealPlan, { scope: 'both', eatingStyle: 'vegetarian' });
check('vegetarian rules out the chicken lunch', veg.length === 1 && veg[0].hits.includes('meat'), JSON.stringify(veg));
check('fitProgram moves training to the chosen days', fitProgram(p, a).schedule!.days.map((d) => d.weekday).join() === '0,2');
check('training-only drops the meal plan', !fitProgram(p, { ...a, scope: 'training' }).mealPlan);
check('food-only drops the schedule', !fitProgram(p, { ...a, scope: 'food' }).schedule);
check('a food-only program needs no schedule', !!sanitizeProgram({ ...raw, schedule: undefined }, 'food'));
check('a training program still needs one', !sanitizeProgram({ ...raw, schedule: undefined }, 'training'));

console.log('=== Tailoring ===');
const rev = sanitizeRevision({ reply: 'Done', changes: ['Sunday lunch: chicken → beef'],
  mealPlanDays: [{ weekday: 0, meals: [meal('lunch', 'Beef and rice', ['Beef', 'Rice'])] }] })!;
const next = applyRevision(p, rev);
check('only the named day changes', next.mealPlan!.days[0].meals[0].name === 'Beef and rice' && next.mealPlan!.days[1] === p.mealPlan!.days[1]);
check('schedule and targets untouched', next.schedule === p.schedule && next.targets === p.targets);
const moved = sanitizeRevision({ reply: 'ok', changes: ['x'], weekdays: [1, 1, 3, 8] })!;
check('moved weekdays cleaned', JSON.stringify(moved.weekdays) === '[1,3]');
check('a question with no changes still parses', sanitizeRevision({ reply: 'Yes, 4 days is fine.', changes: [] })?.changes.length === 0);
check('nothing at all is no revision', sanitizeRevision({}) === undefined);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
