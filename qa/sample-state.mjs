// Realistic sample data for screenshots and audits: a guest with a week of
// food, Push/Pull/Legs, body readings and a coach chat, in English or Arabic.
// Used by qa/store-screenshots.mjs (web) and qa/android-audit (emulator).
// A fixed early evening, so the screens don't depend on when this runs:
// breakfast and lunch logged, dinner next, a workout under way.
export const now = new Date(); now.setHours(18, 20, 0, 0);
export const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const at = (daysAgo, h, m = 0) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.toISOString(); };
const today = now.getDay();

export function data(lang, withSession = false) {
  const ar = lang === 'ar';
  const L = (en, a) => (ar ? a : en);
  const ing = (en, a, amount, unit, kcal, p, c, f, aisle) => ({ name: L(en, a), key: en.toLowerCase().replace(/\s+/g, '_'), amount, unit, state: 'raw', calories: kcal, proteinG: p, carbsG: c, fatG: f, aisle });
  const kabsa = {
    id: 'r-kabsa', name: L('Chicken kabsa', 'كبسة دجاج'), servings: 4, createdAt: at(10, 12), language: lang, source: 'custom', reviewStatus: 'ready', prepMinutes: 20, cookMinutes: 60,
    ingredients: [
      ing('Chicken thighs', 'أفخاذ دجاج', 900, 'g', 1620, 170, 0, 100, 'meat'),
      ing('Basmati rice', 'أرز بسمتي', 400, 'g', 1440, 28, 316, 4, 'pantry'),
      ing('Onion', 'بصل', 150, 'g', 60, 2, 14, 0, 'produce'),
      ing('Tomatoes', 'طماطم', 200, 'g', 36, 2, 8, 0, 'produce'),
      ing('Kabsa spice mix', 'بهارات كبسة', 15, 'g', 40, 2, 6, 1, 'spices'),
      ing('Olive oil', 'زيت زيتون', 20, 'g', 176, 0, 0, 20, 'pantry'),
    ],
    steps: [L('Brown the chicken with onion and spices.', 'حمّر الدجاج مع البصل والبهارات.'), L('Add tomatoes and water; simmer 30 minutes.', 'أضف الطماطم والماء واتركه ٣٠ دقيقة.'), L('Add the rice, cover and cook until tender.', 'أضف الأرز وغطّه حتى ينضج.')],
  };
  const bowl = {
    id: 'r-bowl', name: L('Greek yogurt berry bowl', 'زبادي يوناني بالتوت'), servings: 1, createdAt: at(8, 8), language: lang, source: 'custom', reviewStatus: 'ready',
    ingredients: [ing('Greek yogurt', 'زبادي يوناني', 250, 'g', 240, 25, 9, 12, 'dairy'), ing('Mixed berries', 'توت مشكّل', 100, 'g', 50, 1, 12, 0, 'produce'), ing('Oats', 'شوفان', 30, 'g', 115, 4, 20, 2, 'pantry'), ing('Honey', 'عسل', 10, 'g', 30, 0, 8, 0, 'pantry')],
    steps: [L('Layer the yogurt, oats and berries; finish with honey.', 'رتّب الزبادي والشوفان والتوت، ثم أضف العسل.')],
  };
  const salad = {
    id: 'r-salad', name: L('Grilled chicken salad', 'سلطة دجاج مشوي'), servings: 2, createdAt: at(9, 12), language: lang, source: 'custom', reviewStatus: 'ready',
    ingredients: [ing('Chicken breast', 'صدر دجاج', 300, 'g', 495, 93, 0, 11, 'meat'), ing('Mixed greens', 'خضار ورقية', 200, 'g', 40, 3, 7, 0, 'produce'), ing('Feta', 'جبن فيتا', 60, 'g', 160, 9, 2, 13, 'dairy'), ing('Olive oil', 'زيت زيتون', 15, 'g', 132, 0, 0, 15, 'pantry')],
    steps: [L('Grill the chicken and slice.', 'اشوِ الدجاج وقطّعه.'), L('Toss with greens, feta and oil.', 'اخلطه مع الخضار والفيتا والزيت.')],
  };
  const item = (en, a, kcal, p, c, f, portion) => ({ name: L(en, a), calories: kcal, proteinG: p, carbsG: c, fatG: f, portion });
  const meals = [
    { id: 'm1', at: at(0, 8, 10), mealType: 'breakfast', items: [item('Shakshuka', 'شكشوكة', 370, 25, 30, 16, L('1 pan', 'مقلاة واحدة'))] },
    { id: 'm3', at: at(0, 10, 30), mealType: 'snack', items: [item('Greek yogurt', 'زبادي يوناني', 130, 17, 6, 4, L('170 g', '١٧٠ غ'))] },
    { id: 'm2', at: at(0, 13, 20), mealType: 'lunch', items: [item('Grilled chicken salad', 'سلطة دجاج مشوي', 414, 53, 5, 20, L('1 serving', 'حصة واحدة'))] },
  ];
  const sched = { title: L('Push', 'دفع'), exerciseIds: ['builtin:bench-press', 'builtin:incline-bench', 'builtin:shoulder-press', 'builtin:tricep-pushdown'],
    plans: { 'builtin:bench-press': [{ weightKg: 72.5, reps: 8 }, { weightKg: 72.5, reps: 8 }, { weightKg: 75, reps: 6 }] } };
  const pull = { title: L('Pull', 'سحب'), exerciseIds: ['builtin:lat-pulldown', 'builtin:seated-row', 'builtin:barbell-curl'] };
  const legs = { title: L('Legs', 'أرجل'), exerciseIds: ['builtin:squat', 'builtin:leg-press', 'builtin:leg-curl', 'builtin:calf-raise'] };
  // Push today, Legs in two days, Pull in four: the past days that fall on
  // those weekdays all have their workout logged, so nothing shows as missed.
  const schedule = { [today]: sched, [(today + 2) % 7]: legs, [(today + 4) % 7]: pull };
  const w = (id, daysAgo, ex, name, sets, h = 18) => ({ id, at: at(daysAgo, h), updatedAt: at(daysAgo, h, 40), exerciseId: `builtin:${ex}`, exerciseName: name, type: 'weight_reps', sets: sets.map(([kg, reps]) => ({ weightKg: kg, reps, done: true })) });
  const workouts = [
    w('w1', 7, 'bench-press', 'Barbell Bench Press', [[70, 8], [70, 8], [72.5, 6]]),
    w('w2', 7, 'incline-bench', 'Incline Bench', [[55, 10], [55, 9]]),
    w('w3', 3, 'lat-pulldown', 'Lat Pulldown', [[60, 10], [60, 10], [65, 8]]),
    w('w4', 5, 'squat', 'Squat', [[100, 6], [100, 6], [105, 5]]),
    w('w6', 7, 'shoulder-press', 'Shoulder Press', [[40, 10], [40, 9]]),
    w('w7', 7, 'tricep-pushdown', 'Tricep Pushdown', [[30, 12], [30, 12]]),
    w('w5', 0, 'bench-press', 'Barbell Bench Press', [[75, 8]], 18),
  ];
  // Newest first, as the app keeps them.
  const weights = Array.from({ length: 9 }, (_, i) => ({ at: at((8 - i) * 7, 7), kg: +(86.2 - i * 0.55).toFixed(1), bodyFatPercent: +(24.1 - i * 0.35).toFixed(1), skeletalMuscleMassKg: +(35.2 + i * 0.08).toFixed(1) })).reverse();
  // The latest reading came from a scanned report with per-limb lean mass, so the figure is coloured.
  Object.assign(weights[0], { source: 'scan', reportLabel: 'InBody 270', segmentalLeanMassKg: { leftArm: 2.6, rightArm: 2.7, trunk: 21.9, leftLeg: 7.9, rightLeg: 8.0 }, segmentalLeanMassStatus: { leftArm: 'normal', rightArm: 'normal', trunk: 'normal', leftLeg: 'high', rightLeg: 'high' } });
  const water = [{ at: at(0, 9), ml: 500 }, { at: at(0, 12), ml: 330 }, { at: at(0, 15), ml: 500 }];
  const coachMessages = [
    { role: 'user', content: L('How am I doing on protein this week?', 'كيف مستوى البروتين عندي هذا الأسبوع؟'), at: at(0, 14) },
    { role: 'assistant', content: L("You've averaged 142 g of protein a day this week against your 150 g target, and today you're at 88 g after lunch. A dinner with about 60 g, like a serving of chicken kabsa, closes the gap. Your bench press is also up: 75 kg for 8 today, your best set yet.", 'متوسطك هذا الأسبوع ١٤٢ غ بروتين يومياً مقابل هدفك ١٥٠ غ، واليوم وصلت إلى ٨٨ غ بعد الغداء. عشاء فيه نحو ٦٠ غ، مثل حصة من كبسة الدجاج، يكمل هدفك. وتحسّن ضغط البار أيضاً: ٧٥ كغ × ٨ اليوم، أفضل مجموعة لك حتى الآن.'), at: at(0, 14, 1) },
  ];
  return {
    language: lang, installId: `u_shots_${lang}`, account: { name: L('Sara', 'سارة'), provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', appearance: 'light', focusAreas: ['food', 'training'],
    profile: { sex: 'female', birthDate: '1993-04-12', heightCm: 168, weightKg: 81.8, activityLevel: 'moderate', goal: 'lose' },
    targets: { calories: 1900, proteinG: 150, carbsG: 180, fatG: 60 },
    schedule, savedSchedules: [{ id: 's-ppl', name: L('Push · Pull · Legs', 'دفع · سحب · أرجل'), days: schedule, createdAt: at(30, 9), activatedAt: at(30, 9) }], activeScheduleId: 's-ppl', workouts, exercises: [], meals, weights, water,
    recipes: [kabsa, salad, bowl], mealPlanRecipes: { [key(now)]: { breakfast: { recipeId: 'r-bowl', servings: 1 }, lunch: { recipeId: 'r-salad', servings: 1 }, dinner: { recipeId: 'r-kabsa', servings: 1 } } }, mealPlanSwaps: {},
    shopping: null, coachMessages, fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
    // A saved machine setup, so the workout shows My setup filled in.
    exerciseSetups: { 'builtin:bench-press': [{ at: at(21, 18), fields: [{ key: 'barHook', value: '7' }, { key: 'safety', value: '4' }, { key: 'other', label: L('Grip', 'القبضة'), value: L('one finger from the rings', 'إصبع واحد من العلامة') }] }] },
    activeSession: !withSession ? null : { startedAt: at(0, 17, 50), dayKey: key(now), exerciseIds: sched.exerciseIds, index: 0, currentId: 'builtin:bench-press', restEndsAt: new Date(now.getTime() + 75_000).toISOString(), restNext: L('Next: set 2 of 3 · Barbell Bench Press', 'التالي: المجموعة ٢ من ٣ · ضغط بار مسطح'), restSeconds: 90 },
    membershipPrompt: { firstSeenAt: new Date().toISOString(), introShown: true, lastShownAt: new Date().toISOString() },
    remindersInitialized: true, aiConsent: true,
  };
}

