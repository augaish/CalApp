// Recipe timing (L01): a recipe that has to chill or marinate says how long
// until it is ready, so "13 min" never hides a 4-hour fridge step.
import { recipeTimes, waitInSteps } from '../src/lib/recipes';

let fails = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// The retest's AI oats: 10 + 3 minutes, step 3 chills for at least 4 hours.
const oats = ['In a bowl, mix the rolled oats, Greek yogurt, milk and chia seeds.', 'Add the cinnamon and half of the honey.', 'Cover the bowl and refrigerate for at least 4 hours, or overnight, until the oats are soft and thick.', 'Slice the banana.'];
check('"at least 4 hours, or overnight" → 4 hours', waitInSteps(oats), 240);
check('oats: 13 min active, ready in about 4 h', recipeTimes({ prepMinutes: 10, cookMinutes: 3, steps: oats }), { active: 13, readyHours: 4 });
check('marinate 2 hours', waitInSteps(['Marinate the chicken for 2 hours.']), 120);
check('a range takes the first number: 2-3 hours', waitInSteps(['Let the dough rise for 2-3 hours.']), 120);
check('Arabic: ضعها في الثلاجة ٤ ساعات', waitInSteps(['ضعها في الثلاجة ٤ ساعات.']), 240);
check('Arabic: ساعتين', waitInSteps(['اتركها ساعتين.']), 120);
check('Arabic: طوال الليل', waitInSteps(['انقعها طوال الليل.']), 480);
check('minutes are not a wait', waitInSteps(['Rest for 10 minutes, then slice.']), undefined);
check('no wait: plain active time', recipeTimes({ prepMinutes: 10, cookMinutes: 20, steps: ['Cook.', 'Serve.'] }), { active: 30, readyHours: null });
check('the AI\'s own wait wins over the steps', recipeTimes({ prepMinutes: 10, cookMinutes: 0, waitMinutes: 240, steps: oats }), { active: 10, readyHours: 4 });

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
