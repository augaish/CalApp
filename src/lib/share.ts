import type { Exercise, FoodItem, MealType, PlannedSet } from './types';

/**
 * Payload embedded in a shareable schedule link. Custom / scan exercises are
 * carried inline (with their original ids) so the recipient can recreate any
 * that aren't built-in; built-in ids resolve from the app's own library.
 */
export interface SharedSchedule {
  v: 1;
  title?: string;
  schedule: Record<
    number,
    { title?: string; exerciseIds: string[]; plans?: Record<string, PlannedSet[]> }
  >;
  exercises: Exercise[];
}

/**
 * Payload behind a shared meal link. Photos are deliberately left out: a
 * photoUri points at a file on the sender's phone, so it is meaningless to the
 * recipient.
 */
export interface SharedMeal {
  v: 1;
  kind: 'meal';
  /** What was shared — one meal, or a whole day. */
  meals: { mealType?: MealType; items: FoodItem[] }[];
}

export function isSharedMeal(value: unknown): value is SharedMeal {
  const meal = value as SharedMeal | null;
  return !!meal && meal.v === 1 && meal.kind === 'meal' && Array.isArray(meal.meals);
}

/** Sum the macros across every food in a shared payload. */
export function sharedMealTotals(payload: SharedMeal): {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  const totals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const meal of payload.meals) {
    for (const item of meal.items ?? []) {
      totals.calories += item.calories;
      totals.proteinG += item.proteinG;
      totals.carbsG += item.carbsG;
      totals.fatG += item.fatG;
    }
  }
  return totals;
}

/** The localized strings `mealShareText` needs, resolved by the caller. */
export interface MealShareLabels {
  /** Opening line, e.g. "My lunch on Calgym" */
  heading: string;
  mealTypeName: (type: MealType) => string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  total: string;
  /** Invitation shown above the link. */
  openHint: string;
}

/**
 * The message that actually lands in WhatsApp. The macros are written out as
 * text rather than hidden behind the link, so someone without the app still
 * sees the numbers — the link is only there for a recipient who wants to log
 * the same food.
 */
export function mealShareText(
  payload: SharedMeal,
  labels: MealShareLabels,
  url?: string | null,
): string {
  const lines: string[] = [labels.heading, ''];
  const multiple = payload.meals.length > 1;
  for (const meal of payload.meals) {
    if (multiple && meal.mealType) lines.push(`— ${labels.mealTypeName(meal.mealType)} —`);
    for (const item of meal.items ?? []) {
      const portion = item.portion?.trim();
      lines.push(`• ${item.name}${portion ? ` (${portion})` : ''} — ${Math.round(item.calories)} ${labels.kcal}`);
      lines.push(
        `   ${labels.protein} ${Math.round(item.proteinG)}g · ${labels.carbs} ${Math.round(item.carbsG)}g · ${labels.fat} ${Math.round(item.fatG)}g`,
      );
    }
    if (multiple) lines.push('');
  }
  const totals = sharedMealTotals(payload);
  lines.push(
    `${labels.total}: ${Math.round(totals.calories)} ${labels.kcal} · ${labels.protein} ${Math.round(totals.proteinG)}g · ${labels.carbs} ${Math.round(totals.carbsG)}g · ${labels.fat} ${Math.round(totals.fatG)}g`,
  );
  if (url) lines.push('', labels.openHint, url);
  return lines.join('\n');
}

// ── Self-contained UTF-8 ⇄ base64url (no btoa/atob/escape dependency) ──────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Bytes(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff) {
      // surrogate pair
      const c2 = str.charCodeAt(++i);
      c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return out;
}

function bytesToUtf8(bytes: number[]): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b >= 0xc0 && b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    } else if (b >= 0xe0 && b < 0xf0) {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f),
      );
    } else {
      let cp =
        ((b & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

function bytesToB64url(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '' : B64[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '' : B64[b2 & 0x3f];
  }
  return out;
}

function b64urlToBytes(s: string): number[] {
  const out: number[] = [];
  const idx = (ch: string) => B64.indexOf(ch);
  for (let i = 0; i < s.length; i += 4) {
    const c0 = idx(s[i]);
    const c1 = idx(s[i + 1]);
    const c2 = i + 2 < s.length ? idx(s[i + 2]) : -1;
    const c3 = i + 3 < s.length ? idx(s[i + 3]) : -1;
    out.push((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) out.push(((c1 & 0x0f) << 4) | (c2 >> 2));
    if (c3 >= 0) out.push(((c2 & 0x03) << 6) | c3);
  }
  return out;
}

export function encodeSchedule(payload: SharedSchedule): string {
  return bytesToB64url(utf8Bytes(JSON.stringify(payload)));
}

export function decodeSchedule(data: string): SharedSchedule | null {
  try {
    const parsed = JSON.parse(bytesToUtf8(b64urlToBytes(data))) as SharedSchedule;
    if (!parsed || parsed.v !== 1 || !parsed.schedule) return null;
    return parsed;
  } catch {
    return null;
  }
}
