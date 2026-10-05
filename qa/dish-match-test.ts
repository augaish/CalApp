// Dish photo matching: English and Arabic names, the most specific name
// wins, and nothing is matched when nothing fits (the icon stays).
import { dishKeyFor } from '../src/lib/dish-match';

let fails = 0;
const check = (name: string, want: string | undefined) => {
  const got = dishKeyFor(name);
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  "${name}" → ${got ?? '(icon)'}${ok ? '' : `  (want ${want ?? '(icon)'})`}`);
};

check('Chicken Kabsa', 'rice_chicken');
check('chicken mandi with salad', 'rice_chicken');
check('كبسة دجاج', 'rice_chicken');
check('الكبسة', 'rice_chicken');
check('كَبْسَة لحم', 'rice_lamb');
check('Lamb kabsa', 'rice_lamb');
check('Chicken shawarma wrap', 'shawarma_wrap');
check('شاورما دجاج', 'shawarma_wrap');
check('Hummus', 'hummus');
check('حمص', 'hummus');
check('Grilled chicken breast', 'grilled_chicken');
check('Oats with banana', 'oats');
check('Karak tea', 'karak');
check('شاي كرك', 'karak');
check('Boiled eggs', 'eggs_boiled');
check('Protein bar', 'protein_bar');
check('Machboos', 'rice_chicken');
check('Arabic coffee', 'arabic_coffee');
check('قهوة عربية', 'arabic_coffee');
check('Dates', 'dates');
check('تمر', 'dates');
check('Botan light meat tuna in brine', 'tuna');
check('White basmati rice, cooked', 'rice_white');
check('Greek yogurt', 'yogurt');
check('Xylophone soup surprise 3000', 'chicken_soup');
check('Rice with chicken', 'rice_chicken');
check('Chicken with rice', 'rice_chicken');
check('فول مع خبز', 'foul');
check('Mystery item', undefined);
check('', undefined);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
