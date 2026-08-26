import type { Exercise, ExerciseType, Language, MuscleGroup, MuscleId } from './types';

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
  /** Precise muscles for the muscle-map illustration — see Exercise.primaryMuscles. */
  primaryMuscles?: MuscleId[];
  secondaryMuscles?: MuscleId[];
  type?: ExerciseType; // defaults to 'weight_reps'
  aliases?: string[];
};

const SEEDS: Seed[] = [
  // ── Chest ──────────────────────────────────────────────
  { id: 'bench-press', en: 'Barbell Bench Press', ar: 'ضغط بار مسطح', category: 'chest', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'], aliases: ['bench press', 'flat bench', 'بنش', 'ضغط صدر'] },
  { id: 'incline-bench', en: 'Incline Bench Press', ar: 'ضغط بار مائل', category: 'chest', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'], aliases: ['incline bench', 'incline press', 'ضغط مائل'] },
  { id: 'dumbbell-press', en: 'Dumbbell Bench Press', ar: 'ضغط دمبل مسطح', category: 'chest', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'], aliases: ['dumbbell press', 'db press', 'ضغط دمبل'] },
  { id: 'chest-fly', en: 'Pec Deck / Chest Fly', ar: 'جهاز تفتيح الصدر', category: 'chest', primaryMuscles: ['chest'], secondaryMuscles: ['front_delts'], aliases: ['pec deck', 'pec fly', 'chest fly machine', 'butterfly', 'فراشة'] },
  { id: 'cable-crossover', en: 'Cable Crossover', ar: 'كابل كروس أوفر', category: 'chest', primaryMuscles: ['chest'], secondaryMuscles: ['front_delts'], aliases: ['cable crossover', 'cable fly', 'كابل صدر'] },
  { id: 'chest-press-machine', en: 'Chest Press Machine', ar: 'جهاز ضغط الصدر', category: 'chest', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'], aliases: ['chest press', 'seated chest press', 'جهاز صدر'] },
  { id: 'push-up', en: 'Push-Up', ar: 'تمرين الضغط', category: 'chest', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts', 'abs'], type: 'bodyweight_reps', aliases: ['push up', 'pushup', 'ضغط'] },

  // ── Back ───────────────────────────────────────────────
  { id: 'lat-pulldown', en: 'Lat Pulldown', ar: 'سحب علوي (لات)', category: 'back', primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'rhomboids', 'traps', 'rear_delts'], aliases: ['lat pulldown', 'lat pull down', 'pulldown', 'سحب علوي', 'لات بول داون', 'جهاز سحب علوي'] },
  { id: 'seated-row', en: 'Seated Cable Row', ar: 'تجديف جالس بالكابل', category: 'back', primaryMuscles: ['lats', 'rhomboids', 'traps'], secondaryMuscles: ['rear_delts', 'biceps', 'forearms'], aliases: ['seated row', 'cable row', 'low row', 'تجديف', 'روو'] },
  { id: 'bent-over-row', en: 'Barbell Row', ar: 'تجديف بار منحني', category: 'back', primaryMuscles: ['lats', 'rhomboids', 'traps'], secondaryMuscles: ['rear_delts', 'biceps', 'lower_back'], aliases: ['barbell row', 'bent over row', 'تجديف بار'] },
  { id: 'pull-up', en: 'Pull-Up', ar: 'العقلة', category: 'back', primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'rhomboids', 'traps', 'rear_delts', 'forearms'], type: 'bodyweight_reps', aliases: ['pull up', 'pullup', 'chin up', 'عقلة', 'سحب عقلة'] },
  { id: 'assisted-pull-up-machine', en: 'Assisted Pull-Up / Chin-Up Machine (Kneeling)', ar: 'جهاز العقلة المساعد (جلوس على الركبة)', category: 'back', primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'rhomboids', 'traps', 'rear_delts', 'forearms'], aliases: ['assisted pull up machine', 'assisted chin up machine', 'assisted pull-up machine', 'kneeling pull up machine', 'kneeling chin dip machine', 'chin dip machine', 'assisted chin dip machine', 'مساعد عقلة', 'جهاز عقلة مساعد', 'جهاز شد مساعد بالركبة'] },
  { id: 'deadlift', en: 'Deadlift', ar: 'الرفعة الميتة', category: 'back', primaryMuscles: ['lower_back', 'lats', 'traps'], secondaryMuscles: ['glutes', 'hamstrings', 'forearms', 'quads'], aliases: ['deadlift', 'ديدليفت', 'رفعة ميتة'] },
  { id: 't-bar-row', en: 'T-Bar Row', ar: 'تجديف تي بار', category: 'back', primaryMuscles: ['lats', 'rhomboids', 'traps'], secondaryMuscles: ['rear_delts', 'biceps'], aliases: ['t-bar row', 't bar', 'تي بار'] },

  // ── Shoulders ──────────────────────────────────────────
  { id: 'shoulder-press', en: 'Shoulder Press', ar: 'ضغط الكتف', category: 'shoulders', primaryMuscles: ['front_delts', 'side_delts'], secondaryMuscles: ['triceps', 'traps'], aliases: ['shoulder press', 'overhead press', 'military press', 'ضغط كتف', 'جهاز كتف'] },
  { id: 'lateral-raise', en: 'Lateral Raise', ar: 'رفرفة جانبية', category: 'shoulders', primaryMuscles: ['side_delts'], secondaryMuscles: ['traps'], aliases: ['lateral raise', 'side raise', 'رفرفة جانبية'] },
  { id: 'front-raise', en: 'Front Raise', ar: 'رفرفة أمامية', category: 'shoulders', primaryMuscles: ['front_delts'], aliases: ['front raise', 'رفرفة أمامية', 'رفع أمامي'] },
  { id: 'rear-delt-fly', en: 'Rear Delt Fly', ar: 'رفرفة خلفية', category: 'shoulders', primaryMuscles: ['rear_delts'], secondaryMuscles: ['rhomboids', 'traps'], aliases: ['rear delt', 'reverse fly', 'رفرفة خلفية'] },
  { id: 'face-pull', en: 'Face Pull', ar: 'سحب للوجه', category: 'shoulders', primaryMuscles: ['rear_delts'], secondaryMuscles: ['rhomboids', 'traps'], aliases: ['face pull', 'سحب وجه'] },
  { id: 'shrug', en: 'Shrug', ar: 'هز الأكتاف', category: 'shoulders', primaryMuscles: ['traps'], secondaryMuscles: ['rhomboids', 'forearms'], aliases: ['shrug', 'trap', 'هز أكتاف'] },

  // ── Biceps ─────────────────────────────────────────────
  { id: 'barbell-curl', en: 'Barbell Curl', ar: 'مرجحة بار', category: 'biceps', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], aliases: ['barbell curl', 'bicep curl', 'باي بار', 'مرجحة'] },
  { id: 'dumbbell-curl', en: 'Dumbbell Curl', ar: 'مرجحة دمبل', category: 'biceps', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], aliases: ['dumbbell curl', 'db curl', 'باي دمبل'] },
  { id: 'hammer-curl', en: 'Hammer Curl', ar: 'مرجحة مطرقة', category: 'biceps', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], aliases: ['hammer curl', 'هامر'] },
  { id: 'preacher-curl', en: 'Preacher Curl', ar: 'مرجحة كرسي القسيس', category: 'biceps', primaryMuscles: ['biceps'], aliases: ['preacher curl', 'preacher', 'بريتشر'] },
  { id: 'cable-curl', en: 'Cable Curl', ar: 'مرجحة كابل', category: 'biceps', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], aliases: ['cable curl', 'باي كابل'] },

  // ── Triceps ────────────────────────────────────────────
  { id: 'tricep-pushdown', en: 'Triceps Pushdown', ar: 'دفع الترايسبس بالكابل', category: 'triceps', primaryMuscles: ['triceps'], secondaryMuscles: ['forearms'], aliases: ['pushdown', 'tricep pushdown', 'rope pushdown', 'تراي كابل', 'دفع ترايسبس'] },
  { id: 'tricep-extension', en: 'Overhead Triceps Extension', ar: 'تمديد الترايسبس علوي', category: 'triceps', primaryMuscles: ['triceps'], secondaryMuscles: ['side_delts', 'abs'], aliases: ['overhead extension', 'tricep extension', 'تمديد ترايسبس'] },
  { id: 'dips', en: 'Dips', ar: 'الغطس (ديبس)', category: 'triceps', primaryMuscles: ['triceps'], secondaryMuscles: ['chest', 'front_delts'], type: 'bodyweight_reps', aliases: ['dips', 'dip', 'ديبس', 'غطس'] },
  { id: 'assisted-dip-machine', en: 'Assisted Dip Machine (Kneeling)', ar: 'جهاز الغطس المساعد (جلوس على الركبة)', category: 'triceps', primaryMuscles: ['triceps'], secondaryMuscles: ['chest', 'front_delts'], aliases: ['assisted dip machine', 'kneeling dip machine', 'kneeling chin dip machine', 'chin dip machine', 'assisted chin dip machine', 'مساعد غطس', 'جهاز غطس مساعد', 'جهاز غطس مساعد بالركبة'] },
  { id: 'skull-crusher', en: 'Skull Crusher', ar: 'كسر الجمجمة', category: 'triceps', primaryMuscles: ['triceps'], aliases: ['skull crusher', 'lying extension', 'سكل كراشر'] },
  { id: 'close-grip-bench', en: 'Close-Grip Bench Press', ar: 'ضغط بقبضة ضيقة', category: 'triceps', primaryMuscles: ['triceps'], secondaryMuscles: ['chest', 'front_delts'], aliases: ['close grip bench', 'قبضة ضيقة'] },

  // ── Legs ───────────────────────────────────────────────
  { id: 'squat', en: 'Barbell Squat', ar: 'سكوات بار', category: 'legs', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'adductors', 'abs'], aliases: ['squat', 'back squat', 'سكوات', 'قرفصاء'] },
  { id: 'leg-press', en: 'Leg Press', ar: 'جهاز دفع الأرجل', category: 'legs', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'adductors', 'calves'], aliases: ['leg press', 'جهاز أرجل', 'دفع أرجل', 'ليج برس'] },
  { id: 'leg-extension', en: 'Leg Extension', ar: 'تمديد الأرجل', category: 'legs', primaryMuscles: ['quads'], secondaryMuscles: ['hip_flexors'], aliases: ['leg extension', 'quad extension', 'تمديد أرجل', 'مقدمة فخذ'] },
  { id: 'leg-curl', en: 'Lying Leg Curl', ar: 'ثني الأرجل مستلقياً', category: 'legs', primaryMuscles: ['hamstrings'], secondaryMuscles: ['calves'], aliases: ['leg curl', 'lying leg curl', 'hamstring curl', 'ثني أرجل', 'خلفية فخذ'] },
  { id: 'lunge', en: 'Lunge', ar: 'الطعنات', category: 'legs', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'adductors', 'abs'], aliases: ['lunge', 'walking lunge', 'طعنات'] },
  { id: 'calf-raise', en: 'Standing Calf Raise', ar: 'رفع السمانة واقفاً', category: 'calves', primaryMuscles: ['calves'], aliases: ['calf raise', 'standing calf raise', 'سمانة', 'رفع سمانة'] },
  { id: 'romanian-deadlift', en: 'Romanian Deadlift', ar: 'الرفعة الرومانية', category: 'legs', primaryMuscles: ['hamstrings', 'glutes'], secondaryMuscles: ['lower_back', 'lats'], aliases: ['romanian deadlift', 'rdl', 'رفعة رومانية'] },

  // ── Glutes ─────────────────────────────────────────────
  { id: 'hip-thrust', en: 'Hip Thrust', ar: 'دفع الحوض', category: 'glutes', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings', 'adductors', 'quads'], aliases: ['hip thrust', 'glute bridge', 'دفع حوض', 'هيب ثرست'] },
  { id: 'glute-kickback', en: 'Glute Kickback', ar: 'ركلة المؤخرة', category: 'glutes', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], aliases: ['kickback', 'glute kickback', 'ركلة خلفية'] },
  { id: 'abductor', en: 'Hip Abductor Machine', ar: 'جهاز مباعدة الأرجل', category: 'glutes', primaryMuscles: ['glutes'], aliases: ['abductor', 'hip abduction', 'مباعدة'] },

  // ── Core ───────────────────────────────────────────────
  { id: 'plank', en: 'Plank', ar: 'البلانك', category: 'core', primaryMuscles: ['abs', 'obliques'], secondaryMuscles: ['glutes', 'lower_back', 'front_delts', 'quads'], type: 'time', aliases: ['plank', 'بلانك'] },
  { id: 'crunch', en: 'Crunch', ar: 'الكرنش', category: 'core', primaryMuscles: ['abs'], type: 'bodyweight_reps', aliases: ['crunch', 'كرنش', 'بطن'] },
  { id: 'leg-raise', en: 'Hanging Leg Raise', ar: 'رفع الأرجل معلقاً', category: 'core', primaryMuscles: ['abs'], secondaryMuscles: ['hip_flexors'], type: 'bodyweight_reps', aliases: ['leg raise', 'رفع أرجل'] },
  { id: 'cable-crunch', en: 'Cable Crunch', ar: 'كرنش بالكابل', category: 'core', primaryMuscles: ['abs'], aliases: ['cable crunch', 'كرنش كابل'] },
  { id: 'russian-twist', en: 'Russian Twist', ar: 'اللف الروسي', category: 'core', primaryMuscles: ['obliques'], secondaryMuscles: ['abs'], type: 'bodyweight_reps', aliases: ['russian twist', 'لف روسي'] },

  // ── Forearms ───────────────────────────────────────────
  { id: 'wrist-curl', en: 'Wrist Curl', ar: 'مرجحة الرسغ', category: 'forearms', primaryMuscles: ['forearms'], aliases: ['wrist curl', 'مرجحة رسغ'] },
  { id: 'reverse-curl', en: 'Reverse Curl', ar: 'مرجحة عكسية', category: 'forearms', primaryMuscles: ['forearms'], secondaryMuscles: ['biceps'], aliases: ['reverse curl', 'مرجحة عكسية'] },

  // ── Cardio ─────────────────────────────────────────────
  { id: 'treadmill', en: 'Treadmill', ar: 'جهاز المشي', category: 'cardio', type: 'distance_time', aliases: ['treadmill', 'running', 'جهاز مشي', 'جري'] },
  { id: 'cycling', en: 'Stationary Bike', ar: 'الدراجة الثابتة', category: 'cardio', type: 'distance_time', aliases: ['bike', 'cycling', 'دراجة', 'سايكل'] },
  { id: 'elliptical', en: 'Elliptical', ar: 'الجهاز الإهليلجي', category: 'cardio', type: 'distance_time', aliases: ['elliptical', 'أوربتراك'] },
  { id: 'rowing', en: 'Rowing Machine', ar: 'جهاز التجديف', category: 'cardio', type: 'distance_time', aliases: ['rowing', 'rower', 'جهاز تجديف'] },

  // ── Added library (Calgym request) ─────────────────────
  // Chest
  { id: 'decline-chest-press', en: 'Decline Chest Press', ar: 'ضغط صدر منحدر', category: 'chest', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'], aliases: ['decline chest press', 'decline press', 'ضغط صدر منحدر', 'ديكلاين'] },
  { id: 'incline-dumbbell-press', en: 'Incline Dumbbell Press', ar: 'ضغط دمبل مائل', category: 'chest', primaryMuscles: ['chest'], secondaryMuscles: ['front_delts', 'triceps'], aliases: ['incline chest dumbbell', 'incline dumbbell press', 'ضغط دمبل مائل'] },
  { id: 'pec-fly-cable', en: 'Cable Pec Fly', ar: 'تفتيح الصدر بالكابل', category: 'chest', primaryMuscles: ['chest'], secondaryMuscles: ['front_delts'], aliases: ['pec fly cable', 'cable fly', 'تفتيح كابل', 'بيك فلاي'] },
  // Back
  { id: 'seated-row-close-grip', en: 'Seated Cable Row (Close Grip)', ar: 'تجديف كابل بقبضة ضيقة', category: 'back', primaryMuscles: ['lats', 'rhomboids', 'traps'], secondaryMuscles: ['rear_delts', 'biceps', 'forearms'], aliases: ['seated row cable close grip', 'close grip row', 'تجديف قبضة ضيقة'] },
  { id: 'lat-pulldown-close-grip', en: 'Lat Pulldown (Close Grip)', ar: 'سحب علوي بقبضة ضيقة', category: 'back', primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'rhomboids', 'traps', 'rear_delts'], aliases: ['close grip lat pulldown', 'close grip pulldown', 'سحب علوي ضيق'] },
  { id: 'mckenzie-press-up', en: 'McKenzie Press Up', ar: 'تمديد الظهر (مكينزي)', category: 'back', primaryMuscles: ['lower_back'], secondaryMuscles: ['triceps', 'front_delts'], type: 'bodyweight_reps', aliases: ['mckenzie press up', 'press up', 'back extension floor', 'مكينزي'] },
  // Shoulders
  { id: 'lateral-raise-cable', en: 'Cable Lateral Raise', ar: 'رفرفة جانبية بالكابل', category: 'shoulders', primaryMuscles: ['side_delts'], secondaryMuscles: ['traps'], aliases: ['lateral raise cable', 'cable side raise', 'رفرفة كابل'] },
  { id: 'seated-shoulder-press', en: 'Seated Shoulder Press', ar: 'ضغط كتف جالس', category: 'shoulders', primaryMuscles: ['front_delts', 'side_delts'], secondaryMuscles: ['triceps', 'traps'], aliases: ['seated shoulder press', 'seated press', 'ضغط كتف جالس', 'جهاز ضغط كتف'] },
  { id: 'rear-delt-cross-cable', en: 'Rear Delt Cross Cable', ar: 'تفتيح خلفي متقاطع بالكابل', category: 'shoulders', primaryMuscles: ['rear_delts'], secondaryMuscles: ['rhomboids', 'traps'], aliases: ['rear delt cross cable', 'reverse cable fly', 'تفتيح خلفي كابل'] },
  { id: 'shrug-dumbbell', en: 'Dumbbell Shrug', ar: 'هز الأكتاف بالدمبل', category: 'shoulders', primaryMuscles: ['traps'], secondaryMuscles: ['rhomboids', 'forearms'], aliases: ['shrugs dumbbell', 'dumbbell shrug', 'هز أكتاف دمبل'] },
  // Biceps
  { id: 'behind-body-cable-curl', en: 'Behind-the-Body Cable Curl', ar: 'مرجحة كابل خلف الجسم', category: 'biceps', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], aliases: ['behind body cable curl', 'bayesian curl', 'مرجحة كابل خلفية'] },
  { id: 'preacher-curl-dumbbell', en: 'Dumbbell Preacher Curl', ar: 'مرجحة كرسي القسيس بالدمبل', category: 'biceps', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], aliases: ['preacher curl dumbbell', 'dumbbell preacher', 'بريتشر دمبل'] },
  // Triceps
  { id: 'pushdown-triangle', en: 'Triangle Bar Pushdown', ar: 'دفع الترايسبس بالمقبض المثلث', category: 'triceps', primaryMuscles: ['triceps'], secondaryMuscles: ['forearms'], aliases: ['push down triangle', 'v-bar pushdown', 'دفع مثلث'] },
  // Legs
  { id: 'bulgarian-split-squat', en: 'Bulgarian Split Squat', ar: 'سكوات بلغاري', category: 'legs', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'adductors', 'calves'], aliases: ['bulgarian split squat', 'split squat', 'سكوات بلغاري'] },
  { id: 'hack-squat', en: 'Hack Squat', ar: 'هاك سكوات', category: 'legs', primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'adductors'], aliases: ['hack squat', 'hack squat calf', 'هاك سكوات'] },
  { id: 'seated-calf-raise', en: 'Seated Calf Raise', ar: 'رفع السمانة جالساً', category: 'calves', primaryMuscles: ['calves'], aliases: ['seated calf raise', 'رفع سمانة جالس'] },
  // Glutes
  { id: 'hip-thrust-machine', en: 'Hip Thrust Machine', ar: 'جهاز دفع الحوض', category: 'glutes', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings', 'adductors', 'quads'], aliases: ['hip thrust machine', 'جهاز هيب ثرست', 'جهاز دفع حوض'] },
  { id: 'glute-master', en: 'Glute Master', ar: 'جهاز مدرب المؤخرة', category: 'glutes', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings', 'lower_back'], aliases: ['glute master', 'glute machine', 'جهاز جلوت'] },
  // Core
  { id: 'bird-dog', en: 'Bird Dog', ar: 'وضعية الطائر والكلب', category: 'core', primaryMuscles: ['lower_back', 'glutes', 'abs'], secondaryMuscles: ['obliques', 'hamstrings', 'side_delts'], type: 'bodyweight_reps', aliases: ['bird dog', 'بيرد دوق'] },
  { id: 'one-leg-stretch', en: 'Single-Leg Stretch', ar: 'تمديد الساق الواحدة', category: 'core', primaryMuscles: ['abs', 'obliques'], secondaryMuscles: ['hip_flexors', 'quads'], type: 'bodyweight_reps', aliases: ['one leg stretch', 'single leg stretch', 'تمديد ساق'] },
  { id: 'iso-hold', en: 'Iso Hold', ar: 'ثبات إيزومتري', category: 'core', type: 'time', aliases: ['iso hold', 'isometric hold', 'ثبات'] },
  { id: 'cat-cow', en: 'Cat-Cow', ar: 'وضعية القط والبقرة', category: 'core', primaryMuscles: ['lower_back', 'abs'], secondaryMuscles: ['obliques'], type: 'bodyweight_reps', aliases: ['cat cow', 'كات كاو'] },
  { id: 'dead-bug', en: 'Dead Bug', ar: 'وضعية الحشرة الميتة', category: 'core', primaryMuscles: ['abs', 'obliques'], secondaryMuscles: ['hip_flexors', 'quads'], type: 'bodyweight_reps', aliases: ['dead bug', 'ديد بق'] },
  // Forearms
  { id: 'reverse-curl-cable', en: 'Cable Reverse Curl', ar: 'مرجحة عكسية بالكابل', category: 'forearms', primaryMuscles: ['forearms'], secondaryMuscles: ['biceps'], aliases: ['reverse curl cable', 'cable reverse curl', 'مرجحة عكسية كابل'] },
  { id: 'wrist-curl-cable', en: 'Cable Wrist Curl', ar: 'مرجحة الرسغ بالكابل', category: 'forearms', primaryMuscles: ['forearms'], aliases: ['wrist curl cable', 'cable wrist curl', 'مرجحة رسغ كابل'] },

  // ── Added library (round 2) ────────────────────────────
  { id: 'machine-bent-over-row', en: 'Machine Bent-Over Row', ar: 'تجديف منحنٍ بالجهاز', category: 'back', primaryMuscles: ['lats', 'rhomboids', 'traps'], secondaryMuscles: ['rear_delts', 'biceps', 'lower_back'], aliases: ['machine bent over row', 'chest supported row machine', 'تجديف بالجهاز'] },
  { id: 'rear-delt-pec-deck', en: 'Rear Delt Pec Deck', ar: 'جهاز الرفرفة الخلفية (بيك دِك عكسي)', category: 'shoulders', primaryMuscles: ['rear_delts'], secondaryMuscles: ['rhomboids', 'traps'], aliases: ['rear delt pec deck', 'reverse pec deck', 'rear delt machine', 'بيك دك عكسي'] },
  { id: 'calf-press-leg-press', en: 'Calf Press on Leg Press', ar: 'ضغط السمانة على جهاز الأرجل', category: 'calves', primaryMuscles: ['calves'], aliases: ['calf press on leg press', 'calf press', 'leg press calf raise', 'ضغط سمانة'] },
  { id: 'hanging-knee-raise', en: 'Hanging Knee Raise', ar: 'رفع الركبتين معلقاً', category: 'core', primaryMuscles: ['abs'], secondaryMuscles: ['hip_flexors'], type: 'bodyweight_reps', aliases: ['hanging knee raise', 'knee raise', 'رفع ركبتين'] },
  { id: 'reverse-crunch', en: 'Reverse Crunch', ar: 'الكرنش العكسي', category: 'core', primaryMuscles: ['abs'], secondaryMuscles: ['hip_flexors'], type: 'bodyweight_reps', aliases: ['reverse crunch', 'كرنش عكسي'] },

  // ── Machine ⇄ free-weight & seated ⇄ standing counterparts ─────────
  // Chest
  { id: 'dumbbell-chest-fly', en: 'Dumbbell Chest Fly', ar: 'تفتيح الصدر بالدمبل', category: 'chest', primaryMuscles: ['chest'], secondaryMuscles: ['front_delts'], aliases: ['dumbbell chest fly', 'dumbbell fly', 'تفتيح دمبل'] },
  { id: 'incline-chest-press-machine', en: 'Incline Chest Press Machine', ar: 'جهاز ضغط الصدر المائل', category: 'chest', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'], aliases: ['incline chest press machine', 'machine incline press', 'جهاز صدر مائل'] },
  { id: 'decline-bench-press', en: 'Decline Bench Press', ar: 'ضغط بار منحدر', category: 'chest', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'], aliases: ['decline bench press', 'decline barbell press', 'بنش منحدر'] },
  // Shoulders
  { id: 'shoulder-press-machine', en: 'Machine Shoulder Press', ar: 'ضغط الكتف بالجهاز', category: 'shoulders', primaryMuscles: ['front_delts', 'side_delts'], secondaryMuscles: ['triceps', 'traps'], aliases: ['machine shoulder press', 'shoulder press machine', 'ضغط كتف جهاز'] },
  { id: 'shrug-machine', en: 'Machine Shrug', ar: 'هز الأكتاف بالجهاز', category: 'shoulders', primaryMuscles: ['traps'], secondaryMuscles: ['rhomboids', 'forearms'], aliases: ['machine shrug', 'shrug machine', 'هز أكتاف جهاز'] },
  { id: 'lateral-raise-machine', en: 'Machine Lateral Raise', ar: 'الرفرفة الجانبية بالجهاز', category: 'shoulders', primaryMuscles: ['side_delts'], secondaryMuscles: ['traps'], aliases: ['machine lateral raise', 'lateral raise machine', 'رفرفة جهاز'] },
  // Biceps
  { id: 'preacher-curl-machine', en: 'Machine Preacher Curl', ar: 'مرجحة كرسي القسيس بالجهاز', category: 'biceps', primaryMuscles: ['biceps'], aliases: ['machine preacher curl', 'preacher curl machine', 'بريتشر جهاز'] },
  // Triceps
  { id: 'tricep-extension-machine', en: 'Triceps Extension Machine', ar: 'جهاز تمديد الترايسبس', category: 'triceps', primaryMuscles: ['triceps'], aliases: ['triceps extension machine', 'tricep machine', 'جهاز ترايسبس'] },
  // Legs
  { id: 'seated-leg-curl', en: 'Seated Leg Curl', ar: 'ثني الأرجل جالساً', category: 'legs', primaryMuscles: ['hamstrings'], secondaryMuscles: ['calves'], aliases: ['seated leg curl', 'ثني أرجل جالس'] },
  { id: 'hip-adductor', en: 'Hip Adductor Machine', ar: 'جهاز تقريب الأرجل', category: 'legs', primaryMuscles: ['adductors'], aliases: ['adductor', 'hip adduction', 'inner thigh machine', 'تقريب'] },
];

export const BUILTIN_EXERCISES: Exercise[] = SEEDS.map((s) => ({
  id: `builtin:${s.id}`,
  name: s.en,
  nameEn: s.en,
  nameAr: s.ar,
  category: s.category,
  primaryMuscles: s.primaryMuscles,
  secondaryMuscles: s.secondaryMuscles,
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
  'calves',
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
  calves: '#C1440E', // rust
  glutes: '#E06AA6', // pink
  core: '#2CB8A6', // teal
  forearms: '#B98A4E', // amber/brown
  cardio: '#3FB6D6', // cyan
  fullBody: '#8C7BC7', // lavender
};

/**
 * Color for a specific muscle (finer than MuscleGroup), reusing the same
 * palette as MUSCLE_COLORS via whichever broad group it belongs to — so a
 * region reads the same color whether you're browsing the library by
 * category or looking at one exercise's precise target.
 */
export const MUSCLE_ID_COLORS: Record<MuscleId, string> = {
  chest: MUSCLE_COLORS.chest,
  front_delts: MUSCLE_COLORS.shoulders,
  side_delts: MUSCLE_COLORS.shoulders,
  rear_delts: MUSCLE_COLORS.shoulders,
  biceps: MUSCLE_COLORS.biceps,
  triceps: MUSCLE_COLORS.triceps,
  forearms: MUSCLE_COLORS.forearms,
  abs: MUSCLE_COLORS.core,
  obliques: MUSCLE_COLORS.core,
  lats: MUSCLE_COLORS.back,
  traps: MUSCLE_COLORS.back,
  rhomboids: MUSCLE_COLORS.back,
  lower_back: MUSCLE_COLORS.back,
  glutes: MUSCLE_COLORS.glutes,
  quads: MUSCLE_COLORS.legs,
  hamstrings: MUSCLE_COLORS.legs,
  adductors: MUSCLE_COLORS.legs,
  hip_flexors: MUSCLE_COLORS.legs,
  calves: MUSCLE_COLORS.calves,
};

/**
 * Icon for an exercise row. Cardio reads as movement rather than iron — a
 * barbell on a treadmill entry is just wrong — and anything the user made
 * themselves keeps its origin marker. Shared by every screen that lists
 * exercises so the same entry never changes appearance between them.
 */
export function exerciseIcon(ex: Exercise): 'walk' | 'camera-outline' | 'create-outline' | 'barbell-outline' {
  if (ex.category === 'cardio') return 'walk';
  if (ex.source === 'scan') return 'camera-outline';
  if (ex.source === 'custom') return 'create-outline';
  return 'barbell-outline';
}

/** Accent for an exercise, or a neutral fallback when it left the library. */
export function exerciseColor(ex: Exercise | undefined, fallback: string): string {
  return ex ? MUSCLE_COLORS[ex.category] : fallback;
}

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
    .replace(/[ً-ٰٟ]/g, '') // Arabic tashkeel
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
