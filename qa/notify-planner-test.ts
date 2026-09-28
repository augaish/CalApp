// Notifications planned from the person's own data: the rules (what is sent,
// when, and what isn't), the budget, plan awareness, Ramadan and fasting, the
// wording in both languages, and the learning of usual times.
import {
  DEFAULT_PREFS, candidates, inQuietHours, isRamadan, planNotes, waterExpected, waterSuggestion,
  type DayFacts, type NotifyFacts, type PlannedNote,
} from '/home/user/CalApp/src/lib/notify/planner.ts';
import { renderNote, variant } from '/home/user/CalApp/src/lib/notify/copy.ts';
import { en } from '/home/user/CalApp/src/lib/locales/en.ts';
import { ar } from '/home/user/CalApp/src/lib/locales/ar.ts';

// The facts module reads the store, which touches storage on load.
(globalThis as { window?: unknown }).window ??= globalThis;
const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
const { learnMealTimes, slotOf, usualGlass, prsOn, bodyWinsOn, learnTrainingTime } = await import('/home/user/CalApp/src/lib/notify/facts.ts');

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

// A Tuesday in October 2026 (not Ramadan), 08:00.
const NOW = new Date(2026, 9, 6, 8, 0);
const midnight = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const TODAY = midnight(NOW);
const TOMORROW = new Date(TODAY.getTime() + 86_400_000);

const day = (date: Date, o: Partial<DayFacts> = {}): DayFacts => ({
  date, kcal: 0, protein: 0, waterMl: 0, mealsLogged: [], mealMinutes: [], loggedAnything: false,
  plan: null, trained: false, missedYesterday: null, workoutEndMinute: null, waterSinceWorkoutMl: 0,
  prs: 0, burnedKcal: 0, bodyWins: [], program: null, ...o,
});
const facts = (o: Partial<NotifyFacts> = {}, today: Partial<DayFacts> = {}, tomorrow: Partial<DayFacts> = {}): NotifyFacts => ({
  now: NOW,
  prefs: { ...DEFAULT_PREFS },
  scope: { food: true, training: true, health: true },
  targets: { kcal: 2000, protein: 150, waterMl: 2500 },
  usual: { breakfast: null, lunch: null, dinner: null, training: null },
  glassMl: 330,
  proteinFood: null,
  fastEndsAt: null,
  hasSchedule: true,
  logStreak: 0,
  workoutStreak: 0,
  days: [day(TODAY, today), day(TOMORROW, tomorrow)],
  week: null,
  ...o,
});
const kinds = (notes: PlannedNote[], d: Date = TODAY) => notes.filter((n) => midnight(n.at).getTime() === d.getTime()).map((n) => n.kind);
const find = (notes: PlannedNote[], id: string) => notes.find((n) => n.id.startsWith(id) && n.id.endsWith(`${TODAY.getFullYear()}-10-06`));
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// ── meals: only what isn't logged ──
{
  const c = candidates(facts());
  const lunch = find(c, 'n-meal-lunch');
  check('lunch not logged: a lunch reminder', !!lunch);
  eq('…45 minutes after the usual 13:30', lunch && hm(lunch.at), '14:15');
  const logged = candidates(facts({}, { mealsLogged: ['lunch'], mealMinutes: [13 * 60 + 10], kcal: 700, loggedAnything: true }));
  check('lunch logged: no lunch reminder', !find(logged, 'n-meal-lunch'));
  const snack = candidates(facts({}, { mealMinutes: [13 * 60], loggedAnything: true }));
  check('a meal logged around lunchtime (as a snack) counts', !find(snack, 'n-meal-lunch'));
  const learned = candidates(facts({ usual: { breakfast: 'never', lunch: 12 * 60 + 15, dinner: null, training: null } }));
  check('someone who never logs breakfast gets no breakfast reminder', !find(learned, 'n-meal-breakfast'));
  eq('a learned lunch at 12:15 moves the reminder to 13:00', find(learned, 'n-meal-lunch') && hm(find(learned, 'n-meal-lunch')!.at), '13:00');
  const r = find(candidates(facts({}, { kcal: 1150, mealsLogged: ['breakfast', 'lunch'], mealMinutes: [480, 780], loggedAnything: true })), 'n-meal-dinner');
  eq('the dinner reminder carries the calories left', r?.params.kcalLeft, 850);
}

