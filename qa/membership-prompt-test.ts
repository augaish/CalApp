// When the membership sheet offers itself: once after onboarding, then weekly from day 3.
import { initialPromptState, markShown, promptDue } from '/home/user/CalApp/src/lib/membership-prompt.ts';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const t0 = new Date('2026-09-01T10:00:00Z');
const at = (days: number) => new Date(t0.getTime() + days * 86_400_000);
const free = { free: true, tourDone: true, busy: false };

// A new person.
let s = initialPromptState(false, t0);
check('new: nothing before the tour is done', promptDue(s, { ...free, tourDone: false }, t0) === null);
check('new: the intro right after the tour', promptDue(s, free, t0) === 'intro');
check('never mid-workout or off a tab', promptDue(s, { ...free, busy: true }, t0) === null);
check('never to a member', promptDue(s, { ...free, free: false }, t0) === null);
s = markShown(s, t0);
check('after the intro: quiet on day 1 and 2', promptDue(s, free, at(1)) === null && promptDue(s, free, at(2.9)) === null);
check('day 3: still quiet — the intro was under a week ago', promptDue(s, free, at(3)) === null);
check('a week after the intro: weekly', promptDue(s, free, at(7)) === 'weekly');
s = markShown(s, at(7));
check('then not again for a week', promptDue(s, free, at(13.9)) === null);
check('and again after it', promptDue(s, free, at(14)) === 'weekly');

// Someone who was already using the app when this shipped.
let e = initialPromptState(true, t0);
check('existing: no intro', promptDue(e, free, t0) === null);
check('existing: quiet until day 3', promptDue(e, free, at(2)) === null);
check('existing: first showing on day 3', promptDue(e, free, at(3)) === 'weekly');
e = markShown(e, at(3));
check('existing: then weekly', promptDue(e, free, at(9)) === null && promptDue(e, free, at(10)) === 'weekly');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
