/**
 * Stable ingredient identities, resolved locally.
 *
 * The recipe prompt asks the model for a `key`, but a prompt is a request,
 * not a guarantee: the same onion comes back as "onion", "onions", "بصل" and
 * "yellow_onion" across enough generations. Merging a shopping list on the
 * model's word alone would split one line into four, or — worse — fuse two
 * things that are not the same purchase.
 *
 * So the model's key is treated as a hint and resolved against this table.
 * The rule for the table itself: an alias is a DIFFERENT NAME for the same
 * purchase, never a narrower kind of it. "أرز" is rice; basmati is its own
 * entry, because someone shopping for basmati is not served by any rice.
 */

interface IngredientRecord {
  /** Canonical key, lowercase English with underscores. */
  key: string;
  /** Other names for THIS SAME purchase, in any language, normalized. */
  aliases: string[];
}

/** Lowercase, strip diacritics and punctuation, collapse spaces to underscores. */
export function normalizeIngredient(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    // NFKD splits أ into ا plus a combining hamza (U+0654), which is NOT in
    // the Latin combining range — leaving it in turned "أرز" into "ا_رز" and
    // silently defeated every Arabic alias. Strip Arabic marks too, and do it
    // before the alef/ya/ta folding below so that folding sees bare letters.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٰٟ]/g, '') // Arabic tashkeel, hamza marks, dagger alef
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Deliberately small and specific. Every entry earns its place by being
 * something that genuinely recurs in Gulf home cooking and that the model
 * spells inconsistently. Anything not here keeps its own normalized name,
 * which is the safe outcome: an unmerged line is a minor annoyance, a wrongly
 * merged one is a wrong shopping list.
 */
const RECORDS: IngredientRecord[] = [
  // Grains — note basmati is its own purchase, not an alias of rice.
  { key: 'rice', aliases: ['rice', 'rices', 'white_rice', 'ارز', 'الارز', 'رز'] },
  { key: 'rice_basmati', aliases: ['basmati', 'basmati_rice', 'ارز_بسمتي', 'بسمتي'] },
  { key: 'bulgur', aliases: ['bulgur', 'burghul', 'برغل'] },
  { key: 'pasta', aliases: ['pasta', 'macaroni', 'spaghetti', 'معكرونه', 'مكرونه', 'باستا'] },
  { key: 'bread', aliases: ['bread', 'khubz', 'خبز', 'عيش'] },
  { key: 'oats', aliases: ['oats', 'oat', 'rolled_oats', 'شوفان'] },
  { key: 'flour', aliases: ['flour', 'plain_flour', 'طحين', 'دقيق'] },

  // Protein
  { key: 'chicken_breast', aliases: ['chicken_breast', 'chicken_breasts', 'صدور_دجاج', 'صدر_دجاج'] },
  { key: 'chicken_thigh', aliases: ['chicken_thigh', 'chicken_thighs', 'افخاذ_دجاج', 'ورك_دجاج'] },
  { key: 'chicken', aliases: ['chicken', 'whole_chicken', 'دجاج', 'الدجاج'] },
  { key: 'beef', aliases: ['beef', 'ground_beef', 'minced_beef', 'لحم_بقر', 'لحمه_مفرومه'] },
  { key: 'lamb', aliases: ['lamb', 'mutton', 'لحم_غنم', 'ضاني'] },
  { key: 'fish', aliases: ['fish', 'سمك'] },
  { key: 'shrimp', aliases: ['shrimp', 'prawns', 'روبيان', 'جمبري'] },
  { key: 'egg', aliases: ['egg', 'eggs', 'بيض', 'بيضه'] },
  { key: 'chickpeas', aliases: ['chickpeas', 'chickpea', 'حمص'] },
  { key: 'lentils', aliases: ['lentils', 'lentil', 'عدس'] },

  // Dairy
  { key: 'milk', aliases: ['milk', 'حليب', 'لبن'] },
  { key: 'yogurt', aliases: ['yogurt', 'yoghurt', 'laban', 'زبادي', 'روب'] },
  { key: 'labneh', aliases: ['labneh', 'لبنه'] },
  { key: 'cheese', aliases: ['cheese', 'جبن', 'جبنه'] },
  { key: 'butter', aliases: ['butter', 'زبده'] },
  { key: 'ghee', aliases: ['ghee', 'samn', 'سمن'] },

  // Produce
  { key: 'onion', aliases: ['onion', 'onions', 'yellow_onion', 'بصل', 'بصله'] },
  { key: 'garlic', aliases: ['garlic', 'ثوم'] },
  { key: 'tomato', aliases: ['tomato', 'tomatoes', 'طماطم', 'بندوره'] },
  { key: 'potato', aliases: ['potato', 'potatoes', 'بطاطس', 'بطاطا'] },
  { key: 'carrot', aliases: ['carrot', 'carrots', 'جزر'] },
  { key: 'cucumber', aliases: ['cucumber', 'cucumbers', 'خيار'] },
  { key: 'lemon', aliases: ['lemon', 'lemons', 'ليمون'] },
  { key: 'parsley', aliases: ['parsley', 'بقدونس'] },
  { key: 'coriander', aliases: ['coriander', 'cilantro', 'كزبره'] },
  { key: 'bell_pepper', aliases: ['bell_pepper', 'capsicum', 'فلفل_رومي', 'فلفل_حلو'] },

  // Pantry
  { key: 'olive_oil', aliases: ['olive_oil', 'زيت_زيتون'] },
  { key: 'vegetable_oil', aliases: ['vegetable_oil', 'sunflower_oil', 'cooking_oil', 'زيت', 'زيت_نباتي'] },
  { key: 'salt', aliases: ['salt', 'ملح'] },
  { key: 'black_pepper', aliases: ['black_pepper', 'pepper', 'فلفل_اسود'] },
  { key: 'sugar', aliases: ['sugar', 'سكر'] },
  { key: 'tomato_paste', aliases: ['tomato_paste', 'معجون_طماطم', 'صلصه_طماطم'] },
  { key: 'stock', aliases: ['stock', 'broth', 'مرق'] },
  { key: 'water', aliases: ['water', 'ماء', 'مويه'] },

  // Spices that recur by name
  { key: 'cumin', aliases: ['cumin', 'كمون'] },
  { key: 'turmeric', aliases: ['turmeric', 'كركم'] },
  { key: 'cinnamon', aliases: ['cinnamon', 'قرفه'] },
  { key: 'cardamom', aliases: ['cardamom', 'هيل'] },
  { key: 'baharat', aliases: ['baharat', 'mixed_spices', 'بهارات'] },
];

const BY_ALIAS = new Map<string, string>();
for (const record of RECORDS) {
  BY_ALIAS.set(record.key, record.key);
  for (const alias of record.aliases) BY_ALIAS.set(normalizeIngredient(alias), record.key);
}

/**
 * The canonical key for an ingredient, from the model's suggestion and the
 * name it printed.
 *
 * Both are checked, because either can be the one that lands: the model
 * sometimes keys "basmati_rice" while naming it "أرز بسمتي", and sometimes
 * the reverse. An unrecognised ingredient keeps its own normalized key rather
 * than being forced into a neighbour — being un-merged is recoverable, being
 * wrongly merged is not.
 */
export function resolveIngredientKey(name: string, suggestedKey?: string): string {
  const suggested = suggestedKey ? normalizeIngredient(suggestedKey) : '';
  const fromName = normalizeIngredient(name);
  const known = BY_ALIAS.get(suggested) ?? BY_ALIAS.get(fromName);
  // Nothing known matched, so keep whichever identity we have, preferring the
  // model's key since it is already language-independent by design.
  return known ?? (suggested || fromName);
}

/** Only for tests and tooling: how many identities the table knows. */
export const INGREDIENT_RECORD_COUNT = RECORDS.length;