// ── protein ──
{
  const f = facts({ proteinFood: { name: 'Chicken shawarma', proteinG: 35 } }, { protein: 40, mealsLogged: ['breakfast'], mealMinutes: [500], loggedAnything: true });
  const p = find(candidates(f), 'n-protein');
  check('under half the protein by the afternoon: a protein note', !!p && p.at.getHours() >= 15 && p.at.getHours() <= 17);
  eq('…suggesting a food they often eat', p?.params.food, 'Chicken shawarma');
  check('no protein note on a day with nothing logged yet', !find(candidates(facts()), 'n-protein'));
  check('no protein note once past half', !find(candidates(facts({}, { protein: 90, mealsLogged: ['lunch'], loggedAnything: true })), 'n-protein'));
}

// ── water: paced, stops at the goal ──
{
  eq('on pace at 14:00 is 1250 ml of 2500', Math.round(waterExpected(2500, 14 * 60)), 1250);
  eq('a 700 ml gap in 330 ml glasses is 3 glasses', waterSuggestion(700, 330), 990);
  eq('never more than 3 glasses', waterSuggestion(5000, 250), 750);
  const behind = candidates(facts({}, { waterMl: 200 })).filter((n) => n.kind === 'water' && midnight(n.at).getTime() === TODAY.getTime());
  check('behind pace: water notes, at most two a day', behind.length >= 1 && behind.length <= 2);
  check('…suggesting whole glasses', behind.every((n) => (n.params.suggestMl as number) % 330 === 0));
  const done = candidates(facts({}, { waterMl: 2600 })).filter((n) => n.kind === 'water' && midnight(n.at).getTime() === TODAY.getTime());
  eq('goal reached: no more water notes today', done.length, 0);
  const onPace = candidates(facts({ now: new Date(2026, 9, 6, 13, 0) }, { waterMl: 1300 })).filter((n) => n.kind === 'water' && hm(n.at) === '14:00' && midnight(n.at).getTime() === TODAY.getTime());
  eq('on pace: nothing at 14:00', onPace.length, 0);
  const afternoon = candidates(facts({ now: new Date(2026, 9, 6, 15, 0) }, { waterMl: 200 })).filter((n) => n.kind === 'water' && midnight(n.at).getTime() === TODAY.getTime());
  eq('at 15:00 behind pace: the evening checks are still planned', afternoon.map((n) => hm(n.at)), ['17:00', '19:30']);
  const after = find(candidates(facts({ now: new Date(2026, 9, 6, 18, 5) }, { trained: true, workoutEndMinute: 18 * 60, waterSinceWorkoutMl: 0, loggedAnything: true })), 'n-waterAfterWorkout');
  eq('after a workout: water 30 minutes later', after && hm(after.at), '18:30');
}

// ── training ──
{
  const plan = { title: 'Leg day', exercises: 5, lead: { name: 'Squat', weightKg: 80, reps: 8 } };
  const t = find(candidates(facts({}, { plan })), 'n-training');
  check('a planned day: a training note before the usual time', !!t && hm(t.at) === '17:15');
  const text = t && renderNote(t, lookup(en), 'en');
  check('…naming the day and last performance', !!text && /Leg day/.test(text.title) && /Squat: 80 kg × 8/.test(text.body), JSON.stringify(text));
  check('trained already: no training note', !find(candidates(facts({}, { plan, trained: true })), 'n-training'));
  check('a rest day: a rest-day note instead', !!find(candidates(facts()), 'n-restDay') && !find(candidates(facts()), 'n-training'));
  check('no schedule at all: no rest-day note', !find(candidates(facts({ hasSchedule: false })), 'n-restDay'));
  const missed = candidates(facts({}, { missedYesterday: { title: 'Pull' } }));
  check("yesterday's missed workout: offered this morning", !!find(missed, 'n-missed') && !find(missed, 'n-restDay'));
}

