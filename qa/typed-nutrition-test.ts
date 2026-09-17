import { extractTypedNutrition, typedMealAnalysis } from '/home/user/CalApp/src/lib/typed-nutrition';
import { itemUnknownNutrients } from '/home/user/CalApp/src/lib/recipes';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

// The user's exact Arabic case: a restaurant dish with menu figures.
const ar = 'وجبة من مطعم فيش فيس: سمك مشوي مع أرز وصلصة، 709 سعرة حرارية, 23 g protein, 91 g carbs, 65 g fat';
const a = extractTypedNutrition(ar);
check('Arabic description: calories found', a?.calories === 709, JSON.stringify(a));
check('  protein', a?.proteinG === 23);
check('  carbs', a?.carbsG === 91);
check('  fat', a?.fatG === 65);

const arDigits = extractTypedNutrition('برجر دجاج ٧٠٩ سعرة، بروتين ٢٣ غ، كربوهيدرات ٩١ غ، دهون ٦٥٫٥ غ');
check('Arabic-Indic digits and label-first order', arDigits?.calories === 709 && arDigits?.proteinG === 23 && arDigits?.carbsG === 91 && arDigits?.fatG === 65.5, JSON.stringify(arDigits));

const en = extractTypedNutrition('Big bowl, 520 kcal, protein: 40g, carbs 30 g, 12.5 g fat');
check('English mixed forms', en?.calories === 520 && en?.proteinG === 40 && en?.carbsG === 30 && en?.fatG === 12.5, JSON.stringify(en));

const onlyKcal = extractTypedNutrition('chicken shawarma plate about 650 calories');
check('calories only: macros undefined', onlyKcal?.calories === 650 && onlyKcal?.proteinG === undefined && onlyKcal?.fatG === undefined, JSON.stringify(onlyKcal));

check('no calories stated → null', extractTypedNutrition('2 boiled eggs and toast with 20 g protein') === null);

const analysis = typedMealAnalysis(ar, a!, 'typed');
const item = analysis.items[0];
check('analysis item keeps the typed figures', item.calories === 709 && item.proteinG === 23 && item.carbsG === 91 && item.fatG === 65);
check('  fully stated → no incomplete flags', itemUnknownNutrients(item).length === 0);
check('  name is the first clause, ≤60 chars', item.name.length > 0 && item.name.length <= 60, item.name);

const partial = typedMealAnalysis('shawarma 650 kcal', onlyKcal!, 'typed');
check('calories-only item flags the three macros unknown, never zero-as-known', JSON.stringify(itemUnknownNutrients(partial.items[0])) === JSON.stringify(['proteinG', 'carbsG', 'fatG']));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
