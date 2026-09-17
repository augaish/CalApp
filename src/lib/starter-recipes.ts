import { resolveIngredientKey } from './ingredients';
import type { Language, Recipe, RecipeAisle, RecipeIngredient } from './types';

/*
 * The Calgym starter collection (section 15): a small, reviewed set of Gulf
 * and everyday dishes that is useful before anyone generates anything, and
 * that works without a network connection or a photo. Every ingredient has
 * a quantity, a raw/cooked state and a reference nutrition value computed
 * from standard per-100 g tables, so the totals are auditable rather than
 * invented. Ids are stable (`calgym:…`); a starter is copied into the
 * private library the first time it is planned, logged, kept or edited, and
 * the original is never rewritten.
 */

type Per100 = readonly [kcal: number, protein: number, carbs: number, fat: number];

/** Reference values per 100 g (raw unless stated). */
const REF = {
  basmatiDry: [350, 7.5, 78, 0.6] as Per100,
  bulgurDry: [342, 12, 76, 1.3] as Per100,
  oats: [380, 13, 67, 7] as Per100,
  chickenThigh: [120, 20, 0, 4] as Per100,
  chickenBreast: [110, 23, 0, 1.5] as Per100,
  salmon: [208, 20, 0, 13] as Per100,
  tunaWater: [116, 26, 0, 1] as Per100,
  eggs: [155, 13, 1.1, 11] as Per100,
  greekYogurt: [73, 10, 4, 2] as Per100,
  labneh: [160, 8, 4, 13] as Per100,
  feta: [265, 14, 4, 21] as Per100,
  milk: [60, 3.3, 4.8, 3.2] as Per100,
  redLentilsDry: [350, 25, 60, 1] as Per100,
  chickpeasCooked: [140, 7, 22, 2.5] as Per100,
  tahini: [595, 17, 21, 54] as Per100,
  onion: [40, 1.1, 9, 0.1] as Per100,
  tomato: [18, 0.9, 3.9, 0.2] as Per100,
  cucumber: [15, 0.7, 3.6, 0.1] as Per100,
  carrot: [41, 0.9, 10, 0.2] as Per100,
  potato: [77, 2, 17, 0.1] as Per100,
  cauliflower: [25, 1.9, 5, 0.3] as Per100,
  spinach: [23, 2.9, 3.6, 0.4] as Per100,
  banana: [89, 1.1, 23, 0.3] as Per100,
  dates: [280, 2.5, 75, 0.4] as Per100,
  garlic: [149, 6.4, 33, 0.5] as Per100,
  lemonJuice: [22, 0.4, 7, 0.2] as Per100,
  oliveOil: [884, 0, 0, 100] as Per100,
  honey: [304, 0.3, 82, 0] as Per100,
  almonds: [579, 21, 22, 50] as Per100,
  wholeWheatBread: [250, 12, 42, 3.5] as Per100,
  wholeWheatWrap: [300, 10, 50, 6] as Per100,
  spiceMix: [300, 10, 50, 10] as Per100,
} as const;

type IngredientSpec = {
  en: string;
  ar: string;
  ref: Per100;
  amount: number;
  unit?: 'g' | 'ml';
  state?: 'raw' | 'cooked';
  aisle: RecipeAisle;
  /** A household measure shown beside grams ("1 cup dry"). */
  measure?: { en: string; ar: string };
};

type StarterSpec = {
  id: string;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  ingredients: IngredientSpec[];
  steps: { en: string[]; ar: string[] };
};

const round1 = (n: number) => Math.round(n * 10) / 10;

function ingredient(spec: IngredientSpec, lang: Language): RecipeIngredient {
  const f = spec.amount / 100;
  return {
    name: lang === 'ar' ? spec.ar : spec.en,
    key: resolveIngredientKey(spec.en),
    amount: spec.amount,
    unit: spec.unit ?? 'g',
    state: spec.state ?? 'raw',
    measure: spec.measure ? (lang === 'ar' ? spec.measure.ar : spec.measure.en) : undefined,
    calories: round1(spec.ref[0] * f),
    proteinG: round1(spec.ref[1] * f),
    carbsG: round1(spec.ref[2] * f),
    fatG: round1(spec.ref[3] * f),
    aisle: spec.aisle,
  };
}