// ── the budget ──
{
  const busy = facts({ now: new Date(2026, 9, 6, 7, 30) }, { plan: { title: 'Push', exercises: 4 }, protein: 10, mealsLogged: ['breakfast'], mealMinutes: [480], loggedAnything: true });
  const plan = planNotes(busy).filter((n) => midnight(n.at).getTime() === TODAY.getTime());
  check('never more than 4 a day', plan.length <= 4, String(plan.length));
  const times = plan.map((n) => n.at.getTime()).sort((a, b) => a - b);
  check('never two within 90 minutes', times.every((x, i) => i === 0 || x - times[i - 1] >= 90 * 60_000));
  check('the recap and the workout survive the budget', kinds(plan).includes('dayRecap') && kinds(plan).includes('training'), kinds(plan).join(','));
  const two = planNotes({ ...busy, prefs: { ...busy.prefs, maxPerDay: 2 } }).filter((n) => midnight(n.at).getTime() === TODAY.getTime());
  eq('a daily maximum of 2 is respected', two.length, 2);
  check('quiet hours 23–07 cover 23:30 and 06:00, not 07:00', inQuietHours(new Date(2026, 9, 6, 23, 30), DEFAULT_PREFS) && inQuietHours(new Date(2026, 9, 6, 6, 0), DEFAULT_PREFS) && !inQuietHours(new Date(2026, 9, 6, 7, 0), DEFAULT_PREFS));
  const late = planNotes(facts({ prefs: { ...DEFAULT_PREFS, quietStart: 12, quietEnd: 16 } }));
  check('nothing planned inside quiet hours', late.every((n) => !inQuietHours(n.at, { quietStart: 12, quietEnd: 16 })));
  check('nothing in the past', planNotes(facts({ now: new Date(2026, 9, 6, 15, 0) })).every((n) => n.at.getTime() > new Date(2026, 9, 6, 15, 0).getTime()));
}

// ── switches and plans ──
{
  eq('main switch off: nothing', planNotes(facts({ prefs: { ...DEFAULT_PREFS, enabled: false } })).length, 0);
  const foodOnly = candidates(facts({ scope: { food: true, training: false, health: true } }, { plan: { title: 'Legs', exercises: 4 } }));
  check('Essentials Food: no training notes', !foodOnly.some((n) => n.channel === 'training'));
  check('Essentials Food: food and water notes', foodOnly.some((n) => n.channel === 'food') && foodOnly.some((n) => n.channel === 'water'));
  const trainOnly = candidates(facts({ scope: { food: false, training: true, health: true } }, { plan: { title: 'Legs', exercises: 4 } }));
  check('Essentials Training: no food notes', !trainOnly.some((n) => n.channel === 'food'));
  eq('no plan (view only): nothing', candidates(facts({ scope: { food: false, training: false, health: false } })).length, 0);
  const noWater = candidates(facts({ prefs: { ...DEFAULT_PREFS, water: false } }));
  check('water switched off: no water notes', !noWater.some((n) => n.channel === 'water'));
}

// ── fasting and Ramadan ──
{
  const fast = candidates(facts({ fastEndsAt: new Date(2026, 9, 6, 15, 0) }));
  check('fasting until 15:00: no breakfast or lunch reminder', !find(fast, 'n-meal-breakfast') && !find(fast, 'n-meal-lunch'));
  check('…and a note when the eating window opens', fast.some((n) => n.kind === 'fastEnd' && hm(n.at) === '15:00'));
  check('Ramadan 2027 is recognised', isRamadan(new Date(2027, 1, 20)) && !isRamadan(new Date(2027, 2, 20)));
  const rNow = new Date(2027, 1, 20, 9, 0);
  const rToday = midnight(rNow);
  const ramadan = candidates(facts({ now: rNow, days: [day(rToday), day(new Date(rToday.getTime() + 86_400_000))] }));
  check('Ramadan: no meal reminders', !ramadan.some((n) => n.kind === 'meal'));
  check('Ramadan: water only in the evening', ramadan.filter((n) => n.kind === 'water').every((n) => n.at.getHours() >= 20));
}

