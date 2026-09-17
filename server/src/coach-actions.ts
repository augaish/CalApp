import type Anthropic from '@anthropic-ai/sdk';

import { num } from './parse.js';

/**
 * The coach's hands: tools that PROPOSE a change to the person's own records.
 * The app renders each as a card and writes nothing until they tap it, so
 * the sanitizers here only have to keep the payloads honest — a meal type
 * the app knows, numbers that are numbers, names that are not empty.
 */

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealType = (typeof MEAL_TYPES)[number];

export interface CoachFoodItem {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  portion: string;
}

export type CoachAction = (
  | { kind: 'logFood'; items: CoachFoodItem[]; mealType: MealType; date?: string }
  | { kind: 'updateFood'; mealId: string; itemIndex: number; patch: Partial<CoachFoodItem> }
  | { kind: 'logWorkout'; exerciseName: string; sets: { weightKg?: number; reps?: number; seconds?: number }[]; date?: string }
  | { kind: 'setTargets'; targets: { calories?: number; proteinG?: number; carbsG?: number; fatG?: number } }
  | { kind: 'logWater'; ml: number }
  | { kind: 'logWeight'; kg: number; date?: string }
) & { note?: string };

const NUTRITION_PROPS = {
  calories: { type: 'number' as const },
  proteinG: { type: 'number' as const },
  carbsG: { type: 'number' as const },
  fatG: { type: 'number' as const },
};
const DATE_PROP = { type: 'string' as const, description: 'YYYY-MM-DD. Omit for today.' };
const NOTE_PROP = { type: 'string' as const, description: "One short sentence, in the user's language, on why — shown on the card." };

export const FOOD_LOG_TOOL: Anthropic.Tool = {
  name: 'propose_food_log',
  description:
    "Propose logging food to the user's diary (they tap to confirm). Use when they ask you to log/add/record something they ate, or say what they ate and clearly want it recorded. Give realistic nutrition for the portion.",
  input_schema: {
    type: 'object',
    properties: {
      mealType: { type: 'string', enum: [...MEAL_TYPES], description: 'Which meal it belongs to. Infer from the time of day if not stated.' },
      date: DATE_PROP,
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: "In the user's language." },
            ...NUTRITION_PROPS,
            portion: { type: 'string', description: 'e.g. "1 plate (~350 g)", in the user\'s language.' },
          },
          required: ['name', 'calories', 'proteinG', 'carbsG', 'fatG', 'portion'],
        },
      },
      note: NOTE_PROP,
    },
    required: ['items', 'mealType'],
  },
};

export const FOOD_UPDATE_TOOL: Anthropic.Tool = {
  name: 'propose_food_update',
  description:
    'Propose correcting an entry already in the diary (they tap to confirm). Use when the user asks you to change a logged food, or when your own answer finds a logged value wrong for the portion. mealId and itemIndex MUST come from recentMeals in their data — never invent them. Include only the fields that change.',
  input_schema: {
    type: 'object',
    properties: {
      mealId: { type: 'string' },
      itemIndex: { type: 'integer', minimum: 0 },
      name: { type: 'string' },
      ...NUTRITION_PROPS,
      portion: { type: 'string' },
      note: NOTE_PROP,
    },
    required: ['mealId', 'itemIndex'],
  },
};

export const WORKOUT_LOG_TOOL: Anthropic.Tool = {
  name: 'propose_workout_log',
  description:
    'Propose logging sets of one exercise (they tap to confirm). Use when the user asks you to log/add/record training they did. One call per exercise.',
  input_schema: {
    type: 'object',
    properties: {
      exerciseName: { type: 'string', description: 'Common exercise name, e.g. "Barbell Squat".' },
      sets: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        items: {
          type: 'object',
          properties: {
            weightKg: { type: 'number' },
            reps: { type: 'integer' },
            seconds: { type: 'integer', description: 'For timed holds or cardio.' },
          },
        },
      },
      date: DATE_PROP,
      note: NOTE_PROP,
    },
    required: ['exerciseName', 'sets'],
  },
};

export const TARGETS_TOOL: Anthropic.Tool = {
  name: 'propose_targets',
  description:
    'Propose new daily calorie/macro targets (they tap to apply). Use when the user asks to change their targets, or when their data shows the current ones no longer fit their goal. Include only the values that change.',
  input_schema: {
    type: 'object',
    properties: { ...NUTRITION_PROPS, note: NOTE_PROP },
  },
};

export const WATER_LOG_TOOL: Anthropic.Tool = {
  name: 'propose_water_log',
  description: 'Propose adding water to today (they tap to confirm).',
  input_schema: { type: 'object', properties: { ml: { type: 'integer', minimum: 50, maximum: 3000 }, note: NOTE_PROP }, required: ['ml'] },
};

export const WEIGHT_LOG_TOOL: Anthropic.Tool = {
  name: 'propose_weight_log',
  description: 'Propose saving a body-weight reading the user stated (they tap to confirm).',
  input_schema: { type: 'object', properties: { kg: { type: 'number' }, date: DATE_PROP, note: NOTE_PROP }, required: ['kg'] },
};