const I = {
  basmati: (g: number): IngredientSpec => ({ en: 'Basmati rice', ar: 'أرز بسمتي', ref: REF.basmatiDry, amount: g, aisle: 'pantry', measure: { en: 'dry', ar: 'جاف' } }),
  chickenThigh: (g: number): IngredientSpec => ({ en: 'Chicken thighs', ar: 'أفخاذ دجاج', ref: REF.chickenThigh, amount: g, aisle: 'meat' }),
  chickenBreast: (g: number): IngredientSpec => ({ en: 'Chicken breast', ar: 'صدر دجاج', ref: REF.chickenBreast, amount: g, aisle: 'meat' }),
  onion: (g: number): IngredientSpec => ({ en: 'Onion', ar: 'بصل', ref: REF.onion, amount: g, aisle: 'produce' }),
  tomato: (g: number): IngredientSpec => ({ en: 'Tomatoes', ar: 'طماطم', ref: REF.tomato, amount: g, aisle: 'produce' }),
  oliveOil: (g: number): IngredientSpec => ({ en: 'Olive oil', ar: 'زيت زيتون', ref: REF.oliveOil, amount: g, aisle: 'pantry' }),
  garlic: (g: number): IngredientSpec => ({ en: 'Garlic', ar: 'ثوم', ref: REF.garlic, amount: g, aisle: 'produce' }),
  lemon: (ml: number): IngredientSpec => ({ en: 'Lemon juice', ar: 'عصير ليمون', ref: REF.lemonJuice, amount: ml, unit: 'ml', aisle: 'produce' }),
  spices: (g: number, en = 'Mixed spices', ar = 'بهارات مشكلة'): IngredientSpec => ({ en, ar, ref: REF.spiceMix, amount: g, aisle: 'spices' }),
};