// ── recaps and wins ──
{
  check('nothing logged today: no recap', !find(candidates(facts()), 'n-dayRecap'));
  const good = facts({ logStreak: 7 }, {
    kcal: 1950, protein: 152, waterMl: 2600, mealsLogged: ['breakfast', 'lunch', 'dinner'], loggedAnything: true,
    trained: true, plan: { title: 'Push', exercises: 5 }, prs: 2, burnedKcal: 2850,
    bodyWins: [{ kind: 'fat', delta: -1.2 }, { kind: 'muscle', delta: 0.4 }],
  });
  const recap = find(candidates(good), 'n-dayRecap')!;
  check('a logged day: a recap in the evening', !!recap && recap.at.getHours() >= 20 && recap.at.getHours() <= 22);
  const text = renderNote(recap, lookup(en), 'en');
  check('a strong day says so', /Strong day|What a day/.test(text.title), text.title);
  for (const bit of ['1,950/2,000 kcal ✓', 'protein 152 g 🎯', 'Push done 💪', 'new records: 2 🏆', 'burned 2,850 kcal', '2.6 L ✓', 'body fat −1.2% 🎉', 'muscle +0.4 kg', '7-day streak, a new milestone']) {
    check(`recap mentions "${bit}"`, text.body.includes(bit), text.body);
  }
  const quiet = find(candidates(facts({}, { kcal: 2900, protein: 40, mealsLogged: ['lunch'], loggedAnything: true })), 'n-dayRecap')!;
  const qt = renderNote(quiet, lookup(en), 'en');
  check('a day with no wins still ends kindly', /fresh start/.test(qt.body) && !/fail|bad|over/i.test(qt.body), qt.body);
  const onlyTraining = find(candidates(facts({ scope: { food: false, training: true, health: true } }, { kcal: 1500, trained: true, loggedAnything: true })), 'n-dayRecap')!;
  check('Essentials Training recap leaves food out', !/kcal/.test(renderNote(onlyTraining, lookup(en), 'en').body.replace(/burned [\d,]+ kcal/, '')));

  const satNow = new Date(2026, 9, 10, 8, 0);
  const sat = midnight(satNow);
  const week = { activeDays: 6, workoutsDone: 4, workoutsPlanned: 4, prs: 3, proteinGoalDays: 5, waterGoalDays: 4, loggedFoodDays: 6, avgKcal: 1980, weightChangeKg: -0.6, weightTowardGoal: true };
  const wk = candidates(facts({ now: satNow, week, days: [day(sat), day(new Date(sat.getTime() + 86_400_000))] })).find((n) => n.kind === 'weekRecap');
  check('Saturday 10:00: the weekly recap', !!wk && hm(wk.at) === '10:00');
  const wt = wk && renderNote(wk, lookup(en), 'en');
  check('…with the week in one line', !!wt && ['workouts 4/4', 'new records: 3', 'protein goal on 5 of 7 days', 'average 1,980 kcal', '−0.6 kg ✓'].every((b) => wt.body.includes(b)), wt?.body);
  check('a quiet week (fewer than 3 active days): no weekly recap', !candidates(facts({ now: satNow, week: { ...week, activeDays: 2 }, days: [day(sat), day(new Date(sat.getTime() + 86_400_000))] })).some((n) => n.kind === 'weekRecap'));
}

// ── welcome back, only if the app stays closed ──
{
  const come = candidates(facts()).filter((n) => n.kind === 'comeback');
  eq('gentle notes after 2, 5, 9 and 14 days, then silence', come.map((n) => Math.round((midnight(n.at).getTime() - TODAY.getTime()) / 86_400_000)), [2, 5, 9, 14]);
}

