export type Language = 'en' | 'ar';
/** S20 display units. Stored values are always metric. */
export type Units = 'metric' | 'imperial';
/** S19 focus preference — steers suggestions, never access. */
export type FocusArea = 'food' | 'training';

export type Sex = 'male' | 'female';

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active'
  | 'extra_active';

export type Goal = 'lose' | 'maintain' | 'gain';

export interface Profile {
  sex: Sex;
  /** YYYY-MM-DD — age is computed from this, never stored, so it never goes
   * stale as time passes. */
  birthDate: string;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  /** How fast to lose/gain, in kg/week — meaningless (and unused) when
   * `goal` is 'maintain'. Defaults to a sensible pace per goal when unset,
   * so older saved profiles keep working without this field. */
  paceKgPerWeek?: number;
}

export interface DailyTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface FoodItem {
  /** Dish name in the user's language */
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** e.g. "1 cup", "200 g" — in the user's language */
  portion: string;
  /**
   * Per-100g macros. Set for barcode / packaged items so the user can enter
   * how many grams they actually ate and have the macros scale automatically.
   */
  basePer100?: { calories: number; proteinG: number; carbsG: number; fatG: number };
  /** Grams eaten — drives scaling when `basePer100` is present. */
  gramsEaten?: number;
  /** The ¼/½/1/1½/2 portion chip chosen against the AI's own base estimate
   * (non-barcode items only) — persisted so reopening a saved meal can show
   * which chip was actually picked instead of always defaulting to "1". */
  portionMultiplier?: number;
  /**
   * Where this came from, when it was cooked from a saved recipe. The macros
   * above stay a SNAPSHOT taken at the moment it was logged — editing the
   * recipe, swapping an ingredient or regenerating it later must never
   * rewrite what someone already ate. This only lets the diary entry offer
   * "view recipe" and "edit the portion I logged".
   */
  recipeId?: string;
  /** Servings of that recipe this entry represents, e.g. 0.5. */
  recipeServings?: number;
  /**
   * ONE serving's nutrition at full precision, as the recipe stood when this
   * was logged.
   *
   * The macros above are rounded for display and storage, so rescaling from
   * them compounds: correcting ½ → 1 → ¾ would drift a little further each
   * time. This is the unrounded basis every correction multiplies, so a
   * portion edited five times lands exactly where editing it once would.
   * It is still a SNAPSHOT — changing the recipe later never touches it.
   */
  recipeBasis?: { calories: number; proteinG: number; carbsG: number; fatG: number };
}

