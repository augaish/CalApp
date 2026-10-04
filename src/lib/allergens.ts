/**
 * Which foods a name probably contains, by keyword, in English and Arabic.
 *
 * The same file lives in the app (src/lib/allergens.ts) and the server
 * (server/src/allergens.ts) — they are deployed separately, so neither can
 * import the other. qa/allergens-test.ts fails if the two copies drift.
 *
 * It reads names, not recipes, so it can only ever say "may contain": a
 * "kabsa" never says "ghee" in its name. The server uses it to keep a planned
 * meal from naming something the person is allergic to, and the app to warn
 * on a scanned meal or a recipe. A hit is a reason to look, never a promise
 * that a miss is safe.
 */

export type AllergenId = 'nuts' | 'dairy' | 'gluten' | 'eggs' | 'seafood' | 'sesame';
export const ALLERGEN_IDS: AllergenId[] = ['nuts', 'dairy', 'gluten', 'eggs', 'seafood', 'sesame'];

/** Every food group the matcher knows: the allergies plus meat, for a vegetarian plan. */
export type FoodGroup = AllergenId | 'meat';

interface Words {
  /** Whole English words or phrases (lowercase). */
  en: string[];
  /** Whole Arabic words, without the attached و/ب/ال/لل… prefixes. */
  ar: string[];
  /** Phrases that mean the opposite ("gluten-free bread"): a name with one is not a hit. */
  free?: RegExp;
}