// ── wording: both languages, every kind, no missing text ──
function lookup(dict: unknown) {
  return (key: string, values: Record<string, unknown> = {}) => {
    const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dict);
    if (typeof v !== 'string') return `MISSING:${key}`;
    return v.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? `{{${k}}}`));
  };
}
{
  const f = facts({ fastEndsAt: new Date(2026, 9, 6, 12, 0), proteinFood: { name: 'Eggs', proteinG: 20 }, logStreak: 3,
    week: { activeDays: 5, workoutsDone: 3, workoutsPlanned: 4, prs: 1, proteinGoalDays: 3, waterGoalDays: 2, loggedFoodDays: 5, avgKcal: 2100, weightChangeKg: null, weightTowardGoal: false } },
  { protein: 30, mealsLogged: ['breakfast'], mealMinutes: [480], loggedAnything: true, plan: { title: 'Push', exercises: 4 }, missedYesterday: { title: 'Pull' }, program: { weekStarting: 2, total: 8 } });
  const all = [...candidates(f), ...candidates({ ...f, days: [f.days[0], day(new Date(2026, 9, 10))] })];
  const seenKinds = new Set(all.map((n) => n.kind));
  for (const [lang, dict] of [['en', en], ['ar', ar]] as const) {
    const t = lookup(dict);
    const missing = all.map((n) => renderNote(n, t, lang)).filter((r) => /MISSING|\{\{/.test(r.title + r.body));
    eq(`${lang}: every message renders fully (${seenKinds.size} kinds)`, missing, []);
  }
  const ar1 = renderNote(find(candidates(f), 'n-protein')!, lookup(ar), 'ar');
  check('Arabic uses Arabic digits and the food name', /[٠-٩]/.test(ar1.body) && ar1.body.includes('Eggs'), ar1.body);
  check('wording varies between days but not within one', variant('n-meal-lunch-2026-10-06', 3) === variant('n-meal-lunch-2026-10-06', 3));
}

// ── learning usual times from logs ──
{
  const meals = (slot: 'lunch' | 'snack' | undefined, hours: number[], days = 12) =>
    Array.from({ length: days }, (_, i) => ({ id: `m${i}`, at: new Date(2026, 9, 5 - i, hours[i % hours.length], 15).toISOString(), items: [{ name: 'x', calories: 1, proteinG: 1, carbsG: 0, fatG: 0, portion: '' }], mealType: slot }));
  const learned = learnMealTimes([...meals('lunch', [12, 13, 12]), ...meals(undefined, [20])], NOW);
  eq('learned lunch is the median time', learned.lunch, 12 * 60 + 15);
  eq('learned dinner from untyped meals at 20:15', learned.dinner, 20 * 60 + 15);
  eq('breakfast never logged over 12 days: never', learned.breakfast, 'never');
  eq('too few logs: use the default', learnMealTimes(meals('lunch', [12], 2), NOW).lunch, null);
  eq('a snack is never a main meal', slotOf({ id: 'a', at: new Date(2026, 9, 5, 13, 0).toISOString(), items: [], mealType: 'snack' }), null);
  eq('the usual glass is the most-logged amount', usualGlass([{ ml: 500 }, { ml: 330 }, { ml: 330 }, { ml: 250 }]), 330);
  const w = (d: number, h: number, kg: number) => ({ id: `w${d}`, at: new Date(2026, 9, d, h, 0).toISOString(), exerciseId: 'squat', exerciseName: 'Squat', type: 'weight_reps' as const, sets: [{ weightKg: kg, reps: 5, done: true }] });
  eq('usual training time from session starts', learnTrainingTime([w(1, 18, 80), w(2, 19, 80), w(3, 18, 80)], NOW), 18 * 60);
  eq('a heavier squat than ever before is a record', prsOn([w(1, 18, 80), w(6, 18, 85)] as never, TODAY), 1);
  eq('matching the old best is not', prsOn([w(1, 18, 80), w(6, 18, 80)] as never, TODAY), 0);
  const readings = [
    { at: new Date(2026, 9, 6, 8).toISOString(), kg: 82.4, bodyFatPercent: 21.0, skeletalMuscleMassKg: 36.2 },
    { at: new Date(2026, 8, 20, 8).toISOString(), kg: 83.1, bodyFatPercent: 22.2, skeletalMuscleMassKg: 35.8 },
  ];
  eq('a reading today: weight toward the goal, less fat, more muscle', bodyWinsOn(readings, TODAY, 'lose'), [
    { kind: 'weight', delta: -0.7 }, { kind: 'fat', delta: -1.2 }, { kind: 'muscle', delta: 0.4 },
  ]);
  eq('gaining is not a win when the goal is to lose… but fat and muscle still are', bodyWinsOn(readings, TODAY, 'gain').map((b) => b.kind), ['fat', 'muscle']);
}

// ── "Later" and the notification buttons ──
{
  const { categoryFor, categories, responseStep, routeFor, withSnooze } = await import('/home/user/CalApp/src/lib/notify/actions.ts');
  // Lunch reminder at 14:15 (13:30 + 45); it's 14:20 and they pressed "In 30 min".
  const at1420 = new Date(2026, 9, 6, 14, 20);
  const lunchId = 'n-meal-lunch-2026-10-06';
  const snoozed = planNotes(facts({ now: at1420, snoozed: { [lunchId]: new Date(2026, 9, 6, 14, 50).getTime() } }));
  const lunch = snoozed.find((n) => n.id === lunchId);
  check('Later: the lunch reminder comes back 30 minutes on', lunch != null && hm(lunch.at) === '14:50', lunch ? hm(lunch.at) : 'missing');
  const logged = planNotes(facts({ now: at1420, snoozed: { [lunchId]: new Date(2026, 9, 6, 14, 50).getTime() } }, { mealsLogged: ['lunch'], mealMinutes: [14 * 60 + 30] }));
  check('Later, then lunch logged: it never comes back', !logged.some((n) => n.id === lunchId));
  const stale = planNotes(facts({ now: at1420, snoozed: { [lunchId]: new Date(2026, 9, 6, 14, 0).getTime() } }));
  check('a snooze already past moves nothing', !stale.some((n) => n.id === lunchId));
  const quiet = planNotes(facts({ now: new Date(2026, 9, 6, 22, 50), snoozed: { 'n-meal-dinner-2026-10-06': new Date(2026, 9, 6, 23, 20).getTime() } }));
  check('Later never lands in quiet hours', !quiet.some((n) => n.id === 'n-meal-dinner-2026-10-06'));

  eq('water messages carry the water button', [categoryFor('water'), categoryFor('waterAfterWorkout')], ['calgym-water', 'calgym-water']);
  eq('meal, protein, training, missed have buttons; recaps do not', [categoryFor('meal'), categoryFor('protein'), categoryFor('training'), categoryFor('missed'), categoryFor('dayRecap'), categoryFor('comeback')], ['calgym-meal', 'calgym-protein', 'calgym-training', 'calgym-missed', null, null]);
  const tEn = (k: string, v?: Record<string, unknown>) => {
    let x: unknown = en;
    for (const part of k.split('.')) x = (x as Record<string, unknown>)?.[part];
    return typeof x === 'string' ? x.replace(/\{\{(\w+)\}\}/g, (_, n) => String(v?.[n] ?? '')) : `MISSING:${k}`;
  };
  const tAr = (k: string, v?: Record<string, unknown>) => {
    let x: unknown = ar;
    for (const part of k.split('.')) x = (x as Record<string, unknown>)?.[part];
    return typeof x === 'string' ? x.replace(/\{\{(\w+)\}\}/g, (_, n) => String(v?.[n] ?? '')) : `MISSING:${k}`;
  };
  const cats = categories(tEn, 330, 'en');
  eq('the water button is their usual glass', cats.find((c) => c.id === 'calgym-water')?.actions[0].buttonTitle, '+330 ml');
  check('background buttons stay in the background, screen buttons open the app',
    cats.every((c) => c.actions.every((a) => a.opensAppToForeground === (a.identifier === 'log-food' || a.identifier === 'start-workout'))));
  const arTitles = categories(tAr, 250, 'ar').flatMap((c) => c.actions.map((a) => a.buttonTitle));
  check('every button worded in Arabic', arTitles.every((x) => !x.includes('MISSING') && x.length > 0), arTitles.join(' | '));
  check('every button worded in English', cats.flatMap((c) => c.actions).every((a) => !a.buttonTitle.includes('MISSING')));

  eq('+ml logs their glass', responseStep('water', 'water-add', 330), { type: 'water', ml: 330 });
  eq('In 30 min snoozes 30', responseStep('meal', 'snooze-30', 250), { type: 'snooze', minutes: 30 });
  eq('Log meal opens logging', responseStep('meal', 'log-food', 250), { type: 'route', path: '/add-menu' });
  eq('Start workout starts it', responseStep('training', 'start-workout', 250), { type: 'startWorkout' });
  const TAP = 'expo.modules.notifications.actions.DEFAULT';
  eq('a tap goes where the message is about', ['meal', 'water', 'training', 'rest', 'dayRecap', 'trial'].map((k) => (responseStep(k, TAP, 250) as { path?: string }).path), ['/food', '/water', '/training', '/session', '/', '/upgrade']);
  eq('an unknown notification does nothing', responseStep(undefined, TAP, 250), { type: 'none' });
  check('every kind the planner sends has a place to go', ['meal', 'protein', 'fastEnd', 'water', 'waterAfterWorkout', 'training', 'restDay', 'missed', 'dayRecap', 'weekRecap', 'program', 'comeback'].every((k) => routeFor(k) != null));
  const now = new Date(2026, 9, 6, 12, 0);
  const kept = withSnooze({ old: new Date(2026, 9, 6, 11, 0).toISOString(), live: new Date(2026, 9, 6, 13, 0).toISOString() }, 'new', new Date(2026, 9, 6, 12, 30), now);
  eq('snoozes: past ones dropped, live ones kept', Object.keys(kept).sort(), ['live', 'new']);
}

// ── from stored data to a plan, as the app does it ──
{
  const { buildFacts } = await import('/home/user/CalApp/src/lib/notify/facts.ts');
  const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).toISOString();
  const state = {
    meals: [{ id: 'b', at: at(8, 10), items: [{ name: 'Eggs', calories: 300, proteinG: 24, carbsG: 2, fatG: 20, portion: '3' }], mealType: 'breakfast' }],
    water: [{ at: at(9), ml: 330 }],
    workouts: [],
    weights: [],
    schedule: { 2: { title: 'Push', exerciseIds: ['bench-press'] } },
    occurrences: {},
    skips: {},
    exercises: [],
    targets: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 70 },
    profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 80, activityLevel: 'moderate', goal: 'lose' },
    activeFast: null,
    activeProgram: null,
    whoopBurnByDay: {},
    whoopWorkoutsByDay: {},
    remindMeals: true,
    remindWater: true,
    remindWorkouts: true,
  };
  const f = buildFacts(state as never, { plan: 'pro', locks: true }, new Date(2026, 9, 6, 10, 0));
  check('today (a Tuesday) has the Push plan', f.days[0].plan?.title === 'Push');
  eq('breakfast is logged', f.days[0].mealsLogged, ['breakfast']);
  eq('water target from 80 kg is 2800 ml', f.targets.waterMl, 2800);
  const plan = planNotes(f);
  check('a real plan: no breakfast reminder, a lunch and a training note', !plan.some((n) => n.id.startsWith('n-meal-breakfast-2026-10-06')) && plan.some((n) => n.kind === 'training'), plan.map((n) => `${n.kind}@${hm(n.at)}`).join(' '));
  const foodOnly = buildFacts(state as never, { plan: 'essentials', locks: true, module: 'food' }, new Date(2026, 9, 6, 10, 0));
  check('Essentials Food from the real gate: training off', foodOnly.scope.training === false && foodOnly.scope.food === true);
  const none = buildFacts(state as never, { plan: 'free', locks: true }, new Date(2026, 9, 6, 10, 0));
  eq('no plan from the real gate: nothing planned', planNotes(none).length, 0);
  const off = buildFacts(state as never, {}, new Date(2026, 9, 6, 10, 0));
  check('locks off: everything covered', off.scope.food && off.scope.training && off.scope.health);
}

if (fails > 0) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);
