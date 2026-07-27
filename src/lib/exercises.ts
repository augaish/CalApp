import type { Exercise, ExerciseType, Language, MuscleGroup } from './types';

/**
 * Built-in exercise library. Ships with the app (not persisted) so the library
 * is never empty and — crucially — a scanned machine can be matched to a
 * free local entry instead of spending AI tokens on a full analysis.
 *
 * Each entry carries English + Arabic names and `aliases` (common machine
 * names / spellings in both languages) used only for scan matching.
 */
type Seed = {
  id: string;
  en: string;
  ar: string;
  category: MuscleGroup;
  type?: ExerciseType; // defaults to 'weight_reps'
  aliases?: string[];
};

const SEEDS: Seed[] = [
  // ── Chest ──────────────────────────────────────────────
  { id: 'bench-press', en: 'Barbell Bench Press', ar: 'ضغط بار مسطح', category: 'chest', aliases: ['bench press', 'flat bench', 'بنش', 'ضغط صدر'] },
  { id: 'incline-bench', en: 'Incline Bench Press', ar: 'ضغط بار مائل', category: 'chest', aliases: ['incline bench', 'incline press', 'ضغط مائل'] },
  { id: 'dumbbell-press', en: 'Dumbbell Bench Press', ar: 'ضغط دمبل مسطح', category: 'chest', aliases: ['dumbbell press', 'db press', 'ضغط دمبل'] },
  { id: 'chest-fly', en: 'Pec Deck / Chest Fly', ar: 'جهاز تفتيح الصدر', category: 'chest', aliases: ['pec deck', 'pec fly', 'chest fly machine', 'butterfly', 'فراشة'] },
  { id: 'cable-crossover', en: 'Cable Crossover', ar: 'كابل كروس أوفر', category: 'chest', aliases: ['cable crossover', 'cable fly', 'كابل صدر'] },
  { id: 'chest-press-machine', en: 'Chest Press Machine', ar: 'جهاز ضغط الصدر', category: 'chest', aliases: ['chest press', 'seated chest press', 'جهاز صدر'] },
  { id: 'push-up', en: 'Push-Up', ar: 'تمرين الضغط', category: 'chest', type: 'bodyweight_reps', aliases: ['push up', 'pushup', 'ضغط'] },

  // ── Back ───────────────────────────────────────────────
  { id: 'lat-pulldown', en: 'Lat Pulldown', ar: 'سحب علوي (لات)', category: 'back', aliases: ['lat pulldown', 'lat pull down', 'pulldown', 'سحب علوي', 'لات بول داون', 'جهاز سحب علوي'] },
  { id: 'seated-row', en: 'Seated Cable Row', ar: 'تجديف جالس بالكابل', category: 'back', aliases: ['seated row', 'cable row', 'low row', 'تجديف', 'روو'] },
  { id: 'bent-over-row', en: 'Barbell Row', ar: 'تجديف بار منحني', category: 'back', aliases: ['barbell row', 'bent over row', 'تجديف بار'] },
  { id: 'pull-up', en: 'Pull-Up', ar: 'العقلة', category: 'back', type: 'bodyweight_reps', aliases: ['pull up', 'pullup', 'chin up', 'عقلة', 'سحب عقلة'] },
  { id: 'deadlift', en: 'Deadlift', ar: 'الرفعة الميتة', category: 'back', aliases: ['deadlift', 'ديدليفت', 'رفعة ميتة'] },
  { id: 't-bar-row', en: 'T-Bar Row', ar: 'تجديف تي بار', category: 'back', aliases: ['t-bar row', 't bar', 'تي بار'] },

  // ── Shoulders ──────────────────────────────────────────
  { id: 'shoulder-press', en: 'Shoulder Press', ar: 'ضغط الكتف', category: 'shoulders', aliases: ['shoulder press', 'overhead press', 'military press', 'ضغط كتف', 'جهاز كتف'] },
  { id: 'lateral-raise', en: 'Lateral Raise', ar: 'رفرفة جانبية', category: 'shoulders', aliases: ['lateral raise', 'side raise', 'رفرفة جانبية'] },
  { id: 'front-raise', en: 'Front Raise', ar: 'رفرفة أمامية', category: 'shoulders', aliases: ['front raise', 'رفرفة أمامية', 'رفع أمامي'] },
  { id: 'rear-delt-fly', en: 'Rear Delt Fly', ar: 'رفرفة خلفية', category: 'shoulders', aliases: ['rear delt', 'reverse fly', 'رفرفة خلفية'] },
  { id: 'face-pull', en: 'Face Pull', ar: 'سحب للوجه', category: 'shoulders', aliases: ['face pull', 'سحب وجه'] },
  { id: 'shrug', en: 'Shrug', ar: 'هز الأكتاف', category: 'shoulders', aliases: ['shrug', 'trap', 'هز أكتاف'] },

  // ── Biceps ─────────────────────────────────────────────
  { id: 'barbell-curl', en: 'Barbell Curl', ar: 'مرجحة بار', category: 'biceps', aliases: ['barbell curl', 'bicep curl', 'باي بار', 'مرجحة'] },
  { id: 'dumbbell-curl', en: 'Dumbbell Curl', ar: 'مرجحة دمبل', category: 'biceps', aliases: ['dumbbell curl', 'db curl', 'باي دمبل'] },
  { id: 'hammer-curl', en: 'Hammer Curl', ar: 'مرجحة مطرقة', category: 'biceps', aliases: ['hammer curl', 'هامر'] },
  { id: 'preacher-curl', en: 'Preacher Curl', ar: 'مرجحة كرسي القسيس', category: 'biceps', aliases: ['preacher curl', 'preacher', 'بريتشر'] },
  { id: 'cable-curl', en: 'Cable Curl', ar: 'مرجحة كابل', category: 'biceps', aliases: ['cable curl', 'باي كابل'] },

  // ── Triceps ────────────────────────────────────────────
  { id: 'tricep-pushdown', en: 'Triceps Pushdown', ar: 'دفع الترايسبس بالكابل', category: 'triceps', aliases: ['pushdown', 'tricep pushdown', 'rope pushdown', 'تراي كابل', 'دفع ترايسبس'] },
  { id: 'tricep-extension', en: 'Overhead Triceps Extension', ar: 'تمديد الترايسبس علوي', category: 'triceps', aliases: ['overhead extension', 'tricep extension', 'تمديد ترايسبس'] },
  { id: 'dips', en: 'Dips', ar: 'الغطس (ديبس)', category: 'triceps', type: 'bodyweight_reps', aliases: ['dips', 'dip', 'ديبس', 'غطس'] },
  { id: 'skull-crusher', en: 'Skull Crusher', ar: 'كسر الجمجمة', category: 'triceps', aliases: ['skull crusher', 'lying extension', 'سكل كراشر'] },
  { id: 'close-grip-bench', en: 'Close-Grip Bench Press', ar: 'ضغط بقبضة ضيقة', category: 'triceps', aliases: ['close grip bench', 'قبضة ضيقة'] },

  // ── Legs ───────────────────────────────────────────────
  { id: 'squat', en: 'Barbell Squat', ar: 'سكوات بار', category: 'legs', aliases: ['squat', 'back squat', 'سكوات', 'قرفصاء'] },
  { id: 'leg-press', en: 'Leg Press', ar: 'جهاز دفع الأرجل', category: 'legs', aliases: ['leg press', 'جهاز أرجل', 'دفع أرجل', 'ليج برس'] },
  { id: 'leg-extension', en: 'Leg Extension', ar: 'تمديد الأرجل', category: 'legs', aliases: ['leg extension', 'quad extension', 'تمديد أرجل', 'مقدمة فخذ'] },
  { id: 'leg-curl', en: 'Leg Curl', ar: 'ثني الأرجل', category: 'legs', aliases: ['leg curl', 'hamstring curl', 'ثني أرجل', 'خلفية فخذ'] },
  { id: 'lunge', en: 'Lunge', ar: 'الطعنات', category: 'legs', aliases: ['lunge', 'walking lunge', 'طعنات'] },
  { id: 'calf-raise', en: 'Calf Raise', ar: 'رفع السمانة', category: 'legs', aliases: ['calf raise', 'سمانة', 'رفع سمانة'] },
  { id: 'romanian-deadlift', en: 'Romanian Deadlift', ar: 'الرفعة الرومانية', category: 'legs', aliases: ['romanian deadlift', 'rdl', 'رفعة رومانية'] },

  // ── Glutes ─────────────────────────────────────────────
  { id: 'hip-thrust', en: 'Hip Thrust', ar: 'دفع الحوض', category: 'glutes', aliases: ['hip thrust', 'glute bridge', 'دفع حوض', 'هيب ثرست'] },
  { id: 'glute-kickback', en: 'Glute Kickback', ar: 'ركلة المؤخرة', category: 'glutes', aliases: ['kickback', 'glute kickback', 'ركلة خلفية'] },
  { id: 'abductor', en: 'Hip Abductor Machine', ar: 'جهاز مباعدة الأرجل', category: 'glutes', aliases: ['abductor', 'hip abduction', 'مباعدة'] },

  // ── Core ───────────────────────────────────────────────
  { id: 'plank', en: 'Plank', ar: 'البلانك', category: 'core', type: 'time', aliases: ['plank', 'بلانك'] },
  { id: 'crunch', en: 'Crunch', ar: 'الكرنش', category: 'core', type: 'bodyweight_reps', aliases: ['crunch', 'كرنش', 'بطن'] },
  { id: 'leg-raise', en: 'Hanging Leg Raise', ar: 'رفع الأرجل معلقاً', category: 'core', type: 'bodyweight_reps', aliases: ['leg raise', 'رفع أرجل'] },
  { id: 'cable-crunch', en: 'Cable Crunch', ar: 'كرنش بالكابل', category: 'core', aliases: ['cable crunch', 'كرنش كابل'] },
  { id: 'russian-twist', en: 'Russian Twist', ar: 'اللف الروسي', category: 'core', type: 'bodyweight_reps', aliases: ['russian twist', 'لف روسي'] },

  // ── Forearms ───────────────────────────────────────────
  { id: 'wrist-curl', en: 'Wrist Curl', ar: 'مرجحة الرسغ', category: 'forearms', aliases: ['wrist curl', 'مرجحة رسغ'] },
  { id: 'reverse-curl', en: 'Reverse Curl', ar: 'مرجحة عكسية', category: 'forearms', aliases: ['reverse curl', 'مرجحة عكسية'] },

  // ── Cardio ─────────────────────────────────────────────
  { id: 'treadmill', en: 'Treadmill', ar: 'جهاز المشي', category: 'cardio', type: 'distance_time', aliases: ['treadmill', 'running', 'جهاز مشي', 'جري'] },
  { id: 'cycling', en: 'Stationary Bike', ar: 'الدراجة الثابتة', category: 'cardio', type: 'distance_time', aliases: ['bike', 'cycling', 'دراجة', 'سايكل'] },
  { id: 'elliptical', en: 'Elliptical', ar: 'الجهاز الإهليلجي', category: 'cardio', type: 'distance_time', aliases: ['elliptical', 'أوربتراك'] },
  { id: 'rowing', en: 'Rowing Machine', ar: 'جهاز التجديف', category: 'cardio', type: 'distance_time', aliases: ['rowing', 'rower', 'جهاز تجديف'] },

  // ── Added library (Calgym request) ─────────────────────
  // Chest
  { id: 'decline-chest-press', en: 'Decline Chest Press', ar: 'ضغط صدر منحدر', category: 'chest', aliases: ['decline chest press', 'decline press', 'ضغط صدر منحدر', 'ديكلاين'] },
  { id: 'incline-dumbbell-press', en: 'Incline Dumbbell Press', ar: 'ضغط دمبل مائل', category: 'chest', aliases: ['incline chest dumbbell', 'incline dumbbell press', 'ضغط دمبل مائل'] },
  { id: 'pec-fly-cable', en: 'Cable Pec Fly', ar: 'تفتيح الصدر بالكابل', category: 'chest', aliases: ['pec fly cable', 'cable fly', 'تفتيح كابل', 'بيك فلاي'] },
  // Back
  { id: 'seated-row-close-grip', en: 'Seated Cable Row (Close Grip)', ar: 'تجديف كابل بقبضة ضيقة', category: 'back', aliases: ['seated row cable close grip', 'close grip row', 'تجديف قبضة ضيقة'] },
  { id: 'lat-pulldown-close-grip', en: 'Lat Pulldown (Close Grip)', ar: 'سحب علوي بقبضة ضيقة', category: 'back', aliases: ['close grip lat pulldown', 'close grip pulldown', 'سحب علوي ضيق'] },
  { id: 'mckenzie-press-up', en: 'McKenzie Press Up', ar: 'تمديد الظهر (مكينزي)', category: 'back', type: 'bodyweight_reps', aliases: ['mckenzie press up', 'press up', 'back extension floor', 'مكينزي'] },
  // Shoulders
  { id: 'lateral-raise-cable', en: 'Cable Lateral Raise', ar: 'رفرفة جانبية بالكابل', category: 'shoulders', aliases: ['lateral raise cable', 'cable side raise', 'رفرفة كابل'] },
  { id: 'seated-shoulder-press', en: 'Seated Shoulder Press', ar: 'ضغط كتف جالس', category: 'shoulders', aliases: ['seated shoulder press', 'seated press', 'ضغط كتف جالس', 'جهاز ضغط كتف'] },
  { id: 'rear-delt-cross-cable', en: 'Rear Delt Cross Cable', ar: 'تفتيح خلفي متقاطع بالكابل', category: 'shoulders', aliases: ['rear delt cross cable', 'reverse cable fly', 'تفتيح خلفي كابل'] },
  { id: 'shrug-dumbbell', en: 'Dumbbell Shrug', ar: 'هز الأكتاف بالدمبل', category: 'shoulders', aliases: ['shrugs dumbbell', 'dumbbell shrug', 'هز أكتاف دمبل'] },
  // Biceps
  { id: 'behind-body-cable-curl', en: 'Behind-the-Body Cable Curl', ar: 'مرجحة كابل خلف الجسم', category: 'biceps', aliases: ['behind body cable curl', 'bayesian curl', 'مرجحة كابل خلفية'] },
  { id: 'preacher-curl-dumbbell', en: 'Dumbbell Preacher Curl', ar: 'مرجحة كرسي القسيس بالدمبل', category: 'biceps', aliases: ['preacher curl dumbbell', 'dumbbell preacher', 'بريتشر دمبل'] },
  // Triceps
  { id: 'pushdown-triangle', en: 'Triangle Bar Pushdown', ar: 'دفع الترايسبس بالمقبض المثلث', category: 'triceps', aliases: ['push down triangle', 'v-bar pushdown', 'دفع مثلث'] },
  // Legs
  { id: 'bulgarian-split-squat', en: 'Bulgarian Split Squat', ar: 'سكوات بلغاري', category: 'legs', aliases: ['bulgarian split squat', 'split squat', 'سكوات بلغاري'] },
  { id: 'hack-squat', en: 'Hack Squat', ar: 'هاك سكوات', category: 'legs', aliases: ['hack squat', 'hack squat calf', 'هاك سكوات'] },
  { id: 'seated-calf-raise', en: 'Seated Calf Raise', ar: 'رفع السمانة جالساً', category: 'legs', aliases: ['seated calf raise', 'رفع سمانة جالس'] },
  // Glutes
  { id: 'hip-thrust-machine', en: 'Hip Thrust Machine', ar: 'جهاز دفع الحوض', category: 'glutes', aliases: ['hip thrust machine', 'جهاز هيب ثرست', 'جهاز دفع حوض'] },
  { id: 'glute-master', en: 'Glute Master', ar: 'جهاز مدرب المؤخرة', category: 'glutes', aliases: ['glute master', 'glute machine', 'جهاز جلوت'] },
  // Core
  { id: 'bird-dog', en: 'Bird Dog', ar: 'وضعية الطائر والكلب', category: 'core', type: 'bodyweight_reps', aliases: ['bird dog', 'بيرد دوق'] },
  { id: 'one-leg-stretch', en: 'Single-Leg Stretch', ar: 'تمديد الساق الواحدة', category: 'core', type: 'bodyweight_reps', aliases: ['one leg stretch', 'single leg stretch', 'تمديد ساق'] },
  { id: 'iso-hold', en: 'Iso Hold', ar: 'ثبات إيزومتري', category: 'core', type: 'time', aliases: ['iso hold', 'isometric hold', 'ثبات'] },
  { id: 'cat-cow', en: 'Cat-Cow', ar: 'وضعية القط والبقرة', category: 'core', type: 'bodyweight_reps', aliases: ['cat cow', 'كات كاو'] },
  { id: 'dead-bug', en: 'Dead Bug', ar: 'وضعية الحشرة الميتة', category: 'core', type: 'bodyweight_reps', aliases: ['dead bug', 'ديد بق'] },
  // Forearms
  { id: 'reverse-curl-cable', en: 'Cable Reverse Curl', ar: 'مرجحة عكسية بالكابل', category: 'forearms', aliases: ['reverse curl cable', 'cable reverse curl', 'مرجحة عكسية كابل'] },
  { id: 'wrist-curl-cable', en: 'Cable Wrist Curl', ar: 'مرجحة الرسغ بالكابل', category: 'forearms', aliases: ['wrist curl cable', 'cable wrist curl', 'مرجحة رسغ كابل'] },
];