export interface MealAnalysis {
  items: FoodItem[];
  /** 0–1, how confident the model is overall */
  confidence: number;
  notes?: string;
  /** Domains a restaurant/product lookup actually checked, e.g. "mcdonalds.com". */
  sources?: string[];
  /**
   * Where a barcode result's nutrition came from: 'off' for Open Food Facts,
   * 'photo' for a label we read ourselves. Open Food Facts is ODbL-licensed
   * and must be credited on screen wherever its data is shown; our own reads
   * carry no such obligation, so only 'off' renders the credit.
   */
  source?: string;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface LoggedMeal {
  id: string;
  /** ISO date-time when logged */
  at: string;
  items: FoodItem[];
  photoUri?: string;
  mealType?: MealType;
}

/** Lean mass per body region (kg), as broken down by a bioimpedance/InBody-style
 * scan. Optional per-region — most manual entries and many scan models won't
 * have all five. */
export interface SegmentalLeanMass {
  leftArm?: number;
  rightArm?: number;
  trunk?: number;
  leftLeg?: number;
  rightLeg?: number;
}

/** Where a body part's measured mass falls relative to the device's own
 * reference range for it — as printed on the report (a marked bar or
 * checkbox), never inferred from the raw kg value ourselves. */
export type ZoneStatus = 'low' | 'normal' | 'high';

export interface SegmentalStatus {
  leftArm?: ZoneStatus;
  rightArm?: ZoneStatus;
  trunk?: ZoneStatus;
  leftLeg?: ZoneStatus;
  rightLeg?: ZoneStatus;
}

/** Tape-measure circumferences (cm) — a separate axis from the scale/scan
 * data above (weight, body fat %, segmental lean/fat mass), since a tape
 * measurement is taken independently and not every reading has both. */
export interface BodyMeasurements {
  waist?: number;
  chest?: number;
  hips?: number;
  neck?: number;
  leftArm?: number;
  rightArm?: number;
  leftThigh?: number;
  rightThigh?: number;
}

export interface WeightEntry {
  at: string;
  kg: number;
  /** The fuller reading fields below are optional — a quick Overview weigh-in
   * only ever sets `kg`; a full body reading (manual or scanned) can add the
   * rest. */
  bodyFatPercent?: number;
  skeletalMuscleMassKg?: number;
  /** Tape-measure circumferences taken alongside this reading — manual only,
   * never filled by a machine scan (no report prints these). */
  measurementsCm?: BodyMeasurements;
  segmentalLeanMassKg?: SegmentalLeanMass;
  /** Same 5-zone shape as segmentalLeanMassKg, but fat mass — some reports
   * (InBody's fuller printouts) break fat down by body part too, as a
   * separate diagram from the lean-mass one. */
  segmentalFatMassKg?: SegmentalLeanMass;
  /** Only present when the report itself prints a below/normal/above
   * banding per body part — most don't, so this is usually absent even
   * when the kg values above are present. */
  segmentalLeanMassStatus?: SegmentalStatus;
  segmentalFatMassStatus?: SegmentalStatus;
  source?: 'manual' | 'scan';
  /** Free text the person attached to this reading (S04 "Notes"). */
  note?: string;
  /** Set when an older reading was revised later; `at` stays the measured
   * date, so "latest" still means the newest measurement (AT24). */
  editedAt?: string;
  /** Device/brand read off a scanned report, e.g. "InBody 270" — display only. */
  reportLabel?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** When it was sent (ISO). Older persisted messages have none. */
  at?: string;
  /** The area the question was asked from (S18 context tabs). */
  focus?: CoachFocus;
  /** A proposed weekly schedule, rendered as a card the user can add with one tap. */
  schedulePlan?: CoachSchedulePlan;
}

/** S18 context tabs — which area a question is asked from. */
export type CoachFocus = 'food' | 'training' | 'health';

/** S18 shared-context permissions. */
export interface CoachShare {
  /** Meals, calories and macros by day. */
  food: boolean;
  /** Logged exercises with their times, burn and streaks. */
  training: boolean;
  /** Weight, body fat, muscle mass and tape measurements. */
  body: boolean;
  /** WHOOP recovery, sleep and strain. */
  wearable: boolean;
}

/** A named fasting window — 'custom' pairs with a user-chosen targetHours
 * rather than one of the fixed presets. The first of what's meant to grow
 * into a general "diet program" concept (keto/low-carb etc. later, each its
 * own type) — kept minimal for now since fasting is the only one that ships. */
export type FastingProtocol = '16:8' | '18:6' | '20:4' | 'omad' | 'custom';

export interface FastingSession {
  id: string;
  startedAt: string;
  /** Hours until the eating window opens — fixed by `protocol` for a preset,
   * chosen freely for 'custom'. */
  targetHours: number;
  protocol: FastingProtocol;
  /** Set once the fast is ended — an active session has neither this nor a
   * place in fastingHistory, see store.ts's activeFast/fastingHistory. */
  endedAt?: string;
}

/** A document (a training program, a meal plan, a body-composition report)
 * the user has taught the coach — a compact AI-written summary of it, not
 * the raw file, fed into every future coach conversation so the coach can
 * weigh it in ongoing advice instead of only answering about it once. */
export interface CoachReferenceDoc {
  id: string;
  /** Original filename, shown in the management list. */
  name: string;
  summary: string;
  addedAt: string;
}

/** One exercise inside a day the coach proposed — sets and reps only, no weight
 * (the coach has no way to know what the user can lift). */
export interface CoachScheduleExercise {
  name: string;
  sets: number;
  reps: string;
}

export interface CoachScheduleDay {
  weekday: number;
  title?: string;
  exercises: CoachScheduleExercise[];
}

/** A weekly training plan the coach proposed, awaiting the user's tap to add it. */
export interface CoachSchedulePlan {
  summary?: string;
  days: CoachScheduleDay[];
}

/**
 * A full AI-designed program: calorie/macro targets plus a weekly schedule
 * that work toward one goal together, over a set duration. Distinct from a
 * bare CoachSchedulePlan (which only ever proposes the schedule half) — the
 * accept flow commits both `targets` and `schedule` in one step.
 */
/** One meal the program plans for a slot: a named dish made of the same
 * FoodItem shape a scan produces, so "Log eaten" can drop the items straight
 * into `meals` with no conversion. */
export interface PlannedMeal {
  slot: MealType;
  name: string;
  items: FoodItem[];
}

export interface MealPlanDay {
  /** 0 = Sunday … 6 = Saturday, like CoachScheduleDay.weekday. */
  weekday: number;
  meals: PlannedMeal[];
}

/** The food half of a program: named meals for each weekday that add up to
 * the program's targets. Repeats week to week, like the training schedule. */
export interface MealPlan {
  summary?: string;
  days: MealPlanDay[];
}

/** Rough supermarket section, used only to group a shopping list so a week's
 * ingredients read as a route round the shop rather than an alphabetical pile. */
export type RecipeAisle =
  | 'produce'
  | 'meat'
  | 'dairy'
  | 'bakery'
  | 'pantry'
  | 'frozen'
  | 'spices'
  | 'other';

export interface RecipeIngredient {
  /** In the language the recipe was written in. */
  name: string;
  /**
   * Language-independent identity, lowercase English, for merging a shopping
   * list: "rice", "chicken_breast", "olive_oil". Without it "rice", "أرز" and
   * "basmati rice" become three lines on the same shopping trip. Two entries
   * merge only when this AND `unit` AND `state` all agree.
   */
  key: string;
  /**
   * How much, in `unit`. Everything — scaling, per-serving macros, the
   * shopping list — is computed from this, so it is the only quantity that
   * has to be right.
   */
  amount: number;
  /** Grams for solids, millilitres for liquids. Never mixed when merging. */
  unit: 'g' | 'ml';
  /**
   * Whether `amount` describes the ingredient before or after cooking. Rice
   * roughly triples and meat loses water, so merging 100 g raw rice with
   * 300 g cooked rice would be wrong in both directions.
   */
  state?: 'raw' | 'cooked';
  /**
   * The same amount as someone would actually measure it, spelled precisely:
   * "1 tbsp" not "1 spoon", "ملعقة كبيرة" not "ملعقة". Always shown beside
   * the weight, never instead of it.
   */
  measure?: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  aisle?: RecipeAisle;
  /**
   * The person who wrote this ingredient did not enter its nutrition. The
   * stored macros are 0 only because the type needs a number; the recipe
   * reports how many ingredients are in this state rather than presenting the
   * sum as complete. Missing is unknown, not zero (section 7).
   */
  macrosUnknown?: true;
  /**
   * These numbers are an estimate, not a measurement. The app's arithmetic on
   * top of them is exact, which is not the same thing as the totals being
   * right — so the screen says so rather than implying precision it does not
   * have, and every value stays editable.
   */
  estimated?: boolean;
}

/**
 * A dish you can actually cook, as opposed to a PlannedMeal, which is only a
 * name and its macros.
 *
 * Per-serving nutrition is deliberately NOT stored: it is the ingredient
 * totals divided by servings, computed on demand. Storing it would let the
 * two drift the moment an ingredient is swapped or the batch is scaled, and
 * the whole point is that the app owns the arithmetic while the AI only
 * supplies the estimates it is good at.
 */
export interface Recipe {
  id: string;
  name: string;
  /** How many servings the ingredient list as written produces. */
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  /**
   * Cooked weight of the whole batch, where it is known. Rice triples and
   * meat loses water, so without this, logging "200 g of what I cooked"
   * against raw ingredient weights is simply wrong. It is itself an estimate
   * unless someone weighed the pan, so logging by serving fraction is the
   * default and this only backs the by-weight option.
   */
  cookedYieldG?: number;
  /** Set once someone has actually weighed the batch, which makes logging by
   * cooked weight trustworthy rather than a second guess on top of a guess. */
  cookedYieldMeasured?: boolean;
  /** Which language it was written in — recipes are not translated in place. */
  language: Language;
  /** `calgym` is a bundled original: reference values, browsable offline,
   * copied into the private library the first time it is planned, logged,
   * kept or edited (section 15). */
  source: 'ai' | 'custom' | 'calgym';
  createdAt: string;
  photoUri?: string;
  notes?: string;
  /** One line under the name in the library ("A hearty lentil stew."). */
  description?: string;
  /**
   * Kept at the top of the library. A collection you cook from is mostly a
   * handful of things you make again and again with the experiments piled on
   * top, and newest-first buries exactly the ones worth keeping.
   */
  favorite?: boolean;
  /** When it was last opened to cook from, so "what do I actually make" is
   * answerable without asking anyone to rate anything. */
  lastCookedAt?: string;
  /**
   * An AI result is saved the moment it arrives — so a restart or a retry can
   * never charge for it twice — but it is a draft until a person has looked
   * at the ingredients and servings (S09, section 15). Planning and logging
   * wait for that. Absent means ready: everything saved before this field
   * existed was usable, and stays so.
   */
  reviewStatus?: 'needs_review' | 'ready';
}

export interface Program {
  id: string;
  createdAt: string;
  goal: Goal;
  durationWeeks: number;
  summary: string;
  targets: DailyTargets;
  schedule: CoachSchedulePlan;
  /** Optional: programs accepted before meal plans existed have none, and a
   * generated plan the server couldn't validate is simply absent. */
  mealPlan?: MealPlan;
}

/** What the server hands back before the user has accepted it — everything
 * a Program has except the bookkeeping fields (id/createdAt/goal) the store
 * adds on acceptance. */
export type GeneratedProgram = Pick<Program, 'summary' | 'durationWeeks' | 'targets' | 'schedule' | 'mealPlan'>;

export interface EquipmentAnalysis {
  /** Machine name in the user's language */
  name: string;
  /** Canonical muscle-id slugs (see MuscleId below), not localized text —
   * the same vocabulary Exercise.primaryMuscles uses, so a scan's result
   * can drive BodyMap and be persisted onto a saved Exercise directly. */
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  setupSteps: string[];
  formCues: string[];
  commonMistakes: string[];
  suggestion: { sets: number; reps: string; note?: string };
  confidence: number;
}

/**
 * Extracted (never estimated) from a photo of a body-composition report —
 * InBody, Tanita, DEXA or similar. Every field is null when the report
 * simply doesn't print that number; nothing here is a visual guess.
 */
export interface BodyReadingAnalysis {
  deviceLabel?: string;
  /** The date the SCAN was taken, as printed on the report — YYYY-MM-DD. Not
   * today's date; only set when the report actually prints one. */
  testDate?: string;
  weightKg?: number;
  bodyFatPercent?: number;
  skeletalMuscleMassKg?: number;
  segmentalLeanMassKg?: SegmentalLeanMass;
  segmentalFatMassKg?: SegmentalLeanMass;
  segmentalLeanMassStatus?: SegmentalStatus;
  segmentalFatMassStatus?: SegmentalStatus;
  confidence: number;
}

/** Muscle group a training exercise belongs to (library categories). */
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'calves'
  | 'glutes'
  | 'core'
  | 'forearms'
  | 'cardio'
  | 'fullBody';

/**
 * A specific muscle, finer-grained than MuscleGroup — used only to drive the
 * muscle-map illustration on a single exercise's detail page (which exact
 * muscle lights up, and how strongly), never for library browsing/filtering.
 * That stays on MuscleGroup/category, which is coarser on purpose.
 */
export type MuscleId =
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'lats'
  | 'traps'
  | 'rhomboids'
  | 'lower_back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'adductors'
  | 'hip_flexors'
  | 'calves';

/** How each set of an exercise is measured. */
export type ExerciseType = 'weight_reps' | 'bodyweight_reps' | 'time' | 'distance_time';

/** A reusable exercise definition — built-in seed, user-made, or saved from a scan. */
export interface Exercise {
  id: string;
  /** Display name in its origin language (fallback when a localized name is absent). */
  name: string;
  nameEn?: string;
  nameAr?: string;
  category: MuscleGroup;
  /**
   * Precise muscles this exercise targets, for the muscle-map illustration.
   * Falls back to `category` (shown at full strength, no secondary) when
   * absent — e.g. for cardio, "it depends" holds like Iso Hold, or any
   * custom/scanned exercise that never got this level of detail.
   */
  primaryMuscles?: MuscleId[];
  secondaryMuscles?: MuscleId[];
  type: ExerciseType;
  /**
   * Metabolic equivalent for THIS exercise, overriding the coarse per-category
   * rate. One number for all of "cardio" cannot be right when it spans walking
   * (~3.5) and skipping rope (~12), so anything whose real intensity differs
   * meaningfully from its group carries its own. Values follow the Compendium
   * of Physical Activities.
   */
  met?: number;
  /**
   * Set when the burn should be derived from actual pace rather than a fixed
   * rate — true for anything done on foot, where covering 3 km in 15 minutes
   * and in 45 minutes are wildly different efforts. Without it a slow walk
   * scores MORE calories than a hard run over the same distance, purely
   * because it took longer. Only 'foot' is modelled: ACSM's walking and
   * running equations do not describe a bike or a rower, whose resistance we
   * cannot see anyway.
   */
  paceModel?: 'foot';
  /**
   * How this exercise is actually performed, which decides how it is logged.
   *
   * 'sets' is the default and covers anything done in bouts you repeat — a
   * plank held three times, a farmer's walk carried three times. 'continuous'
   * covers a single unbroken effort: a treadmill run, a padel match, fifteen
   * minutes of skipping. Those have no sets to count, and asking for them
   * invites made-up numbers.
   *
   * `type` is a separate question — it decides which fields are shown
   * (seconds, or distance and seconds) — while this decides whether there is
   * a set list at all.
   */
  logStyle?: 'sets' | 'continuous';
  /** Photo of the machine/movement — from the camera or an equipment scan. */
  photoUri?: string;
  /** Form cues / how-to, shown on the exercise page. */
  description?: string;
  videoUrl?: string;
  /** Alternate names used to match a scanned machine to this entry (built-ins). */
  aliases?: string[];
  source: 'builtin' | 'custom' | 'scan';
}

/** One recorded set inside a logged exercise. */
/** A target set defined ahead of time in the weekly schedule (no "done"). */
export interface PlannedSet {
  weightKg?: number;
  reps?: number;
  seconds?: number;
  distanceM?: number;
}

export interface WorkoutSet {
  weightKg?: number;
  reps?: number;
  /** For time-based exercises (planks, cardio holds). */
  seconds?: number;
  /** For distance/time exercises (running, rowing). */
  distanceM?: number;
  done: boolean;
  /** Free note, e.g. a progressive-overload reminder for next session. */
  comment?: string;
  /** True when this set beat the previous best for the exercise. */
  isPR?: boolean;
}

/** One exercise recorded on a given day, with its individual sets. */
export interface LoggedWorkout {
  id: string;
  at: string;
  /** Last time a set was added/edited — with `at`, brackets the session's
   * real time window for matching against a WHOOP-detected workout. Equal
   * to `at` for a workout logged in one shot (e.g. the Training tab
   * checkmark), later for one built up set-by-set on the Track tab. */
  updatedAt?: string;
  exerciseId: string;
  /** Snapshot of the name at log time (survives exercise edits/deletes). */
  exerciseName: string;
  type: ExerciseType;
  sets: WorkoutSet[];
  /** Rough estimate, kcal */
  caloriesBurned?: number;
}

/**
 * A workout in progress: the ordered exercises the person committed to when
 * they tapped Start, where they are in that list, and the rest timer. Sets
 * themselves are logged straight into `workouts` as they're completed, so
 * this is only the cursor — leaving the app, or the app dying mid-set, loses
 * nothing but the position, and this keeps even that.
 */
export interface ActiveSession {
  startedAt: string;
  /** dateKey() of the day the session belongs to. */
  dayKey: string;
  exerciseIds: string[];
  index: number;
  /** ISO time the current rest ends, or null when not resting. */
  restEndsAt: string | null;
  restSeconds: number;
}

/** One workout WHOOP detected on a given day (real heart-rate-based numbers, not an estimate). */
export interface WhoopDayWorkout {
  sportName: string;
  start: string;
  end: string;
  kcal: number;
  strain: number | null;
  avgHeartRate: number | null;
}
