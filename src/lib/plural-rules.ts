/**
 * Arabic and English plural rules, for engines that get them wrong.
 *
 * i18next picks "2 مجموعتان" or "10 تكرارات" through Intl.PluralRules. The
 * phone's JavaScript engine either lacks it or only knows English rules, so
 * every Arabic count fell back to one form ("2 مجموعة", "10 تكرار"). This
 * installs the CLDR rules for our two languages when the built-in ones are
 * missing or don't know Arabic; a correct built-in is left alone.
 */

type Category = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** CLDR cardinal rules for Arabic. */
export function arabicPlural(n: number): Category {
  if (!Number.isInteger(n)) return 'other';
  const mod100 = Math.abs(n) % 100;
  if (n === 0) return 'zero';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  if (mod100 >= 3 && mod100 <= 10) return 'few';
  if (mod100 >= 11 && mod100 <= 99) return 'many';
  return 'other';
}

/** CLDR cardinal rules for English. */
export function englishPlural(n: number): Category {
  return n === 1 ? 'one' : 'other';
}

const CATEGORIES: Record<'ar' | 'en', Category[]> = {
  ar: ['zero', 'one', 'two', 'few', 'many', 'other'],
  en: ['one', 'other'],
};

class SimplePluralRules {
  private lang: 'ar' | 'en';
  private ordinal: boolean;
  constructor(locales?: string | string[], options?: { type?: 'cardinal' | 'ordinal' }) {
    const first = (Array.isArray(locales) ? locales[0] : locales) ?? 'en';
    this.lang = first.toLowerCase().startsWith('ar') ? 'ar' : 'en';
    this.ordinal = options?.type === 'ordinal';
  }
  select(n: number): Category {
    if (this.ordinal) return 'other';
    return this.lang === 'ar' ? arabicPlural(Number(n)) : englishPlural(Number(n));
  }
  resolvedOptions() {
    return { locale: this.lang, type: this.ordinal ? 'ordinal' : 'cardinal', pluralCategories: this.ordinal ? ['other'] : CATEGORIES[this.lang] };
  }
  static supportedLocalesOf(locales: string | string[]): string[] {
    return (Array.isArray(locales) ? locales : [locales]).filter((l) => /^(ar|en)\b/i.test(l));
  }
}

/** True when the engine's own rules already handle Arabic correctly. */
function builtInIsRight(): boolean {
  try {
    const PR = (globalThis as { Intl?: { PluralRules?: new (l: string) => { select(n: number): string } } }).Intl?.PluralRules;
    if (!PR) return false;
    const ar = new PR('ar');
    return ar.select(2) === 'two' && ar.select(5) === 'few' && ar.select(11) === 'many' && ar.select(0) === 'zero';
  } catch {
    return false;
  }
}

/** Install the rules above if needed. Safe to call more than once. */
export function ensurePluralRules(force = false): boolean {
  if (!force && builtInIsRight()) return false;
  const g = globalThis as { Intl?: Record<string, unknown> };
  g.Intl = g.Intl ?? {};
  g.Intl.PluralRules = SimplePluralRules;
  return true;
}
