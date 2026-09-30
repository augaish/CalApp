// Portions of a logged food (src/lib/portion.ts): reopening a meal saved at ½
// and moving the chips must scale from the whole portion, never from the
// already-halved macros.
import {
  parsePortionAmount,
  portionLabelFor,
  portionState,
  settleLoggedPortion,
  shownAmount,
  stepPortion,
  withAmount,
  withMacroEdit,
  withPortion,
} from '/home/user/CalApp/src/lib/portion';
import { portionText } from '/home/user/CalApp/src/lib/recipes';
import type { FoodItem } from '/home/user/CalApp/src/lib/types';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const kcal = (i: FoodItem) => `${i.calories}/${i.proteinG}/${i.carbsG}/${i.fatG}`;

// ── The bug from the recording: rice saved at ½ before bases were stored ──
const legacyHalf: FoodItem = {
  name: 'White basmati rice, cooked',
  portion: '1 large plate (~400 g)',
  calories: 262, proteinG: 6, carbsG: 56, fatG: 2,
  portionMultiplier: 0.5,
};
const s0 = portionState(legacyHalf)!;
check('legacy ½: shows ½ and 200 g', s0.mult === 0.5 && s0.kind === 'weight' && shownAmount(s0) === 200, JSON.stringify(s0));
check('legacy ½: "1" is the full plate', Math.round(s0.base.macros.calories) === 524 && s0.base.amount === 400);
const one = withPortion(legacyHalf, 1);
check('tap 1 → full plate', kcal(one) === '524/12/112/4' && one.portion === '1 large plate (~400 g)', `${kcal(one)} ${one.portion}`);
const oneHalf = withPortion(one, 1.5);
check('then 1½ → 786', oneHalf.calories === 786 && oneHalf.portion === '1½ × 1 large plate (~400 g)', `${kcal(oneHalf)} ${oneHalf.portion}`);
const backHalf = withPortion(oneHalf, 0.5);
check('back to ½ → the same 262 and a ½ label', kcal(backHalf) === '262/6/56/2' && backHalf.portion === '½ large plate (~200 g)', `${kcal(backHalf)} ${backHalf.portion}`);
// Saved and reopened: the stored basis wins over the label that now says ½.
const reopened = portionState(JSON.parse(JSON.stringify(backHalf)))!;
check('reopened after saving: still ½ of a 400 g plate', reopened.mult === 0.5 && reopened.base.amount === 400 && reopened.base.label === '1 large plate (~400 g)');
check('reopened then 1 → 524 again (no drift)', withPortion(JSON.parse(JSON.stringify(backHalf)), 1).calories === 524);

// ── Grams typed ──
const g250 = withAmount(one, 250);
check('250 g → 328 kcal, no chip, "~250 g"', g250.calories === 328 && portionState(g250)!.mult === 0.625 && g250.portion === '~250 g', `${kcal(g250)} ${g250.portion}`);
check('− from 250 g → 240 g', stepPortion(portionState(g250)!, -1) === 0.6);
check('+ from 93 g snaps to 95 on a 5 g grid (base under 100 g)', (() => {
  const s = portionState(withAmount({ ...legacyHalf, portion: '85 g', portionMultiplier: 1 }, 93))!;
  return Math.round(stepPortion(s, 1)! * 85) === 95;
})());

// ── Barcode: "1" is the logged amount ──
const tunaScan: FoodItem = {
  name: 'Botan light meat tuna in brine', portion: '100 g',
  calories: 110, proteinG: 24, carbsG: 0, fatG: 1,
  basePer100: { calories: 110, proteinG: 24, carbsG: 0, fatG: 1 }, gramsEaten: 100,
};
const tuna185 = withAmount(tunaScan, 185);
check('scan: 185 g typed', tuna185.gramsEaten === 185 && tuna185.calories === 204 && tuna185.portion === '185 g', `${kcal(tuna185)} ${tuna185.portion}`);
const logged = settleLoggedPortion(tuna185);
const ls = portionState(logged)!;
check('logged: 1 = 185 g', ls.mult === 1 && ls.base.amount === 185 && logged.portion === '185 g');
const tunaHalf = withPortion(logged, 0.5);
check('½ can → 93 g, 102 kcal', tunaHalf.gramsEaten === 93 && tunaHalf.calories === 102 && tunaHalf.portion === '93 g', `${kcal(tunaHalf)} ${tunaHalf.gramsEaten}`);
const oldBarcode: FoodItem = { ...tuna185 };
delete oldBarcode.portionBase; delete oldBarcode.portionMultiplier;
check('barcode logged before this change: 1 = what was logged', portionState(oldBarcode)!.base.amount === 185 && portionState(oldBarcode)!.mult === 1);

