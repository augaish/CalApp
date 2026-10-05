// Arabic-Indic digits in Arabic (src/lib/digits.ts): numbers change, digits
// that belong to Latin text, emails, links and versions do not.
import { toArabicDigits } from '/home/user/CalApp/src/lib/digits';

let fails = 0;
const check = (input: string, want: string) => {
  const got = toArabicDigits(input);
  const ok = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'}  "${input}" → "${got}"${ok ? '' : `  (want "${want}")`}`);
  if (!ok) fails++;
};
check('664 / 2,525 سعرة', '٦٦٤ / ٢٬٥٢٥ سعرة');
check('62.5 × 8', '٦٢٫٥ × ٨');
check('1:08', '١:٠٨');
check('26%', '٢٦٪');
check('متبقٍ 1,861', 'متبقٍ ١٬٨٦١');
check('−15 ث', '−١٥ ث');
check('فيتامين B12', 'فيتامين B12');
check('7UP', '7UP');
check('قهوة V60', 'قهوة V60');
check('Machine 7', 'Machine 7');
check('InBody 270 · ٢ أكتوبر', 'InBody 270 · ٢ أكتوبر');
check('Push · 2', 'Push · ٢');
check('تمرين 3', 'تمرين ٣');
check('support1@calgym.org', 'support1@calgym.org');
check('https://calgym.org/a1', 'https://calgym.org/a1');
check('1.0.0 · b817e923', '1.0.0 · b817e923');
check('بدون أرقام', 'بدون أرقام');
check('٦٦٤', '٦٦٤');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
