// Cardio machine settings: which machines remember what, distance from
// speed × time, the session line, and incline counted in the burn.
import { BUILTIN_EXERCISES } from '../src/lib/exercises';
import { autoDistanceM, cardioFieldsFor, cardioLine, hasCardioSettings, inclineGrade } from '../src/lib/cardio';
import { burnForSets, paceMet } from '../src/lib/store';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  → ${detail}` : ''}`);
};
const ex = (id: string) => BUILTIN_EXERCISES.find((e) => e.id === `builtin:${id}`)!;
const t = (k: string, o?: Record<string, unknown>) =>
  (({ 'cardio.minutes': `${o?.n} min`, 'cardio.kmh': 'km/h', 'cardio.mph': 'mph', 'cardio.km': 'km', 'cardio.mi': 'mi', 'cardio.inclineN': `${o?.n}% incline`, 'cardio.levelN': `level ${o?.n}`, 'cardio.floorsN': `${o?.n} floors`, 'cardio.damperN': `damper ${o?.n}`, 'cardio.rpmN': `${o?.n} rpm` }) as Record<string, string>)[k] ?? k;

check('treadmill: speed and incline', cardioFieldsFor(ex('treadmill')).join() === 'speedKmh,inclinePct');
check('stair climber: level and floors', cardioFieldsFor(ex('stair-climber')).join() === 'level,floors');
check('bike, elliptical, rower', cardioFieldsFor(ex('cycling')).join() === 'level,rpm' && cardioFieldsFor(ex('elliptical')).join() === 'level,inclinePct' && cardioFieldsFor(ex('rowing')).join() === 'damper');
check('air bike, outdoor running, bench press: nothing', [ex('assault-bike'), ex('running-outdoor'), ex('bench-press')].every((e) => cardioFieldsFor(e).length === 0));
check('a custom "جهاز المشي" is a treadmill', cardioFieldsFor({ id: 'c1', name: 'جهاز المشي المنزلي', category: 'cardio', source: 'custom' }).join() === 'speedKmh,inclinePct');

check('distance: 10 km/h for 30 min = 5.0 km', autoDistanceM(10, 1800) === 5000);
check('distance: rounds to 10 m', autoDistanceM(5.5, 2400) === 3670, String(autoDistanceM(5.5, 2400)));

check('line: treadmill', cardioLine({ seconds: 1800, speedKmh: 10, inclinePct: 6, distanceM: 5000 }, 'metric', t) === '30 min · 10 km/h · 6% incline · 5.0 km');
check('line: imperial', cardioLine({ seconds: 1800, speedKmh: 10, distanceM: 5000 }, 'imperial', t) === '30 min · 6.2 mph · 3.1 mi');
check('line: stair climber', cardioLine({ seconds: 1200, level: 8, floors: 95 }, 'metric', t) === '20 min · level 8 · 95 floors');
check('line: an older session without settings', cardioLine({ seconds: 1800, distanceM: 3200 }, 'metric', t) === '30 min · 3.2 km');
check('hasCardioSettings', hasCardioSettings({ level: 8 }) && !hasCardioSettings({ seconds: 60 }));

check('incline grade is time-weighted', Math.abs(inclineGrade([{ seconds: 600, inclinePct: 0, done: true }, { seconds: 1200, inclinePct: 9, done: true }]) - 0.06) < 1e-9);
check('flat pace unchanged', paceMet(5000, 1800) === paceMet(5000, 1800, 0));
const tread = ex('treadmill');
const kcal = (sets: Parameters<typeof burnForSets>[0]) => burnForSets(sets, 70, tread.category, undefined, tread);
const flat = kcal([{ seconds: 1800, distanceM: 5000, done: true }]);
const hill = kcal([{ seconds: 1800, distanceM: 5000, inclinePct: 6, done: true }]);
check('run 10 km/h 30 min, 70 kg: ≈387 flat, ≈481 at 6%', flat === 387 && hill === 481, `${flat} / ${hill}`);
const walkFlat = kcal([{ seconds: 1800, distanceM: 2750, done: true }]);
const walkHill = kcal([{ seconds: 1800, distanceM: 2750, inclinePct: 12, done: true }]);
check('walk 5.5 km/h 30 min: ≈133 flat, ≈341 at 12%', walkFlat === 133 && walkHill === 341, `${walkFlat} / ${walkHill}`);
check('downhill is not easier than flat', kcal([{ seconds: 1800, distanceM: 2750, inclinePct: -3, done: true }]) === walkFlat);
const stairs = ex('stair-climber');
check('a level never changes the burn', burnForSets([{ seconds: 1200, level: 8, done: true }], 70, stairs.category, undefined, stairs) === burnForSets([{ seconds: 1200, level: 15, done: true }], 70, stairs.category, undefined, stairs));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