export const FOLLOW_UPS_TOOL: Anthropic.Tool = {
  name: 'suggest_follow_ups',
  description:
    "Two or three short things the user might say next, shown as tappable chips. Call it with EVERY reply. Each ≤ 40 characters, in the user's language, phrased in the user's voice: a natural next question, a request for you to act (\"Log it for me\"), or a correction (\"It was 150 g, not 100\").",
  input_schema: {
    type: 'object',
    properties: { suggestions: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } } },
    required: ['suggestions'],
  },
};

export const ACTION_TOOLS: Anthropic.Tool[] = [FOOD_LOG_TOOL, FOOD_UPDATE_TOOL, WORKOUT_LOG_TOOL, TARGETS_TOOL, WATER_LOG_TOOL, WEIGHT_LOG_TOOL, FOLLOW_UPS_TOOL];

function str(v: unknown, max = 80): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function date(v: unknown): string | undefined {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}
function nonNeg(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = num(v, NaN);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : undefined;
}
function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
}

function foodItem(raw: unknown): CoachFoodItem | undefined {
  const i = obj(raw);
  const name = str(i?.name);
  if (!i || !name) return undefined;
  return {
    name,
    calories: nonNeg(i.calories) ?? 0,
    proteinG: nonNeg(i.proteinG) ?? 0,
    carbsG: nonNeg(i.carbsG) ?? 0,
    fatG: nonNeg(i.fatG) ?? 0,
    portion: str(i.portion, 40) || '1',
  };
}

/** Every proposal and follow-up out of a reply's tool calls, validated. */
export function sanitizeCoachActions(calls: { name: string; args: unknown }[]): { actions: CoachAction[]; suggestions: string[] } {
  const actions: CoachAction[] = [];
  const suggestions: string[] = [];
  for (const call of calls) {
    const a = obj(call.args) ?? {};
    const note = str(a.note, 160) || undefined;
    switch (call.name) {
      case 'propose_food_log': {
        const items = (Array.isArray(a.items) ? a.items : []).map(foodItem).filter((x): x is CoachFoodItem => !!x).slice(0, 8);
        const mealType = MEAL_TYPES.find((m) => m === a.mealType) ?? 'snack';
        if (items.length) actions.push({ kind: 'logFood', items, mealType, date: date(a.date), note });
        break;
      }
      case 'propose_food_update': {
        const mealId = str(a.mealId, 64);
        const itemIndex = Math.round(num(a.itemIndex, -1));
        if (!mealId || itemIndex < 0) break;
        const patch: Partial<CoachFoodItem> = {};
        const name = str(a.name);
        if (name) patch.name = name;
        for (const k of ['calories', 'proteinG', 'carbsG', 'fatG'] as const) {
          const v = nonNeg(a[k]);
          if (v != null) patch[k] = v;
        }
        const portion = str(a.portion, 40);
        if (portion) patch.portion = portion;
        if (Object.keys(patch).length) actions.push({ kind: 'updateFood', mealId, itemIndex, patch, note });
        break;
      }
      case 'propose_workout_log': {
        const exerciseName = str(a.exerciseName);
        const sets: { weightKg?: number; reps?: number; seconds?: number }[] = [];
        for (const s of Array.isArray(a.sets) ? a.sets.slice(0, 12) : []) {
          const o = obj(s) ?? {};
          const set: { weightKg?: number; reps?: number; seconds?: number } = {};
          const w = nonNeg(o.weightKg);
          const r = nonNeg(o.reps);
          const sec = nonNeg(o.seconds);
          if (w != null) set.weightKg = w;
          if (r != null) set.reps = Math.round(r);
          if (sec != null) set.seconds = Math.round(sec);
          if (Object.keys(set).length) sets.push(set);
        }
        if (exerciseName && sets.length) actions.push({ kind: 'logWorkout', exerciseName, sets, date: date(a.date), note });
        break;
      }
      case 'propose_targets': {
        const targets: { calories?: number; proteinG?: number; carbsG?: number; fatG?: number } = {};
        for (const k of ['calories', 'proteinG', 'carbsG', 'fatG'] as const) {
          const v = nonNeg(a[k]);
          if (v != null && v > 0) targets[k] = Math.round(v);
        }
        if (Object.keys(targets).length) actions.push({ kind: 'setTargets', targets, note });
        break;
      }
      case 'propose_water_log': {
        const ml = nonNeg(a.ml);
        if (ml != null && ml >= 50 && ml <= 3000) actions.push({ kind: 'logWater', ml: Math.round(ml), note });
        break;
      }
      case 'propose_weight_log': {
        const kg = nonNeg(a.kg);
        if (kg != null && kg >= 20 && kg <= 400) actions.push({ kind: 'logWeight', kg, date: date(a.date), note });
        break;
      }
      case 'suggest_follow_ups': {
        for (const s of Array.isArray(a.suggestions) ? a.suggestions : []) {
          const text = str(s, 60);
          if (text && suggestions.length < 3 && !suggestions.includes(text)) suggestions.push(text);
        }
        break;
      }
      default:
        break;
    }
  }
  return { actions: actions.slice(0, 6), suggestions };
}
