// Arabic plurals on an engine without Arabic plural rules (the phone): with
// the rules installed, i18next picks مجموعتان for 2 and تكرارات for 10.
import i18next from '/home/user/CalApp/node_modules/i18next';
import { arabicPlural, ensurePluralRules } from '/home/user/CalApp/src/lib/plural-rules';
import { ar } from '/home/user/CalApp/src/lib/locales/ar';
import { en } from '/home/user/CalApp/src/lib/locales/en';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
check('CLDR Arabic categories', [0, 1, 2, 3, 10, 11, 99, 100, 102, 1.5].map(arabicPlural).join() === 'zero,one,two,few,few,many,many,other,other,other');

// Simulate the phone: an English-only engine.
(globalThis as { Intl: Record<string, unknown> }).Intl.PluralRules = class {
  select(n: number) { return n === 1 ? 'one' : 'other'; }
  resolvedOptions() { return { pluralCategories: ['one', 'other'] }; }
};
check('detects the broken engine and installs the rules', ensurePluralRules() === true);
const i18n = i18next.createInstance();
await i18n.init({ resources: { ar: { translation: ar }, en: { translation: en } }, lng: 'ar', interpolation: { escapeValue: false } });
const t = i18n.getFixedT('ar');
check('2 sets → مجموعتان', t('training.setsOnly', { count: 2 }) === 'مجموعتان', t('training.setsOnly', { count: 2 }));
check('10 reps → 10 تكرارات', t('training.repsCount', { count: 10 }) === '10 تكرارات', t('training.repsCount', { count: 10 }));
check('11 reps → 11 تكراراً', t('training.repsCount', { count: 11 }) === '11 تكراراً', t('training.repsCount', { count: 11 }));
check('1 rep → تكرار واحد', t('training.repsCount', { count: 1 }) === 'تكرار واحد');
const te = i18n.getFixedT('en');
check('English still 1 / many', te('training.repsCount', { count: 1 }) !== te('training.repsCount', { count: 5 }));
check('a correct engine is left alone', ensurePluralRules() === false);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
