// Every literal t('...') key in the app must resolve in BOTH languages.
// F6 in the Android retest: the Training tab printed "training.restDay"
// because the string lived under a different namespace. A raw key on a
// production screen is a defect this test makes impossible to ship again.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '/home/user/CalApp/src/lib/locales/en';
import { ar } from '/home/user/CalApp/src/lib/locales/ar';

const ROOT = '/home/user/CalApp/src';
const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name) && !/locales\//.test(p)) files.push(p);
  }
};
walk(ROOT);

// t('a.b.c') and t("a.b.c") — static keys only. Template-literal keys are
// dynamic and checked by their own callers.
const KEY = /\bt\(\s*(['"])([a-zA-Z0-9_.]+)\1/g;
const lookup = (obj: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);

// i18next plural keys: `t('x.y', { count })` resolves x.y_one / x.y_other,
// so the base key may legitimately be absent when the suffixed forms exist.
const resolvesWithPlural = (obj: unknown, key: string): boolean => {
  if (lookup(obj, key) !== undefined) return true;
  return ['zero', 'one', 'two', 'few', 'many', 'other'].some((s) => lookup(obj, `${key}_${s}`) !== undefined);
};

let total = 0;
const missing: { file: string; key: string; lang: string }[] = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(KEY)) {
    const key = m[2];
    total++;
    for (const [lang, table] of [['en', en], ['ar', ar]] as const) {
      const v = resolvesWithPlural(table, key);
      if (!v) missing.push({ file: f.replace(ROOT + '/', ''), key, lang });
    }
  }
}

console.log(`${total} static keys across ${files.length} files`);
const byKey = new Map<string, { file: string; langs: string[] }>();
for (const m of missing) {
  const cur = byKey.get(m.key) ?? { file: m.file, langs: [] };
  if (!cur.langs.includes(m.lang)) cur.langs.push(m.lang);
  byKey.set(m.key, cur);
}
for (const [key, { file, langs }] of byKey) {
  console.log(`FAIL  ${key}  missing in ${langs.join('+')}  (${file})`);
}
console.log(byKey.size === 0 ? '\nALL PASS' : `\n${byKey.size} KEYS MISSING`);
process.exit(byKey.size === 0 ? 0 : 1);
