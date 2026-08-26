import { deviceLabel } from './device';
import { useAppStore } from './store';
import type {
  BodyReadingAnalysis,
  ChatMessage,
  CoachSchedulePlan,
  EquipmentAnalysis,
  FoodItem,
  GeneratedProgram,
  Language,
  MealAnalysis,
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
export function setInstallId(id: string | null) {
  installId = id;
}

function authHeaders(): Record<string, string> {
  // The server refuses unmetered calls, so never send one without an id: if
  // launch has not set it yet, mint it from the store on the spot.
  const id = installId ?? useAppStore.getState().ensureInstallId();
  return { 'x-calgym-user': id };
}

/** Raised when the caller has used up the month's AI allowance. */
export class QuotaError extends Error {
  constructor(
    public plan: string,
    public used: number,
    public limit: number,
  ) {
    super('quota_exceeded');
    this.name = 'QuotaError';
  }
}

/** Raised when the caller's plan does not include the feature at all. */
export class FeatureLockedError extends Error {
  constructor(public plan: string) {
    super('feature_locked');
    this.name = 'FeatureLockedError';
  }
}

/** Raised when the request actually reached the server and it responded
 * with a failure — as opposed to a plain network error (offline, timeout,
 * DNS), which surfaces as fetch's own thrown error instead. `code` is the
 * server's own error string (e.g. "invalid_request", "analysis_failed")
 * when it sent one, so a caller can show *why* rather than just "failed". */
export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'ApiError';
  }
}

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
  const ref = installId ?? useAppStore.getState().ensureInstallId();
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

export interface CoachReply {
  reply: string;
  /** Present when the coach proposed a weekly schedule the user can add. */
  schedulePlan?: CoachSchedulePlan;
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

/** Open Food Facts lookup — free public API, called directly from the app. */
export async function lookupBarcode(barcode: string): Promise<FoodItem | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_en,brands,nutriments`,
    // OFF asks every client to identify itself; without a User-Agent requests
    // are throttled/blocked and legit products come back as "not found".
    { headers: { 'User-Agent': 'Calgym/1.0 (calapp; food tracker)' } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status: number;
    product?: {
      product_name?: string;
      product_name_en?: string;
      brands?: string;
      nutriments?: Record<string, number>;
    };
  };
  if (data.status !== 1 || !data.product) return null;
  const n = data.product.nutriments ?? {};
  // Prefer kcal; fall back to kJ (energy_100g / energy-kj_100g) → kcal so
  // products that only store kilojoules still resolve.
  let kcal = n['energy-kcal_100g'];
  if (kcal == null) {
    const kj = n['energy-kj_100g'] ?? n['energy_100g'];
    if (kj != null) kcal = kj / 4.184;
  }
  if (kcal == null) return null;
  const per100 = {
    calories: Math.round(kcal),
    proteinG: Math.round(n['proteins_100g'] ?? 0),
    carbsG: Math.round(n['carbohydrates_100g'] ?? 0),
    fatG: Math.round(n['fat_100g'] ?? 0),
  };
  const label =
    data.product.product_name_en || data.product.product_name || data.product.brands || barcode;
  // Default to a 100 g serving; the user can dial in the real grams and the
  // macros scale from `basePer100` on the review screen.
  return {
    name: label,
    ...per100,
    portion: '100 g',
    basePer100: per100,
    gramsEaten: 100,
  };
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
        primaryMuscles: ['الظهر العريض'],
        secondaryMuscles: ['البايسبس', 'الكتف الخلفي'],
        setupSteps: ['اضبط مسند الفخذين على ساقيك', 'أمسك القبضة أوسع من كتفيك', 'اجلس وصدرك مرفوع'],
        formCues: ['اسحب البار إلى أعلى الصدر', 'حرّك مرفقيك للأسفل والخلف', 'تحكم في الرجوع ببطء'],
        commonMistakes: ['التأرجح بالجذع', 'السحب خلف الرقبة', 'استخدام وزن أثقل من اللازم'],
        suggestion: { sets: 3, reps: '10–12', note: 'ابدأ بوزن تستطيع التحكم به' },
        confidence: 0.85,
      }
    : {
        name: 'Lat pulldown machine',
        primaryMuscles: ['Lats'],
        secondaryMuscles: ['Biceps', 'Rear delts'],
        setupSteps: ['Adjust thigh pad snug on your legs', 'Grip slightly wider than shoulders', 'Sit tall, chest up'],
        formCues: ['Pull the bar to upper chest', 'Drive elbows down and back', 'Control the way up'],
        commonMistakes: ['Swinging the torso', 'Pulling behind the neck', 'Going too heavy'],
        suggestion: { sets: 3, reps: '10–12', note: 'Start with a weight you can control' },
        confidence: 0.85,
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
    confidence: 0.85,
  };
}