const WORDS: Record<FoodGroup, Words> = {
  nuts: {
    en: ['nut', 'nuts', 'almond', 'almonds', 'walnut', 'walnuts', 'cashew', 'cashews', 'pistachio', 'pistachios', 'hazelnut', 'hazelnuts', 'pecan', 'pecans', 'peanut', 'peanuts', 'macadamia', 'pine nuts', 'praline', 'nutella', 'marzipan', 'baklava', 'mixed nuts', 'trail mix'],
    ar: ['لوز', 'جوز', 'كاجو', 'فستق', 'فستقي', 'بندق', 'مكسرات', 'سوداني', 'بقلاوة', 'نوتيلا', 'صنوبر'],
    free: /\b(nut|peanut)[- ]free\b|خال[يى]?ة? من (ال)?مكسرات/,
  },
  dairy: {
    en: ['milk', 'cheese', 'yogurt', 'yoghurt', 'labneh', 'laban', 'butter', 'cream', 'whey', 'ghee', 'halloumi', 'feta', 'mozzarella', 'cheddar', 'parmesan', 'paneer', 'ricotta', 'custard', 'ice cream', 'latte', 'cappuccino', 'milkshake', 'kefir', 'casein', 'curd', 'skyr', 'tzatziki', 'mahalabia'],
    ar: ['حليب', 'جبن', 'جبنة', 'الجبنة', 'لبن', 'لبنة', 'زبادي', 'روب', 'زبدة', 'قشطة', 'كريمة', 'سمن', 'حلوم', 'حلومي', 'شنينة', 'مهلبية', 'لاتيه', 'كابتشينو', 'موزاريلا', 'شيدر', 'فيتا', 'آيس', 'بروتين واي'],
    free: /\b(dairy|lactose|milk)[- ]free\b|خال[يى]?ة? من (ال)?(لاكتوز|حليب|ألبان)/,
  },
  gluten: {
    en: ['wheat', 'bread', 'flour', 'pasta', 'spaghetti', 'macaroni', 'penne', 'noodle', 'noodles', 'couscous', 'bulgur', 'burghul', 'freekeh', 'barley', 'rye', 'semolina', 'pita', 'tortilla', 'wrap', 'croissant', 'cake', 'cookie', 'cookies', 'biscuit', 'biscuits', 'cracker', 'crackers', 'sandwich', 'bun', 'pizza', 'toast', 'crouton', 'croutons', 'soy sauce', 'beer', 'kibbeh', 'tabbouleh', 'samosa', 'sambousa', 'muffin', 'pancake', 'pancakes', 'waffle', 'bagel', 'lasagna', 'vermicelli', 'harees', 'jareesh', 'manakish', 'saj'],
    ar: ['خبز', 'خبزة', 'صامولي', 'صمون', 'طحين', 'دقيق', 'قمح', 'معكرونة', 'مكرونة', 'باستا', 'برغل', 'فريكة', 'شعير', 'كسكس', 'سميد', 'تورتيلا', 'كرواسون', 'كيك', 'كيكة', 'بسكويت', 'بيتزا', 'توست', 'تبولة', 'كبة', 'شعيرية', 'مرقوق', 'هريس', 'جريش', 'قرصان', 'رقاق', 'سمبوسة', 'سمبوسك', 'ساندويتش', 'شطيرة', 'فطيرة', 'فطائر', 'مناقيش', 'منقوشة', 'بان', 'لازانيا', 'صاج', 'كعك'],
    free: /\b(gluten|wheat)[- ]free\b|خال[يى]?ة? من (ال)?(جلوتين|غلوتين|قمح)/,
  },
  eggs: {
    en: ['egg', 'eggs', 'omelet', 'omelette', 'frittata', 'shakshuka', 'mayonnaise', 'mayo', 'meringue', 'aioli', 'quiche'],
    ar: ['بيض', 'بيضة', 'بيضتين', 'بيضات', 'عجة', 'شكشوكة', 'مايونيز', 'أومليت', 'اومليت'],
    free: /\begg[- ]free\b|خال[يى]?ة? من (ال)?بيض/,
  },
  seafood: {
    en: ['fish', 'salmon', 'tuna', 'shrimp', 'shrimps', 'prawn', 'prawns', 'crab', 'lobster', 'sardine', 'sardines', 'cod', 'hammour', 'hamour', 'tilapia', 'shellfish', 'oyster', 'oysters', 'mussel', 'mussels', 'clam', 'clams', 'squid', 'calamari', 'anchovy', 'anchovies', 'mackerel', 'sea bass', 'seabass', 'sea bream', 'kingfish', 'sushi', 'seafood', 'octopus', 'scallop', 'scallops'],
    ar: ['سمك', 'سمكة', 'أسماك', 'اسماك', 'روبيان', 'ربيان', 'جمبري', 'سلمون', 'تونة', 'تونا', 'هامور', 'كنعد', 'سردين', 'سلطعون', 'قبقب', 'كابوريا', 'محار', 'حبار', 'كاليماري', 'كلماري', 'أنشوجة', 'صافي', 'شعري', 'زبيدي', 'بلطي', 'سيبيا', 'استاكوزا', 'لوبستر', 'سوشي', 'مأكولات بحرية', 'أخطبوط'],
    free: /\b(fish|seafood)[- ]free\b/,
  },
  sesame: {
    en: ['sesame', 'tahini', 'tahina', 'hummus', 'houmous', 'halva', 'halawa', 'zaatar', "za'atar", 'baba ghanoush', 'mutabbal', 'moutabal'],
    ar: ['سمسم', 'طحينة', 'طحينية', 'طحينه', 'حمص', 'حلاوة', 'حلاوه', 'زعتر', 'متبل', 'غنوج'],
    free: /\bsesame[- ]free\b/,
  },
  meat: {
    en: ['chicken', 'beef', 'lamb', 'mutton', 'meat', 'steak', 'veal', 'turkey', 'duck', 'liver', 'kebab', 'kabab', 'kofta', 'shawarma', 'burger', 'sausage', 'bacon', 'ham', 'salami', 'pepperoni', 'mince', 'minced', 'meatball', 'meatballs', 'camel', 'goat', 'brisket', 'ribs', 'wings', 'tikka', 'mandi', 'machboos', 'majboos'],
    ar: ['دجاج', 'دجاجة', 'فراخ', 'لحم', 'لحمة', 'لحوم', 'ستيك', 'عجل', 'غنم', 'خروف', 'ضأن', 'ديك', 'رومي', 'بط', 'كبدة', 'كباب', 'كفتة', 'شاورما', 'برجر', 'برغر', 'نقانق', 'سجق', 'مفروم', 'حاشي', 'تكة', 'مندي', 'مجبوس', 'مضغوط', 'مظبي', 'شيش', 'طاووق', 'تيكا'],
  },
};

