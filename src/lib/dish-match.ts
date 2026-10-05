import { DISH_NAMES } from '@/lib/dish-names';

/**
 * Which dish photo fits a food's name, in English or Arabic. Names are
 * compared as whole words after light normalising (Arabic diacritics and
 * letter forms, the "ال" prefix, English plurals). The most specific name
 * wins, so "chicken shawarma wrap" gets the shawarma photo and not plain
 * chicken, and "oats with banana" gets oats. No match is undefined: the caller keeps its icon.
 */

/** Linking words, so "chicken with rice" reads as "chicken rice". */
const LINKS = new Set(['with', 'and', 'in', 'on', 'of', 'مع', 'في', 'على']);

function normWord(w: string): string {
  let x = w;
  if (x.length > 3 && x.startsWith('ال')) x = x.slice(2);
  else if (x.length > 4 && (x.startsWith('بال') || x.startsWith('وال'))) x = x.slice(3);
  if (x.length > 3 && /[a-z]s$/.test(x) && !x.endsWith('ss')) x = x.slice(0, -1);
  return x;
}

export function normalizeDishName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // harakat, dagger alef, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9ء-ي]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => !LINKS.has(w))
    .map(normWord)
    .join(' ');
}

let index: { key: string; alias: string }[] | null = null;
const aliases = () => {
  if (!index) {
    index = DISH_NAMES.flatMap(([key, names]) => names.map((n) => ({ key, alias: normalizeDishName(n) })).filter((a) => a.alias));
  }
  return index;
};

const cache = new Map<string, string | undefined>();

export function dishKeyFor(name: string | undefined): string | undefined {
  if (!name) return undefined;
  if (cache.has(name)) return cache.get(name);
  const hay = ` ${normalizeDishName(name)} `;
  // Most words first ("chicken shawarma" over "chicken"), then the one
  // named first ("oats with banana" is oats), then the longest.
  let best: { key: string; words: number; at: number; len: number } | undefined;
  if (hay.trim()) {
    for (const a of aliases()) {
      const at = hay.indexOf(` ${a.alias} `);
      if (at < 0) continue;
      const words = a.alias.split(' ').length;
      if (!best || words > best.words || (words === best.words && (at < best.at || (at === best.at && a.alias.length > best.len))))
        best = { key: a.key, words, at, len: a.alias.length };
    }
  }
  const hit = best?.key;
  if (cache.size > 500) cache.clear();
  cache.set(name, hit);
  return hit;
}
