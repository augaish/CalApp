import { ApiError, FeatureLockedError, QuotaError } from './api-errors';
import { deviceLabel } from './device';
import { useAppStore } from './store';
import type {
  BodyReadingAnalysis,
  ChatMessage,
  CoachAction,
  CoachSchedulePlan,
  EquipmentAnalysis,
  FoodItem,
  GeneratedProgram,
  Language,
  MealAnalysis,
  Recipe,
  WhoopDayWorkout,
} from './types';

/**
 * Base URL of the CalApp AI server (see server/ in this repo).
 * Overridable via EXPO_PUBLIC_API_URL (e.g. to point a dev build at a local
 * server), but defaults to the production server so the app never silently
 * drops into demo mode when the env var fails to inject at bundle time. The
 * URL is not a secret — the Anthropic key lives only on the server.
 */
const DEFAULT_API_URL = 'https://calapp-production-ab20.up.railway.app';
const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/$/, '');

/** Public base URL of the server — used to build shareable schedule links. */
export const SERVER_URL = API_URL || DEFAULT_API_URL;

export const isMockMode = !API_URL;

/**
 * Stable per-install id, sent with every AI call so the server can meter usage
 * and resolve the plan. Replaced by the real auth user id when sign-in ships.
 */
let installId: string | null = null;
const idListeners = new Set<(id: string) => void>();
export function setInstallId(id: string | null) {
  const before = installId;
  installId = id;
  if (id && before && id !== before) idListeners.forEach((fn) => fn(id));
}

/**
 * Called whenever the id the server knows this person by changes (sign-in,
 * sign-out) — the store SDK must follow it, or a purchase would be filed
 * under an id the server no longer answers to.
 */
export function onIdentityChange(fn: (id: string) => void): () => void {
  idListeners.add(fn);
  return () => idListeners.delete(fn);
}

/** The id sent as x-calgym-user: the account id when signed in, else the install id. */
export function currentRef(): string {
  // The server refuses unmetered calls, so never send one without an id: if
  // launch has not set it yet, mint it from the store on the spot.
  return installId ?? useAppStore.getState().ensureInstallId();
}

function authHeaders(): Record<string, string> {
  return { 'x-calgym-user': currentRef() };
}

// Defined in a leaf module so the rule for what to say about each failure
// can be tested without dragging React Native in. Re-exported here because
// every screen already imports them from '@/lib/api'.
export { ApiError, FeatureLockedError, QuotaError } from './api-errors';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 402 || res.status === 403) {
    const q = (await res.json().catch(() => ({}))) as {
      plan?: string;
      used?: number;
      limit?: number;
    };
    if (res.status === 403) throw new FeatureLockedError(q.plan ?? 'free');
    throw new QuotaError(q.plan ?? 'free', q.used ?? 0, q.limit ?? 0);
  }
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(errBody.error ?? `http_${res.status}`);
  }
  return (await res.json()) as T;
}

export interface Entitlement {
  plan: 'free' | 'pro' | 'proPlus';
  used: number;
  limit: number;
  remaining: number;
  period: string;
  features?: {
    coach?: boolean;
    equipment?: boolean;
    highAccuracy?: boolean;
    /** Cap on coach messages inside the allowance (null = no sub-cap). */
    coachCap?: number | null;
    coachUsed?: number;
  };
  /**
   * What the upgrade screen should display, set from the admin dashboard so
   * a price or allowance change doesn't need an app release. Display only —
   * the amount actually charged comes from the store product, not this.
   * Absent when talking to a server that predates it; the screen falls back
   * to its own built-in numbers.
   */
  pricing?: {
    pro?: number;
    proPlus?: number;
    proYearly?: number;
    currency?: string;
    limits?: { free?: number; pro?: number; proPlus?: number };
    coachCap?: number | null;
  };
  /** RevenueCat public SDK keys; null until subscriptions are switched on. */
  billing?: { iosKey?: string | null; androidKey?: string | null } | null;
  /** A code gift that is running, whatever the plan shown. */
  promo?: { plan: 'pro' | 'proPlus'; until: string; code: string | null } | null;
  sponsor?: {
    enabled?: boolean;
    title?: string;
    subtitle?: string;
    imageUrl?: string;
    linkUrl?: string;
  } | null;
}

/**
 * Hand this install's usage and plan to the account that just signed in, so
 * the month's allowance carries over instead of restarting. Call after
 * `setInstallId` has been pointed at the account id.
 */
