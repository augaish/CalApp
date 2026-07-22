import type { EquipmentAnalysis, Language, MealAnalysis } from './types';

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