export const BUILTIN_EXERCISES: Exercise[] = SEEDS.map((s) => ({
  id: `builtin:${s.id}`,
  name: s.en,
  nameEn: s.en,
  nameAr: s.ar,
  category: s.category,
  type: s.type ?? 'weight_reps',
  aliases: s.aliases,
  source: 'builtin',
}));

/** Ordered muscle-group categories for library grouping. */
export const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'glutes',
  'core',
  'forearms',
  'cardio',
  'fullBody',
];

/** Distinct accent color per muscle group (used on chips, tags, the library). */
export const MUSCLE_COLORS: Record<MuscleGroup, string> = {
  chest: '#E5574E', // red
  back: '#3FA96A', // green
  shoulders: '#E8B93B', // yellow
  biceps: '#4C86E0', // blue
  triceps: '#9B6DD6', // violet
  legs: '#E8863B', // orange
  glutes: '#E06AA6', // pink
  core: '#2CB8A6', // teal
  forearms: '#B98A4E', // amber/brown
  cardio: '#3FB6D6', // cyan
  fullBody: '#8C7BC7', // lavender
};

/** Localized display name for an exercise. */
export function exerciseName(ex: Exercise, lang: Language): string {
  if (lang === 'ar') return ex.nameAr ?? ex.name;
  return ex.nameEn ?? ex.name;
}