const STARTERS: StarterSpec[] = [
  {
    id: 'calgym:chicken-kabsa',
    name: { en: 'Chicken kabsa', ar: 'كبسة دجاج' },
    description: { en: 'A flavourful rice dish with spiced chicken.', ar: 'طبق أرز بنكهة غنية مع دجاج متبّل.' },
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 45,
    ingredients: [I.basmati(400), I.chickenThigh(600), I.onion(160), I.tomato(200), { en: 'Carrot', ar: 'جزر', ref: REF.carrot, amount: 100, aisle: 'produce' }, I.oliveOil(30), I.spices(10, 'Kabsa spices', 'بهارات كبسة')],
    steps: {
      en: ['Brown the chicken in the oil, then set aside.', 'Soften the onion; add tomato, carrot and spices.', 'Add the rinsed rice and 700 ml water; return the chicken on top.', 'Cover and simmer on low for 25 minutes until the rice is tender.'],
      ar: ['حمّر الدجاج في الزيت ثم أخرجه.', 'ذبّل البصل وأضف الطماطم والجزر والبهارات.', 'أضف الأرز المغسول و700 مل ماء وضع الدجاج فوقه.', 'غطّ واطبخ على نار هادئة 25 دقيقة حتى ينضج الأرز.'],
    },
  },
  {
    id: 'calgym:lentil-stew',
    name: { en: 'Home-style lentil stew', ar: 'شوربة عدس بيتية' },
    description: { en: 'A hearty and wholesome lentil stew.', ar: 'شوربة عدس مغذية ودافئة.' },
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 25,
    ingredients: [{ en: 'Red lentils', ar: 'عدس أحمر', ref: REF.redLentilsDry, amount: 320, aisle: 'pantry', measure: { en: 'dry', ar: 'جاف' } }, I.tomato(400), I.onion(160), I.oliveOil(40), I.garlic(10), I.spices(8, 'Cumin & turmeric', 'كمون وكركم'), I.lemon(30)],
    steps: {
      en: ['Rinse the lentils.', 'Soften the onion and garlic in the oil, then add the tomatoes and spices.', 'Add the lentils and 1.2 litres of water; simmer until tender.', 'Finish with lemon juice.'],
      ar: ['اغسل العدس.', 'ذبّل البصل والثوم في الزيت ثم أضف الطماطم والبهارات.', 'أضف العدس و1.2 لتر ماء واطبخ حتى ينضج.', 'أضف عصير الليمون في النهاية.'],
    },
  },
  {
    id: 'calgym:egg-labneh-wrap',
    name: { en: 'Egg & labneh wrap', ar: 'لفافة بيض ولبنة' },
    description: { en: 'A quick and satisfying breakfast wrap.', ar: 'لفافة إفطار سريعة ومشبعة.' },
    servings: 1,
    prepMinutes: 10,
    cookMinutes: 5,
    ingredients: [{ en: 'Eggs', ar: 'بيض', ref: REF.eggs, amount: 100, aisle: 'dairy', measure: { en: '2 eggs', ar: 'بيضتان' } }, { en: 'Labneh', ar: 'لبنة', ref: REF.labneh, amount: 60, aisle: 'dairy' }, { en: 'Whole-wheat wrap', ar: 'خبز تورتيلا أسمر', ref: REF.wholeWheatWrap, amount: 60, aisle: 'bakery', measure: { en: '1 wrap', ar: 'رغيف واحد' } }, { en: 'Cucumber', ar: 'خيار', ref: REF.cucumber, amount: 50, aisle: 'produce' }, I.oliveOil(5)],
    steps: {
      en: ['Scramble the eggs in the oil.', 'Spread the labneh on the wrap, add eggs and cucumber.', 'Roll tightly and cut in half.'],
      ar: ['اخفق البيض واطبخه في الزيت.', 'ادهن اللبنة على الخبز وأضف البيض والخيار.', 'لفّ بإحكام واقطع نصفين.'],
    },
  },
  {
    id: 'calgym:yogurt-fruit-bowl',
    name: { en: 'Yogurt & fruit bowl', ar: 'زبادي بالفواكه' },
    description: { en: 'Greek yogurt with banana, oats and almonds.', ar: 'زبادي يوناني مع موز وشوفان ولوز.' },
    servings: 1,
    prepMinutes: 5,
    cookMinutes: 0,
    ingredients: [{ en: 'Greek yogurt', ar: 'زبادي يوناني', ref: REF.greekYogurt, amount: 200, aisle: 'dairy' }, { en: 'Banana', ar: 'موز', ref: REF.banana, amount: 120, aisle: 'produce', measure: { en: '1 banana', ar: 'موزة واحدة' } }, { en: 'Oats', ar: 'شوفان', ref: REF.oats, amount: 30, aisle: 'pantry' }, { en: 'Honey', ar: 'عسل', ref: REF.honey, amount: 15, aisle: 'pantry' }, { en: 'Almonds', ar: 'لوز', ref: REF.almonds, amount: 15, aisle: 'pantry' }],
    steps: { en: ['Spoon the yogurt into a bowl.', 'Top with sliced banana, oats and almonds; drizzle the honey.'], ar: ['ضع الزبادي في وعاء.', 'أضف شرائح الموز والشوفان واللوز ورشّ العسل.'] },
  },
  {
    id: 'calgym:tuna-sandwich',
    name: { en: 'Tuna sandwich', ar: 'ساندويتش تونة' },
    description: { en: 'Tuna, labneh and cucumber on whole-wheat bread.', ar: 'تونة ولبنة وخيار على خبز أسمر.' },
    servings: 1,
    prepMinutes: 5,
    cookMinutes: 0,
    ingredients: [{ en: 'Tuna in water', ar: 'تونة بالماء', ref: REF.tunaWater, amount: 100, aisle: 'pantry', measure: { en: '1 can, drained', ar: 'علبة مصفّاة' } }, { en: 'Whole-wheat bread', ar: 'خبز أسمر', ref: REF.wholeWheatBread, amount: 80, aisle: 'bakery', measure: { en: '2 slices', ar: 'شريحتان' } }, { en: 'Cucumber', ar: 'خيار', ref: REF.cucumber, amount: 50, aisle: 'produce' }, { en: 'Labneh', ar: 'لبنة', ref: REF.labneh, amount: 30, aisle: 'dairy' }, I.lemon(10)],
    steps: { en: ['Mix the tuna with labneh and lemon.', 'Fill the bread with the tuna and cucumber.'], ar: ['اخلط التونة مع اللبنة والليمون.', 'احشِ الخبز بالتونة والخيار.'] },
  },
  {
    id: 'calgym:grilled-fish-rice',
    name: { en: 'Grilled fish & rice', ar: 'سمك مشوي مع أرز' },
    description: { en: 'Lemon-garlic salmon with basmati rice.', ar: 'سلمون بالليمون والثوم مع أرز بسمتي.' },
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 25,
    ingredients: [{ en: 'Salmon', ar: 'سلمون', ref: REF.salmon, amount: 300, aisle: 'meat' }, I.basmati(150), I.lemon(30), I.oliveOil(15), I.garlic(10), I.spices(6)],
    steps: {
      en: ['Cook the rice in 300 ml water.', 'Rub the salmon with oil, garlic, spices and lemon.', 'Grill or bake at 200 °C for 12–15 minutes.'],
      ar: ['اطبخ الأرز في 300 مل ماء.', 'ادعك السلمون بالزيت والثوم والبهارات والليمون.', 'اشوِه أو اخبزه على 200 درجة 12–15 دقيقة.'],
    },
  },
  {
    id: 'calgym:overnight-oats',
    name: { en: 'Overnight oats with dates', ar: 'شوفان بالتمر' },
    description: { en: 'Oats soaked in milk with dates and almonds.', ar: 'شوفان منقوع في الحليب مع تمر ولوز.' },
    servings: 1,
    prepMinutes: 5,
    cookMinutes: 0,
    ingredients: [{ en: 'Oats', ar: 'شوفان', ref: REF.oats, amount: 60, aisle: 'pantry' }, { en: 'Milk', ar: 'حليب', ref: REF.milk, amount: 200, unit: 'ml', aisle: 'dairy' }, { en: 'Dates', ar: 'تمر', ref: REF.dates, amount: 30, aisle: 'produce', measure: { en: '3 dates', ar: '3 تمرات' } }, { en: 'Almonds', ar: 'لوز', ref: REF.almonds, amount: 10, aisle: 'pantry' }],
    steps: { en: ['Stir the oats into the milk with the chopped dates.', 'Refrigerate overnight; top with almonds.'], ar: ['اخلط الشوفان مع الحليب والتمر المقطّع.', 'ضعه في الثلاجة طوال الليل وأضف اللوز.'] },
  },
  {
    id: 'calgym:chickpea-salad',
    name: { en: 'Chickpea & cucumber salad', ar: 'سلطة حمص وخيار' },
    description: { en: 'Chickpeas, tomato, cucumber and feta with lemon.', ar: 'حمص وطماطم وخيار وجبنة فيتا مع الليمون.' },
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 0,
    ingredients: [{ en: 'Chickpeas', ar: 'حمص مسلوق', ref: REF.chickpeasCooked, amount: 300, state: 'cooked', aisle: 'pantry', measure: { en: '1 can, drained', ar: 'علبة مصفّاة' } }, { en: 'Cucumber', ar: 'خيار', ref: REF.cucumber, amount: 200, aisle: 'produce' }, I.tomato(200), { en: 'Feta', ar: 'جبنة فيتا', ref: REF.feta, amount: 60, aisle: 'dairy' }, I.oliveOil(20), I.lemon(30)],
    steps: { en: ['Dice the cucumber and tomato.', 'Toss with chickpeas, oil and lemon; crumble the feta on top.'], ar: ['قطّع الخيار والطماطم.', 'اخلطها مع الحمص والزيت والليمون وفتّت الفيتا فوقها.'] },
  },
  {
    id: 'calgym:chicken-tray-bake',
    name: { en: 'Chicken & vegetable tray bake', ar: 'صينية دجاج وخضار' },
    description: { en: 'Chicken breast roasted with potato, carrot and cauliflower.', ar: 'صدر دجاج مشوي مع بطاطس وجزر وقرنبيط.' },
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 40,
    ingredients: [I.chickenBreast(600), { en: 'Potatoes', ar: 'بطاطس', ref: REF.potato, amount: 600, aisle: 'produce' }, { en: 'Carrot', ar: 'جزر', ref: REF.carrot, amount: 200, aisle: 'produce' }, { en: 'Cauliflower', ar: 'قرنبيط', ref: REF.cauliflower, amount: 300, aisle: 'produce' }, I.oliveOil(30), I.garlic(10), I.spices(8)],
    steps: {
      en: ['Cut the vegetables into chunks and toss with oil, garlic and spices.', 'Lay the chicken on top and roast at 200 °C for 35–40 minutes.'],
      ar: ['قطّع الخضار وقلّبها مع الزيت والثوم والبهارات.', 'ضع الدجاج فوقها واشوِ على 200 درجة 35–40 دقيقة.'],
    },
  },
  {
    id: 'calgym:spinach-omelette',
    name: { en: 'Spinach & feta omelette', ar: 'أومليت سبانخ وفيتا' },
    description: { en: 'Three eggs with spinach and feta.', ar: 'ثلاث بيضات مع سبانخ وفيتا.' },
    servings: 1,
    prepMinutes: 5,
    cookMinutes: 8,
    ingredients: [{ en: 'Eggs', ar: 'بيض', ref: REF.eggs, amount: 150, aisle: 'dairy', measure: { en: '3 eggs', ar: '3 بيضات' } }, { en: 'Spinach', ar: 'سبانخ', ref: REF.spinach, amount: 80, aisle: 'produce' }, { en: 'Feta', ar: 'جبنة فيتا', ref: REF.feta, amount: 30, aisle: 'dairy' }, I.oliveOil(5)],
    steps: { en: ['Wilt the spinach in the oil.', 'Pour in the beaten eggs, add the feta, fold when set.'], ar: ['ذبّل السبانخ في الزيت.', 'اسكب البيض المخفوق وأضف الفيتا واطوِ عند التماسك.'] },
  },
  {
    id: 'calgym:bulgur-chicken',
    name: { en: 'Bulgur pilaf with chicken', ar: 'برغل بالدجاج' },
    description: { en: 'Bulgur cooked with onion, tomato and chicken thighs.', ar: 'برغل مطبوخ مع بصل وطماطم وأفخاذ دجاج.' },
    servings: 3,
    prepMinutes: 10,
    cookMinutes: 30,
    ingredients: [{ en: 'Bulgur', ar: 'برغل', ref: REF.bulgurDry, amount: 240, aisle: 'pantry', measure: { en: 'dry', ar: 'جاف' } }, I.chickenThigh(450), I.onion(120), I.tomato(150), I.oliveOil(20), I.spices(6)],
    steps: {
      en: ['Brown the chicken in the oil and set aside.', 'Soften the onion; add tomato, spices and bulgur.', 'Add 450 ml water and the chicken; cover and simmer 20 minutes.'],
      ar: ['حمّر الدجاج في الزيت وأخرجه.', 'ذبّل البصل وأضف الطماطم والبهارات والبرغل.', 'أضف 450 مل ماء والدجاج، غطّ واطبخ 20 دقيقة.'],
    },
  },
  {
    id: 'calgym:hummus-plate',
    name: { en: 'Hummus with bread', ar: 'حمص بالخبز' },
    description: { en: 'Fresh hummus with olive oil and whole-wheat bread.', ar: 'حمص طازج مع زيت زيتون وخبز أسمر.' },
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 0,
    ingredients: [{ en: 'Chickpeas', ar: 'حمص مسلوق', ref: REF.chickpeasCooked, amount: 300, state: 'cooked', aisle: 'pantry' }, { en: 'Tahini', ar: 'طحينة', ref: REF.tahini, amount: 40, aisle: 'pantry' }, I.lemon(30), I.garlic(5), I.oliveOil(15), { en: 'Whole-wheat bread', ar: 'خبز أسمر', ref: REF.wholeWheatBread, amount: 120, aisle: 'bakery' }],
    steps: { en: ['Blend the chickpeas with tahini, lemon, garlic and a little water.', 'Serve with the oil on top and the bread beside.'], ar: ['اهرس الحمص مع الطحينة والليمون والثوم وقليل من الماء.', 'قدّمه مع الزيت فوقه والخبز بجانبه.'] },
  },
];

