// The Overview day strip pages by whole weeks counted back from today.
import { weekPageFor } from '/home/user/CalApp/src/lib/day.ts';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const d = (m: number, day: number) => new Date(2026, m, day, 15, 30);
const dates = (days: Date[]) => days.map((x) => `${x.getMonth() + 1}/${x.getDate()}`).join(' ');
const today = d(8, 27); // Sunday 27 September

const page0 = dates(weekPageFor(today, today));
check('today: the page ends today', page0 === '9/21 9/22 9/23 9/24 9/25 9/26 9/27', page0);
check('any day in the last seven: same page', dates(weekPageFor(d(8, 21), today)) === page0);
const page1 = dates(weekPageFor(d(8, 20), today));
check('one day before: the previous page', page1 === '9/14 9/15 9/16 9/17 9/18 9/19 9/20', page1);
check('stepping back inside a page keeps the row still', dates(weekPageFor(d(8, 16), today)) === page1 && dates(weekPageFor(d(8, 14), today)) === page1);
const page2 = dates(weekPageFor(d(8, 11), today));
check('two pages back', page2 === '9/7 9/8 9/9 9/10 9/11 9/12 9/13', page2);
check('always seven days, oldest first', weekPageFor(d(7, 3), today).length === 7);
check('the selected day is always on its page', [d(8, 1), d(7, 15), d(8, 26)].every((s) => weekPageFor(s, today).some((x) => x.toDateString() === s.toDateString())));
check('a future day falls back to the current page', dates(weekPageFor(d(8, 29), today)) === page0);
// Across a month boundary and a clock change (the local-midnight maths).
const spring = weekPageFor(new Date(2026, 2, 30, 9), new Date(2026, 3, 2, 9));
check('pages across the March clock change stay seven distinct days', new Set(spring.map((x) => x.toDateString())).size === 7, dates(spring));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