/** Arabic prefixes that attach to a word: و ف ب ك ل and the article, alone or stacked. */
const AR_PREFIXES = ['و', 'ف', 'ب', 'ك', 'ل', 'ال', 'لل', 'وال', 'بال', 'فال', 'كال', 'ولل', 'وب', 'وك', 'ول', 'فب', 'فل', 'وبال'];

/** Fold the Arabic letter variants people type interchangeably. */
function foldArabic(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, '') // tashkeel, tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

const AR_SETS: Record<FoodGroup, { words: Set<string>; phrases: string[] }> = Object.fromEntries(
  (Object.keys(WORDS) as FoodGroup[]).map((g) => {
    const words = new Set<string>();
    const phrases: string[] = [];
    for (const w of WORDS[g].ar) {
      const f = foldArabic(w);
      if (f.includes(' ')) phrases.push(f);
      else words.add(f);
    }
    return [g, { words, phrases }];
  }),
) as Record<FoodGroup, { words: Set<string>; phrases: string[] }>;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const EN_RE: Record<FoodGroup, RegExp> = Object.fromEntries(
  (Object.keys(WORDS) as FoodGroup[]).map((g) => [
    g,
    new RegExp(`(^|[^a-z'])(${WORDS[g].en.map(escapeRe).join('|')})(?=$|[^a-z])`),
  ]),
) as Record<FoodGroup, RegExp>;

/**
 * Phrases that look like a hit but are not: "peanut butter" is not dairy,
 * "eggplant" is no egg (whole words already miss it), "coconut milk" is not
 * dairy, "cream of tartar"… Removed before the dairy check only.
 */
const NOT_DAIRY = /\b(peanut|almond|nut|cashew|sunflower|apple|shea|cocoa|coconut|oat|soy|almond|rice) (butter|milk|cream|yogurt|yoghurt)\b|زبدة (الفول السوداني|الفول|اللوز|الكاكاو)|(حليب|لبن) (جوز الهند|اللوز|الشوفان|الصويا)/g;

function arabicTokens(text: string): string[] {
  return foldArabic(text)
    .split(/[^ء-ي]+/)
    .filter(Boolean)
    // Every reading of the word with a prefix taken off: "وبيضتين" is
    // "and two eggs", but "بيض" itself starts with the letter ب.
    .flatMap((t) => [t, ...AR_PREFIXES.filter((p) => t.length > p.length + 1 && t.startsWith(p)).map((p) => t.slice(p.length))]);
}

/** Does this name mention food from this group? */
export function mentions(text: string, group: FoodGroup): boolean {
  let lower = text.toLowerCase();
  const w = WORDS[group];
  if (w.free && w.free.test(lower)) return false;
  if (group === 'dairy') lower = lower.replace(NOT_DAIRY, ' ');
  if (EN_RE[group].test(lower)) return true;
  const sets = AR_SETS[group];
  const folded = foldArabic(lower);
  if (sets.phrases.some((p) => folded.includes(p))) return true;
  return arabicTokens(lower).some((t) => sets.words.has(t));
}

/** Free-text extras ("sesame, kiwi") as separate terms. */
export function otherTerms(other: string | undefined): string[] {
  return (other ?? '')
    .split(/[,،;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2)
    .slice(0, 10);
}

/**
 * Which of someone's allergies (and free-text extras) this text may contain.
 * Returns the ids it found, plus each extra term that appears as written.
 */
export function allergensIn(text: string, allergies: readonly string[], other?: string): string[] {
  const hits: string[] = [];
  for (const a of allergies) {
    if ((ALLERGEN_IDS as string[]).includes(a) && mentions(text, a as AllergenId)) hits.push(a);
  }
  const folded = foldArabic(text.toLowerCase());
  for (const term of otherTerms(other)) {
    if (folded.includes(foldArabic(term))) hits.push(term);
  }
  return hits;
}