/** A stable, pre-app date so starters sort after anything the person saved. */
const STARTER_CREATED_AT = '2026-01-01T00:00:00.000Z';

export function isStarterId(id: string): boolean {
  return id.startsWith('calgym:');
}

/** The bundled collection in one language. Pure: safe to call during render. */
export function starterRecipes(lang: Language): Recipe[] {
  return STARTERS.map((s) => ({
    id: s.id,
    name: s.name[lang],
    description: s.description[lang],
    servings: s.servings,
    prepMinutes: s.prepMinutes,
    cookMinutes: s.cookMinutes,
    ingredients: s.ingredients.map((i) => ingredient(i, lang)),
    steps: s.steps[lang],
    language: lang,
    source: 'calgym',
    createdAt: STARTER_CREATED_AT,
    reviewStatus: 'ready',
  }));
}

/**
 * The library as the person sees it: their own recipes, plus every starter
 * they have not already copied (a copy keeps the starter's id, so it simply
 * replaces the original in this view — never duplicates it).
 */
export function mergeRecipes(saved: Recipe[], lang: Language): Recipe[] {
  const ids = new Set(saved.map((r) => r.id));
  return [...saved, ...starterRecipes(lang).filter((r) => !ids.has(r.id))];
}

export function findRecipe(id: string | undefined, saved: Recipe[], lang: Language): Recipe | undefined {
  if (!id) return undefined;
  return saved.find((r) => r.id === id) ?? (isStarterId(id) ? starterRecipes(lang).find((r) => r.id === id) : undefined);
}