/** Built-ins first, then the user's custom/scan exercises. */
export function allExercises(custom: Exercise[]): Exercise[] {
  return [...BUILTIN_EXERCISES, ...custom];
}

export function findExercise(id: string, custom: Exercise[]): Exercise | undefined {
  return allExercises(custom).find((e) => e.id === id);
}

/** Lowercase, strip Arabic diacritics and non-letters for fuzzy matching. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '') // Arabic tashkeel
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Try to match a scanned/typed machine name to an existing exercise (built-in
 * or custom). A hit means we can skip the token-heavy AI analysis entirely.
 */
export function matchExerciseByName(
  name: string,
  custom: Exercise[],
): Exercise | undefined {
  const q = normalize(name);
  if (!q) return undefined;
  const pool = allExercises(custom);
  // 1) exact name (either language) or alias match
  for (const ex of pool) {
    const candidates = [ex.name, ex.nameEn, ex.nameAr, ...(ex.aliases ?? [])]
      .filter(Boolean)
      .map((c) => normalize(c as string));
    if (candidates.some((c) => c === q)) return ex;
  }
  // 2) containment either direction (e.g. "seated lat pulldown" ⊃ "lat pulldown")
  for (const ex of pool) {
    const candidates = [ex.name, ex.nameEn, ex.nameAr, ...(ex.aliases ?? [])]
      .filter(Boolean)
      .map((c) => normalize(c as string))
      .filter((c) => c.length >= 4);
    if (candidates.some((c) => q.includes(c) || c.includes(q))) return ex;
  }
  return undefined;
}
