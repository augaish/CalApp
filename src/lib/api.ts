import type { ChatMessage, EquipmentAnalysis, FoodItem, Language, MealAnalysis } from './types';

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
  return installId ? { 'x-calgym-user': installId } : {};
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

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 402) {
    const q = (await res.json().catch(() => ({}))) as {
      plan?: string;
      used?: number;
      limit?: number;
    };
    throw new QuotaError(q.plan ?? 'free', q.used ?? 0, q.limit ?? 0);
  }
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface Entitlement {
  plan: 'free' | 'pro';
  used: number;
  limit: number;
  remaining: number;
  period: string;
  sponsor?: {
    enabled?: boolean;
    title?: string;
    subtitle?: string;
    imageUrl?: string;
    linkUrl?: string;
  } | null;
}

/** Current plan + remaining AI actions (and the sponsor slot, if any). */
export async function fetchEntitlement(): Promise<Entitlement | null> {
  try {
    const res = await fetch(`${API_URL}/api/me`, { headers: authHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as Entitlement;
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

export async function coachChat(messages: ChatMessage[], language: Language): Promise<string> {
  if (isMockMode) {
    await delay(900);
    return ''; // caller substitutes the localized mock reply
  }
  const res = await post<{ reply: string }>('/api/coach', { messages, language });
  return res.reply;
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