// ── No weight: counted in portions ──
const coffee: FoodItem = { name: 'Arabic coffee', portion: '1 cup', calories: 5, proteinG: 0, carbsG: 1, fatG: 0 };
const cs = portionState(coffee)!;
check('no weight → count kind', cs.kind === 'count' && shownAmount(cs) === 1);
check('+ from 1 → 1¼, − from 1 → ¾', stepPortion(cs, 1) === 1.25 && stepPortion(cs, -1) === 0.75);
check('− stops at ¼', stepPortion(portionState(withPortion(coffee, 0.25))!, -1) === null);
check('2 cups', withPortion(coffee, 2).calories === 10 && withPortion(coffee, 2).portion === '2 × 1 cup');
check('½ cup', withPortion(coffee, 0.5).portion === '½ cup');

// ── Labels ──
check('two gram figures and no total → no weight', parsePortionAmount('2 slices (60 g) + filling (160 g)') === undefined);
check('the approximate whole wins', parsePortionAmount('1 sandwich (~220 g, 2 slices bread 60 g)')?.amount === 220);
check('"2 glasses" is not grams', parsePortionAmount('2 glasses') === undefined);
check('ml', JSON.stringify(parsePortionAmount('1 can (330 ml)')) === '{"amount":330,"unit":"ml"}');
check('Arabic digits and unit', parsePortionAmount('صحن كبير (~٤٠٠ غ)')?.amount === 400);
check('Arabic label at ½ keeps Arabic digits', portionLabelFor({ label: '١ صحن كبير (~٤٠٠ غ)', amount: 400, unit: 'g', macros: { calories: 524, proteinG: 12, carbsG: 112, fatG: 4 } }, 0.5) === '½ صحن كبير (~٢٠٠ غ)');
check('Arabic label without a leading 1', portionLabelFor({ label: 'صحن كبير (~٤٠٠ غ)', amount: 400, unit: 'g', macros: { calories: 1, proteinG: 0, carbsG: 0, fatG: 0 } }, 0.5) === '½ × صحن كبير (~٤٠٠ غ)');

// ── Macros typed by hand stay, and still scale ──
const corrected = withMacroEdit(backHalf, { calories: 300 });
check('typed 300 at ½ keeps ½', corrected.calories === 300 && portionState(corrected)!.mult === 0.5);
check('then 1 → 600', withPortion(corrected, 1).calories === 600 && withPortion(corrected, 1).proteinG === 12);
const tunaEdited = withMacroEdit(logged, { proteinG: 40 });
check('barcode macro typed: per-100 dropped, grams still work', tunaEdited.basePer100 === undefined && withPortion(tunaEdited, 0.5).gramsEaten === 93 && withPortion(tunaEdited, 0.5).proteinG === 20);

// ── Recipe servings ──
const recipe: FoodItem = {
  name: 'Chicken kabsa', portion: '1 serving', calories: 650, proteinG: 40, carbsG: 70, fatG: 20,
  recipeId: 'r1', recipeServings: 1, recipeBasis: { calories: 650, proteinG: 40, carbsG: 70, fatG: 20 },
};
const rHalf = withPortion(recipe, 0.5);
check('recipe ½ serving updates servings, not the label', rHalf.recipeServings === 0.5 && rHalf.calories === 325 && rHalf.portionBase === undefined);
check('recipe back to 1½', withPortion(rHalf, 1.5).calories === 975);

// ── Diary label for meals saved before labels followed the portion ──
const tt = (k: string) => k;
check('old ½ rice reads ½ in the list', portionText(legacyHalf, tt) === '½ large plate (~200 g)', portionText(legacyHalf, tt));
check('new items show their own label', portionText(backHalf, tt) === '½ large plate (~200 g)' && portionText(one, tt) === '1 large plate (~400 g)');

check('bad amount leaves the item alone', withPortion(one, 0) === one && withAmount(coffee, 100) === coffee);

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
