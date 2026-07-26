import type { ChatMessage, EquipmentAnalysis, FoodItem, Language, MealAnalysis } from './types';

/**
 * Base URL of the CalApp AI server (see server/ in this repo).
 * Set via EXPO_PUBLIC_API_URL in .env / eas.json. When unset, the app runs in
 * demo mode with mocked results so the full flow is testable without a backend.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

export const isMockMode = !API_URL;

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
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
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,nutriments`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status: number;
    product?: {
      product_name?: string;
      nutriments?: Record<string, number>;
    };
  };
  if (data.status !== 1 || !data.product) return null;
  const n = data.product.nutriments ?? {};
  const kcal = n['energy-kcal_100g'];
  if (!kcal && kcal !== 0) return null;
  return {
    name: data.product.product_name || barcode,
    calories: Math.round(kcal),
    proteinG: Math.round(n['proteins_100g'] ?? 0),
    carbsG: Math.round(n['carbohydrates_100g'] ?? 0),
    fatG: Math.round(n['fat_100g'] ?? 0),
    portion: '100 g',
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