export async function linkInstall(installId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ from: installId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Publish a workout plan and get back a short link to share.
 *
 * The plan used to be base64'd into the URL, which made links thousands of
 * characters long — chat apps linkified only the first part of them, so the
 * recipient opened a link with no plan in it.
 */
export async function createShareLink(
  payload: unknown,
  /** Decides which screen the link opens on the recipient's phone. */
  kind: 'schedule' | 'meal' = 'schedule',
): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ payload, kind }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Tell the server which address this account belongs to, so an operator sees
 * something recognisable instead of an opaque id. Only ever called for a
 * signed-in user; guests stay anonymous.
 */
export async function identifyEmail(email: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ email }),
    });
  } catch {
    // Cosmetic for the admin list — never worth failing a sign-in over.
  }
}

/** Fetch a shared plan by its code. */
export async function fetchSharedPlan(code: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${API_URL}/api/share/${encodeURIComponent(code)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { payload?: unknown };
    return data.payload ?? null;
  } catch {
    return null;
  }
}

/** Current plan + remaining AI actions (and the sponsor slot, if any). */
export async function fetchEntitlement(): Promise<Entitlement | null> {
  try {
    // Piggybacks on the launch ping every screen already depends on, so the
    // admin table gets a device for every account — guest or signed-in — not
    // only the ones that ever reach a sign-in screen.
    const device = encodeURIComponent(deviceLabel());
    const res = await fetch(`${API_URL}/api/me?device=${device}`, { headers: authHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as Entitlement;
  } catch {
    return null;
  }
}

export type RedeemFailure =
  | 'unknown'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'exhausted'
  | 'already_redeemed'
  | 'already_subscribed'
  | 'unavailable'
  | 'identify_required'
  | 'offline';

export type RedeemResponse =
  | { ok: true; kind: 'free'; code: string; plan: 'pro' | 'proPlus'; until: string }
  | {
      ok: true;
      kind: 'percent';
      code: string;
      plan: 'pro' | 'proPlus';
      percentOff: number;
      offerIos: string | null;
      offerAndroid: string | null;
      again?: boolean;
    }
  | { ok: false; reason: RedeemFailure };

/** Redeem a promotion code for this account. Never throws. */
export async function redeemCode(code: string): Promise<RedeemResponse> {
  try {
    const res = await fetch(`${API_URL}/api/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ code }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && data.ok) return data as RedeemResponse;
    const known: RedeemFailure[] = [
      'unknown', 'inactive', 'not_started', 'expired', 'exhausted',
      'already_redeemed', 'already_subscribed', 'unavailable', 'identify_required',
    ];
    const reason = known.includes(data.error as RedeemFailure) ? (data.error as RedeemFailure) : 'unavailable';
    return { ok: false, reason };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

/**
 * Ask the server to read this person's subscription straight from the store
 * side, right after a purchase or restore, so the plan changes without
 * waiting for the webhook. Best-effort.
 */
export async function syncBilling(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/billing/sync`, { method: 'POST', headers: authHeaders() });
    const data = (await res.json().catch(() => ({}))) as { result?: string };
    return data.result === 'granted';
  } catch {
    return false;
  }
}

export interface WhoopStatus {
  connected: boolean;
  scope?: string;
  connectedAt?: string;
}

/**
 * URL to open in a system browser session (see profile.tsx) to start the
 * WHOOP OAuth flow. Not a fetch — it's a full-page navigation the user's
 * browser follows to WHOOP's own consent screen — so the caller ref travels
 * as a query param rather than the usual x-calgym-user header.
 */
export function whoopAuthorizeUrl(): string {
  const ref = currentRef();
  return `${API_URL}/api/whoop/authorize?ref=${encodeURIComponent(ref)}`;
}

export async function fetchWhoopStatus(): Promise<WhoopStatus | null> {
  try {
    const res = await fetch(`${API_URL}/api/whoop/status`, { headers: authHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as WhoopStatus;
  } catch {
    return null;
  }
}

export async function disconnectWhoop(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/whoop/disconnect`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface WhoopDayBurn {
  totalKcal: number | null;
  workouts: WhoopDayWorkout[];
  /** False when there's no usable WHOOP connection at all (never connected,
   * or the token/refresh failed) — undefined for a network/parse failure,
   * where connection state is simply unknown. */
  connected?: boolean;
  /** True when WHOOP has recorded a workout in this window but hasn't
   * finished scoring it yet, so its calories aren't countable — distinct
   * from a day with nothing recorded at all. */
  pending?: boolean;
}

/**
 * WHOOP's real burn for a local day (start/end are that day's midnight-to-
 * midnight in the caller's own timezone — the server has no timezone of its
 * own to guess with), plus the individual workouts it's made of — so "how
 * much did today's training actually take" can be shown per session, not
 * only as one combined number. totalKcal is null when not connected or
 * nothing was found, so the caller falls back to the formula estimate
 * rather than showing 0.
 */
export async function fetchWhoopDayBurn(startIso: string, endIso: string): Promise<WhoopDayBurn> {
  try {
    const params = new URLSearchParams({ start: startIso, end: endIso });
    const res = await fetch(`${API_URL}/api/whoop/day-burn?${params.toString()}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return { totalKcal: null, workouts: [] };
    return (await res.json()) as WhoopDayBurn;
  } catch {
    return { totalKcal: null, workouts: [] };
  }
}

export interface WhoopHistoryWorkout extends WhoopDayWorkout {
  /** The workout's own local calendar date (YYYY-MM-DD), for grouping into day buckets. */
  localDate: string;
}

/**
 * Every WHOOP workout from the last `days` — a one-time backfill so a WHOOP
 * with months of existing history doesn't sit unused just because it was
 * connected today. Empty on any failure, including "not connected", so the
 * caller can treat "nothing came back" as "try again another time" rather
 * than crashing.
 */
export async function fetchWhoopHistory(days = 60): Promise<WhoopHistoryWorkout[]> {
  try {
    const res = await fetch(`${API_URL}/api/whoop/history?days=${days}`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { workouts: WhoopHistoryWorkout[] };
    return data.workouts;
  } catch {
    return [];
  }
}

export interface WhoopSummary {
  connected: boolean;
  recoveryScore?: number | null;
  hrvMs?: number | null;
  restingHr?: number | null;
  sleepPerformancePercent?: number | null;
  sleepHours?: number | null;
  todayStrain?: number | null;
}

/** Recovery/strain/sleep snapshot for the coach's context — see coach-context.ts. */
export async function fetchWhoopSummary(): Promise<WhoopSummary | null> {
  try {
    const res = await fetch(`${API_URL}/api/whoop/summary`, { headers: authHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as WhoopSummary;
  } catch {
    return null;
  }
}

export async function analyzeMeal(
  imageBase64: string,
  language: Language,
): Promise<MealAnalysis> {
  if (isMockMode) return mockMeal(language);
  return post<MealAnalysis>('/api/analyze-meal', { image: imageBase64, language });
}

export async function analyzeEquipment(
  imageBase64: string,
  language: Language,
): Promise<EquipmentAnalysis> {
  if (isMockMode) return mockEquipment(language);
  return post<EquipmentAnalysis>('/api/analyze-equipment', { image: imageBase64, language });
}

/** A photo (existing camera scan) or a PDF export (InBody etc. commonly save
 * as one) — either way, the same structured reading comes back. A camera/
 * gallery photo is always downscaled to JPEG first (see photo.ts), but a
 * file picked from Files/iCloud Drive keeps its real format, so that path
 * must say what it actually is. */
export async function analyzeBodyReading(
  payload: { image: string; imageMediaType?: string } | { pdf: string },
  language: Language,
): Promise<BodyReadingAnalysis> {
  if (isMockMode) return mockBodyReading(language);
  return post<BodyReadingAnalysis>('/api/analyze-body-reading', { ...payload, language });
}

export interface ExerciseInfo {
  category: string;
  type: string;
  primaryMuscles: string[];
  /** Compendium MET for this movement, so its calorie estimate reflects its
   * real intensity instead of one flat rate per category. */
  met?: number;
  description: string;
  confidence: number;
}

/** AI-fill an exercise's muscle group, measure type and how-to from its name. */
export async function analyzeExercise(name: string, language: Language): Promise<ExerciseInfo> {
  if (isMockMode) {
    await delay(900);
    return {
      category: 'fullBody',
      type: 'weight_reps',
      primaryMuscles: [],
      description: language === 'ar' ? 'نتيجة تجريبية — اربط الخادم.' : 'Demo result — connect the server.',
      confidence: 0,
    };
  }
  return post<ExerciseInfo>('/api/analyze-exercise', { name, language });
}

/** Best-effort YouTube/Vimeo video title via free oEmbed (no API key). */
export async function fetchVideoTitle(url: string): Promise<string | null> {
  try {
    const isVimeo = /vimeo\.com/.test(url);
    const endpoint = isVimeo
      ? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`
      : `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return data.title?.trim() || null;
  } catch {
    return null;
  }
}

export async function analyzeText(text: string, language: Language): Promise<MealAnalysis> {
  if (isMockMode) {
    await delay(1200);
    const mock = await mockMeal(language);
    return { ...mock, items: mock.items.slice(0, 1) };
  }
  return post<MealAnalysis>('/api/analyze-text', { text, language });
}

/** A follow-up correction on a meal already on screen — fresh scan/
 * description, or an already-logged meal being reopened. No photo is
 * re-sent; the current items plus the correction message are enough. */
export async function refineMeal(
  items: FoodItem[],
  message: string,
  language: Language,
): Promise<MealAnalysis> {
  if (isMockMode) {
    await delay(900);
    return {
      items,
      confidence: 0.8,
      notes:
        language === 'ar'
          ? `نتيجة تجريبية — اربط الخادم لتطبيق التعديل: "${message}"`
          : `Demo result — connect the server to apply: "${message}"`,
    };
  }
  return post<MealAnalysis>('/api/refine-meal', {
    items: items.map((it) => ({
      name: it.name,
      portion: it.portion,
      calories: it.calories,
      proteinG: it.proteinG,
      carbsG: it.carbsG,
      fatG: it.fatG,
    })),
    message,
    language,
  });
}

export interface CoachReply {
  reply: string;
  /** Present when the coach proposed a weekly schedule the user can add. */
  schedulePlan?: CoachSchedulePlan;
  /** Present when the coach wrote a recipe; saved once by the app as a draft to review. */
  recipeDraft?: Omit<Recipe, 'id' | 'createdAt' | 'language' | 'source'>;
  /** Proposed edits to the person's logs or targets — applied only when they tap. */
  actions?: CoachAction[];
  /** Short follow-ups the person might tap next. */
  suggestions?: string[];
}

/** Reads an uploaded document (photo or PDF) and turns it into a compact
 * reference summary the coach will consult in every future conversation —
 * same request shape as analyzeBodyReading, different endpoint/return. */
export async function analyzeCoachAttachment(
  payload: { image: string; imageMediaType?: string } | { pdf: string },
  language: Language,
): Promise<{ summary: string }> {
  if (isMockMode) {
    await delay(900);
    return { summary: '' };
  }
  return post<{ summary: string }>('/api/coach-attachment', { ...payload, language });
}

export async function coachChat(
  messages: ChatMessage[],
  language: Language,
  /** Compact snapshot of the user's own logs, so answers are personalized. */
  context?: unknown,
): Promise<CoachReply> {
  if (isMockMode) {
    await delay(900);
    return { reply: '' }; // caller substitutes the localized mock reply
  }
  return post<CoachReply>('/api/coach', { messages, language, context });
}

/** One-shot AI program: calorie/macro targets plus a weekly schedule, designed together. */
export async function generateProgram(
  language: Language,
  context?: unknown,
): Promise<GeneratedProgram> {
  if (isMockMode) return mockProgram(language);
  return post<GeneratedProgram>('/api/generate-program', { language, context });
}

/**
 * One cookable recipe: ingredients with weights and their own nutrition, plus
 * steps. The server returns the recipe WITHOUT an id or timestamp — those are
 * the store's to assign when it is saved, so generating one twice never
 * silently overwrites the first.
 */
export async function generateRecipe(
  request: string,
  language: Language,
  context?: unknown,
): Promise<Omit<Recipe, 'id' | 'createdAt' | 'language' | 'source'>> {
  if (isMockMode) return mockRecipe(language);
  return post('/api/generate-recipe', { request, language, context });
}

/**
 * Barcode → nutrition, via our own server: checks its first-party cache
 * (grown from every product a user has resolved through the AI photo-scan
 * fallback — see reportBarcode) before falling back to Open Food Facts,
 * whose coverage of Gulf-market products is thin. See
 * server/src/index.ts's /api/barcode.
 */
export async function lookupBarcode(
  barcode: string,
): Promise<{ item: FoodItem; source: string | null } | null> {
  if (isMockMode) return null;
  try {
    const res = await fetch(`${API_URL}/api/barcode?code=${encodeURIComponent(barcode)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { item: FoodItem | null; source?: string | null };
    // `source` is 'off' when the facts came from Open Food Facts, whose ODbL
    // licence requires crediting it wherever the data is shown.
    return data.item ? { item: data.item, source: data.source ?? null } : null;
  } catch {
    return null;
  }
}

/**
 * Files an AI-resolved product into the shared barcode cache so the next
 * scan of the same barcode — by anyone — gets an instant hit instead of
 * needing AI again. Called after the "Use camera" fallback (see scan.tsx)
 * succeeds for a barcode lookupBarcode couldn't resolve. Best-effort: the
 * meal was already logged successfully regardless of whether this lands.
 */
export async function reportBarcode(barcode: string, item: FoodItem): Promise<void> {
  if (isMockMode) return;
  try {
    await fetch(`${API_URL}/api/barcode/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ barcode, item }),
    });
  } catch {
    // best-effort — nothing to recover from here
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mockMeal(language: Language): Promise<MealAnalysis> {
  await delay(1500);
  return language === 'ar'
    ? {
        items: [
          { name: 'كبسة دجاج', calories: 620, proteinG: 38, carbsG: 72, fatG: 18, portion: 'طبق واحد' },
          { name: 'سلطة خضراء', calories: 45, proteinG: 2, carbsG: 8, fatG: 1, portion: 'طبق صغير' },
        ],
        confidence: 0.82,
        notes: 'نتيجة تجريبية — اربط الخادم للحصول على تحليل حقيقي.',
      }
    : {
        items: [
          { name: 'Chicken kabsa', calories: 620, proteinG: 38, carbsG: 72, fatG: 18, portion: '1 plate' },
          { name: 'Green salad', calories: 45, proteinG: 2, carbsG: 8, fatG: 1, portion: '1 small bowl' },
        ],
        confidence: 0.82,
        notes: 'Demo result — connect the AI server for real analysis.',
      };
}

async function mockEquipment(language: Language): Promise<EquipmentAnalysis> {
  await delay(1500);
  return language === 'ar'
    ? {
        name: 'جهاز سحب علوي (لات بول داون)',
        primaryMuscles: ['lats'],
        secondaryMuscles: ['biceps', 'rear_delts'],
        setupSteps: ['اضبط مسند الفخذين على ساقيك', 'أمسك القبضة أوسع من كتفيك', 'اجلس وصدرك مرفوع'],
        formCues: ['اسحب البار إلى أعلى الصدر', 'حرّك مرفقيك للأسفل والخلف', 'تحكم في الرجوع ببطء'],
        commonMistakes: ['التأرجح بالجذع', 'السحب خلف الرقبة', 'استخدام وزن أثقل من اللازم'],
        suggestion: { sets: 3, reps: '10–12', note: 'ابدأ بوزن تستطيع التحكم به' },
        confidence: 0.85,
      }
    : {
        name: 'Lat pulldown machine',
        primaryMuscles: ['lats'],
        secondaryMuscles: ['biceps', 'rear_delts'],
        setupSteps: ['Adjust thigh pad snug on your legs', 'Grip slightly wider than shoulders', 'Sit tall, chest up'],
        formCues: ['Pull the bar to upper chest', 'Drive elbows down and back', 'Control the way up'],
        commonMistakes: ['Swinging the torso', 'Pulling behind the neck', 'Going too heavy'],
        suggestion: { sets: 3, reps: '10–12', note: 'Start with a weight you can control' },
        confidence: 0.85,
      };
}

/** Demo-mode recipe, so the screen is exercisable with no server attached. */
async function mockRecipe(
  language: Language,
): Promise<Omit<Recipe, 'id' | 'createdAt' | 'language' | 'source'>> {
  await delay(1200);
  const ar = language === 'ar';
  return {
    name: ar ? 'دجاج بالأرز' : 'Chicken and Rice',
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 30,
    cookedYieldG: 1400,
    ingredients: [
      { name: ar ? 'صدور دجاج' : 'Chicken breast', key: 'chicken_breast', amount: 600, unit: 'g', state: 'raw', measure: ar ? '٣ حبات' : '3 pieces', calories: 660, proteinG: 124, carbsG: 0, fatG: 14, aisle: 'meat' },
      { name: ar ? 'أرز بسمتي' : 'Basmati rice', key: 'rice', amount: 300, unit: 'g', state: 'raw', measure: ar ? 'كوب ونصف' : '1½ cups', calories: 1080, proteinG: 22, carbsG: 234, fatG: 3, aisle: 'pantry' },
      { name: ar ? 'زيت زيتون' : 'Olive oil', key: 'olive_oil', amount: 30, unit: 'ml', measure: ar ? 'ملعقتان كبيرتان' : '2 tbsp', calories: 265, proteinG: 0, carbsG: 0, fatG: 30, aisle: 'pantry' },
      { name: ar ? 'بصل' : 'Onion', key: 'onion', amount: 150, unit: 'g', state: 'raw', measure: ar ? 'حبة متوسطة' : '1 medium', calories: 60, proteinG: 1.5, carbsG: 14, fatG: 0, aisle: 'produce' },
    ],
    steps: ar
      ? ['اغسل الأرز وانقعه ٢٠ دقيقة.', 'حمّر البصل بالزيت حتى يذبل.', 'أضف الدجاج وقلّبه حتى يتحمّر.', 'أضف الأرز والماء واتركه على نار هادئة ٢٠ دقيقة.']
      : ['Rinse the rice and soak it for 20 minutes.', 'Soften the onion in the oil over medium heat.', 'Add the chicken and brown on both sides.', 'Add the rice and water, cover, and simmer 20 minutes.'],
  };
}

async function mockProgram(language: Language): Promise<GeneratedProgram> {
  await delay(1800);
  return language === 'ar'
    ? {
        summary: 'برنامج تجريبي — اربط الخادم للحصول على برنامج مبني على بياناتك. هدف افتراضي: 2200 سعرة، 4 أيام تمرين أسبوعياً.',
        durationWeeks: 8,
        targets: { calories: 2200, proteinG: 150, carbsG: 220, fatG: 73 },
        schedule: {
          summary: 'تقسيم دفع/سحب/أرجل، 4 أيام',
          days: [
            { weekday: 0, title: 'دفع', exercises: [{ name: 'ضغط بار', sets: 4, reps: '8-10' }] },
            { weekday: 2, title: 'سحب', exercises: [{ name: 'سحب علوي', sets: 4, reps: '8-10' }] },
            { weekday: 4, title: 'أرجل', exercises: [{ name: 'سكوات بار', sets: 4, reps: '8-10' }] },
          ],
        },
      }
    : {
        summary: 'Demo program — connect the AI server for one built from your real data. Default goal: 2,200 kcal, 4 training days a week.',
        durationWeeks: 8,
        targets: { calories: 2200, proteinG: 150, carbsG: 220, fatG: 73 },
        schedule: {
          summary: 'Push/pull/legs split, 4 days',
          days: [
            { weekday: 0, title: 'Push', exercises: [{ name: 'Bench Press', sets: 4, reps: '8-10' }] },
            { weekday: 2, title: 'Pull', exercises: [{ name: 'Lat Pulldown', sets: 4, reps: '8-10' }] },
            { weekday: 4, title: 'Legs', exercises: [{ name: 'Barbell Squat', sets: 4, reps: '8-10' }] },
          ],
        },
      };
}

async function mockBodyReading(language: Language): Promise<BodyReadingAnalysis> {
  await delay(1500);
  return {
    deviceLabel: language === 'ar' ? 'InBody 270 (تجريبي)' : 'InBody 270 (demo)',
    testDate: '2026-06-15',
    weightKg: 78.4,
    bodyFatPercent: 19.5,
    skeletalMuscleMassKg: 34.2,
    segmentalLeanMassKg: { leftArm: 3.1, rightArm: 3.2, trunk: 27.8, leftLeg: 9.4, rightLeg: 9.6 },
    segmentalFatMassKg: { leftArm: 0.9, rightArm: 0.9, trunk: 8.1, leftLeg: 1.8, rightLeg: 1.8 },
    segmentalLeanMassStatus: { leftArm: 'normal', rightArm: 'normal', trunk: 'normal', leftLeg: 'low', rightLeg: 'low' },
    segmentalFatMassStatus: { leftArm: 'normal', rightArm: 'normal', trunk: 'high', leftLeg: 'normal', rightLeg: 'normal' },
    confidence: 0.85,
  };
}
