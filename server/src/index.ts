import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';

import { ADMIN_HTML } from './admin-html.js';
import { PRIVACY_HTML, SUPPORT_HTML, TERMS_HTML, WHOOP_INTEGRATION_HTML, WHOOP_SHOTS, accountDeletionHtml } from './legal-html.js';
import {
  actionWeights,
  aiProviders,
  checkAccess,
  DEFAULT_ACTION_WEIGHTS,
  featureLocked,
  PLANS,
  planLimits,
  planLocksOn,
  planPrices,
  quotaError,
  release,
  reserve,
  trialLimit,
  type Access,
  type AiProvider,
  type Plan,
} from './billing.js';
import {
  adminStats,
  billingEventIsCurrent,
  canonicalKey,
  cacheEnabled,
  claimBillingEvent,
  consumeWhoopOAuthState,
  createShareLink,
  deleteUser,
  deleteWhoopConnection,
  whoopRefsFor,
  barcodeQueue,
  flagBarcode,
  getCachedBarcode,
  getCachedEquipment,
  getOrCreateUser,
  getSetting,
  getUsageKind,
  getUsageByKind,
  MODULE_CHANGE_DAYS,
  getWhoopConnection,
  initDb,
  linkRefs,
  listUsers,
  markBillingEventApplied,
  listShadowTests,
  readShareLink,
  recordShadowTest,
  recordTokens,
  resolveRef,
  saveWhoopOAuthState,
  recentAiFailures,
  recordAiFailure,
  aiFailureSummary,
  reviewBarcode,
  setCachedBarcode,
  submissionsToday,
  submitBarcode,
  setCachedEquipment,
  setSetting,
  setUserDevice,
  setUserEmail,
  setUserStore,
  refsForEmail,
  setUserPlan,
  setUserModule,
  setWhoopConnection,
  getPromo,
  listPromos,
  upsertPromo,
  deletePromo,
  listRedemptions,
  clearPromo,
  recordPromoConversion,
  recordPartnerEarnings,
  adminOverview,
  addDeletionRequest,
  listDeletionRequests,
  markDeletionRequestDone,
  openDeletionRequests,
  listPartners,
  savePartner,
  deletePartner,
  rotatePartnerToken,
  addPayout,
  partnerReport,
  getPartnerByToken,
  setCodeEarning,
  codeHasEarnings,
  codeEarningTotals,
  createProgramDraft,
  returnFreeChange,
  takeFreeChange,
} from './db.js';
import {
  citationDomains,
  extractJson,
  isInsufficientCreditError,
  isWebSearchDisabled,
  replyText,
  sanitizeEquipmentMuscles,
  applyRevision,
  sanitizeProgram,
  sanitizeRecipe,
  sanitizeRevision,
  sanitizeSchedulePlan,
  toBodyReadingAnalysis,
  toMealAnalysis,
  type CoachSchedulePlan,
  type FoodItem,
  type MealAnalysis,
  type ProgramPlan,
} from './parse.js';
import {
  fitProgram,
  mealViolations,
  sanitizeAnswers,
  stripViolations,
  violationsRequest,
  type PlanAnswers,
  type PlanScope,
} from './program-rules.js';
import { classifyAiError, describeAiError } from './ai-failure.js';
import { withProviderFallback } from './provider-fallback.js';
import { ACTION_TOOLS, coachScopeNote, scopeCoachTools, sanitizeCoachActions } from './coach-actions.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchLatestRecovery,
  fetchLatestSleep,
  fetchTodayStrain,
  fetchWorkoutHistory,
  fetchWorkoutsInRange,
  getValidAccessToken,
  kilojoulesToKcal,
  hasWearableData,
  revokeWhoopAccess,
  whoopConfigured,
  WhoopAuthError,
} from './whoop.js';
import {
  deepseekConfigured,
  deepseekTextCall,
  deepseekToolCall,
  deepseekVisionCall,
  type DeepseekTool,
} from './deepseek.js';
import { estimateCostUsd } from './pricing.js';
import { decide, planFromSubscriber, type RevenueCatEvent, type SubscriberRecord } from './revenuecat.js';
import { cleanEarning, cleanPartner } from './partners.js';
import { deleteAuthUser, deleteAuthUserByEmail, findAuthUserByEmail, supabaseAdminConfigured } from './supabase-admin.js';
import { bearerOf, identify, isAccountRef, ownStoreId, requireAccountToken, verifyAccessToken } from './identity.js';
import { partnerNotFoundHtml, partnerPageHtml } from './partner-html.js';
import { cleanDraft, codeProblem, normalizeCode, redeemPromo, remaining } from './promo.js';
import {
  bodyReadingPrompt,
  coachAttachmentSummaryPrompt,
  coachSystemPrompt,
  equipmentDetailsPrompt,
  exerciseInfoPrompt,
  identifyEquipmentPrompt,
  mealPrompt,
  programPrompt,
  recipePrompt,
  tailorPrompt,
  refineMealPrompt,
  JSON_ONLY_REMINDER,
  textMealPrompt,
  type Language,
} from './prompts.js';

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';
// Meal calorie analysis can use a stronger model for accuracy without paying
// for it on the cheaper endpoints (coach, equipment). Falls back to MODEL.
const MEAL_MODEL = process.env.MEAL_MODEL ?? MODEL;
/** Highest-accuracy model, used for meal analysis on the top tier. */
const PREMIUM_MODEL = process.env.PREMIUM_MODEL ?? MEAL_MODEL;
const PORT = Number(process.env.PORT ?? 3000);

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

/**
 * Lets the describe-a-meal call look up a named restaurant or packaged
 * product instead of guessing at a generic portion. `max_uses` bounds it to a
 * few searches ($10/1000 on top of normal tokens) — see textMealPrompt for
 * when the model is told to actually use it.
 */
const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 4,
};

/**
 * A client-executed tool: the coach fills this in, the app renders it as a
 * card, and the user taps to add it — the server never touches the user's
 * actual schedule. No weight field on purpose; the coach has no way to know
 * what the user can lift, so a set is (reps only), same as a freshly
 * hand-planned one.
 */
/** Shared between SCHEDULE_TOOL and PROGRAM_TOOL — a week of training days. */
const SCHEDULE_DAYS_SCHEMA = {
  type: 'array' as const,
  minItems: 1,
  maxItems: 7,
  items: {
    type: 'object' as const,
    properties: {
      weekday: {
        type: 'integer' as const,
        minimum: 0,
        maximum: 6,
        description: '0 = Sunday … 6 = Saturday',
      },
      title: {
        type: 'string' as const,
        description: "Short day label in the user's language, e.g. 'Push day'.",
      },
      exercises: {
        type: 'array' as const,
        minItems: 1,
        maxItems: 10,
        items: {
          type: 'object' as const,
          properties: {
            name: {
              type: 'string' as const,
              description: "Common exercise name, in the user's language.",
            },
            sets: { type: 'integer' as const, minimum: 1, maximum: 8 },
            reps: { type: 'string' as const, description: "A count or range, e.g. '10' or '8-12'." },
          },
          required: ['name', 'sets', 'reps'],
        },
      },
    },
    required: ['weekday', 'exercises'],
  },
};

const SCHEDULE_TOOL: Anthropic.Tool = {
  name: 'propose_weekly_schedule',
  description:
    "Propose a weekly workout schedule for the user to review and add to their app with one tap. Call this only for an explicit request for a training plan/schedule/split/routine — never for casual chat.",
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description:
          "One short sentence, in the user's language, on the plan's rationale (goal, split, frequency).",
      },
      days: SCHEDULE_DAYS_SCHEMA,
    },
    required: ['days'],
  },
};

const RECIPE_TOOL: Anthropic.Tool = {
  name: 'write_recipe',
  description:
    'Write one complete, cookable recipe: ingredients with weights and nutrition, and numbered steps.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: "The dish's name, in the user's language." },
      servings: {
        type: 'integer',
        minimum: 1,
        maximum: 12,
        description: 'How many servings the ingredient list as written produces.',
      },
      prepMinutes: { type: 'integer', minimum: 0, maximum: 240 },
      cookMinutes: { type: 'integer', minimum: 0, maximum: 480 },
      cookedYieldG: {
        type: 'integer',
        description:
          'Approximate cooked weight of the WHOLE batch, in grams. Rice roughly triples; meat loses about a quarter. Omit if you cannot estimate it.',
      },
      ingredients: {
        type: 'array',
        minItems: 2,
        maxItems: 20,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: "In the user's language." },
            key: {
              type: 'string',
              description:
                'Language-independent identity, lowercase English with underscores: "rice", "chicken_breast", "olive_oil", "onion". Two lines that are the same shopping item MUST share this exactly, across recipes and languages. Do not put the variety in it unless it changes what you buy.',
            },
            amount: { type: 'number', description: 'How much, in `unit`, for the whole batch.' },
            unit: { type: 'string', enum: ['g', 'ml'], description: 'g for solids, ml for liquids.' },
            state: {
              type: 'string',
              enum: ['raw', 'cooked'],
              description: 'Whether `amount` is before or after cooking. Weigh dry rice as raw.',
            },
            measure: {
              type: 'string',
              description:
                'The same amount as a person would measure it, precisely — "1 tbsp" not "1 spoon", "ملعقة كبيرة" not "ملعقة". For a cup, assume 240 ml. For anything counted, such as حبة or a piece, the weight above must match a realistic one.',
            },
            calories: { type: 'number' },
            proteinG: { type: 'number' },
            carbsG: { type: 'number' },
            fatG: { type: 'number' },
            aisle: {
              type: 'string',
              enum: ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'spices', 'other'],
            },
            estimated: {
              type: 'boolean',
              description: 'true when the nutrition is a rough guess rather than a figure you are confident in.',
            },
          },
          required: ['name', 'key', 'amount', 'unit', 'calories', 'proteinG', 'carbsG', 'fatG'],
        },
      },
      steps: {
        type: 'array',
        minItems: 2,
        maxItems: 15,
        items: { type: 'string' },
        description: "Numbered cooking steps, one instruction each, in the user's language.",
      },
    },
    required: ['name', 'servings', 'ingredients', 'steps'],
  },
};

const PROGRAM_TOOL: Anthropic.Tool = {
  name: 'propose_program',
  description: 'Design one complete program: calorie/macro targets plus a weekly training schedule.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: "2-3 sentences, in the user's language, on the program's approach and why — naming any concrete figures (their own data, WHOOP, a body reading) that shaped it.",
      },
      durationWeeks: { type: 'integer', minimum: 4, maximum: 16 },
      targets: {
        type: 'object',
        properties: {
          calories: { type: 'integer' },
          proteinG: { type: 'integer' },
          carbsG: { type: 'integer' },
          fatG: { type: 'integer' },
        },
        required: ['calories', 'proteinG', 'carbsG', 'fatG'],
      },
      schedule: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: "One short sentence on the split/frequency, in the user's language." },
          days: SCHEDULE_DAYS_SCHEMA,
        },
        required: ['days'],
      },
      mealPlan: {
        type: 'object',
        description: 'Named meals for every day of the week that hit the daily targets.',
        properties: {
          summary: { type: 'string', description: "One short sentence on the eating approach, in the user's language." },
          days: {
            type: 'array',
            minItems: 7,
            maxItems: 7,
            items: {
              type: 'object',
              properties: {
                weekday: { type: 'integer', minimum: 0, maximum: 6, description: '0 = Sunday … 6 = Saturday.' },
                meals: {
                  type: 'array',
                  minItems: 2,
                  maxItems: 4,
                  items: {
                    type: 'object',
                    properties: {
                      slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
                      name: { type: 'string', description: "Dish name for the whole meal, in the user's language." },
                      items: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 4,
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            portion: { type: 'string', description: "e.g. '150 g', '1 cup', in the user's language." },
                            calories: { type: 'integer' },
                            proteinG: { type: 'integer' },
                            carbsG: { type: 'integer' },
                            fatG: { type: 'integer' },
                          },
                          required: ['name', 'portion', 'calories', 'proteinG', 'carbsG', 'fatG'],
                        },
                      },
                    },
                    required: ['slot', 'name', 'items'],
                  },
                },
              },
              required: ['weekday', 'meals'],
            },
          },
        },
        required: ['days'],
      },
    },
    required: ['summary', 'durationWeeks', 'targets', 'schedule', 'mealPlan'],
  },
};

/**
 * The program tool for what was asked: a training-only program has no meal
 * plan to write, a food-only one no week of training — so the model is not
 * made to spend thousands of tokens on a half that is then thrown away.
 */
function programTool(scope: PlanScope): Anthropic.Tool {
  if (scope === 'both') return PROGRAM_TOOL;
  const schema = PROGRAM_TOOL.input_schema as { properties: Record<string, unknown>; required: string[] };
  const drop = scope === 'training' ? 'mealPlan' : 'schedule';
  const properties = { ...schema.properties };
  delete properties[drop];
  return {
    ...PROGRAM_TOOL,
    description:
      scope === 'training'
        ? 'Design one complete program: calorie/macro targets plus a weekly training schedule.'
        : 'Design one complete program: calorie/macro targets plus a weekly meal plan.',
    input_schema: { type: 'object', properties, required: schema.required.filter((r) => r !== drop) },
  };
}

/** One round of tailoring a draft: only the parts that change. */
const REVISE_TOOL: Anthropic.Tool = (() => {
  const props = (PROGRAM_TOOL.input_schema as { properties: Record<string, { properties?: Record<string, unknown> }> }).properties;
  return {
    name: 'revise_program',
    description: 'Change a draft program as the person asked. Send only what changes.',
    input_schema: {
      type: 'object',
      properties: {
        reply: { type: 'string', description: "One or two friendly sentences, in the user's language." },
        changes: {
          type: 'array',
          maxItems: 8,
          items: { type: 'string' },
          description: "One short line per change, in the user's language. Empty when nothing changed.",
        },
        summary: { type: 'string', description: 'The new program summary, only if it should change.' },
        durationWeeks: { type: 'integer', minimum: 4, maximum: 16 },
        targets: props.targets,
        schedule: props.schedule,
        mealPlanDays: (props.mealPlan.properties as Record<string, unknown>).days,
        weekdays: {
          type: 'array',
          items: { type: 'integer', minimum: 0, maximum: 6 },
          description: 'The full new list of training weekdays (0 = Sunday), only when they asked to move training days.',
        },
      },
      required: ['reply', 'changes'],
    },
  } as Anthropic.Tool;
})();

const app = new Hono();
app.use('*', cors());

// Baseline browser protections for every page and reply: no framing (the
// admin console can't be loaded inside someone else's page), no MIME
// sniffing, and no full URLs leaking out as referrers. A route may still set
// its own (the partner page sends no referrer at all).
app.use('*', async (c, next) => {
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  await next();
});

/**
 * The origin to build shareable links from. Behind Railway's proxy the request
 * arrives as http internally, so the forwarded scheme is what the outside world
 * actually sees.
 */
function publicBase(c: { req: { header: (n: string) => string | undefined; url: string } }): string {
  const configured = process.env.PUBLIC_URL?.replace(/\/$/, '');
  if (configured) return configured;
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host');
  const proto = c.req.header('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : new URL(c.req.url).origin;
}

/** Ids are opaque to us; only the shape is checked. */
function validRef(raw: string): string | null {
  const ref = raw.trim();
  if (!ref || ref.length > 100) return null;
  return /^[A-Za-z0-9._:-]+$/.test(ref) ? ref : null;
}

/**
 * Who is calling. A guest sends their per-install id and a signed-in user
 * sends their account id plus their Supabase access token, which is what
 * actually proves it (see identity.ts). Without a token — older builds — an
 * install that has since been claimed by an account resolves to that
 * account, until REQUIRE_ACCOUNT_TOKEN switches that trust off.
 */
async function callerRef(c: {
  req: { header: (n: string) => string | undefined };
}): Promise<string | null> {
  return identify(validRef(c.req.header('x-calgym-user') ?? ''), bearerOf(c.req.header('authorization')), {
    resolveRef,
    verify: (t) => verifyAccessToken(t),
    enforce: enforcingAccountToken(),
  });
}

/** Strict mode only bites when the server can actually check tokens. */
function enforcingAccountToken(): boolean {
  return requireAccountToken() && supabaseAdminConfigured();
}

/**
 * Every endpoint that spends model tokens. Without an id there is nothing to
 * meter against, so an unidentified caller would get unlimited AI on our bill
 * simply by omitting the header — these routes require one.
 */
const METERED_ROUTES = [
  '/api/analyze-meal',
  '/api/analyze-equipment',
  '/api/analyze-text',
  '/api/analyze-exercise',
  '/api/coach',
];

for (const path of METERED_ROUTES) {
  app.use(path, async (c, next) => {
    if (!validRef(c.req.header('x-calgym-user') ?? '')) {
      return c.json({ error: 'identify_required' }, 401);
    }
    await next();
  });
}

/**
 * Which build is actually running. Railway injects the deployed commit, so
 * "is my change live?" is one request instead of guesswork.
 */
const COMMIT = (
  process.env.RAILWAY_GIT_COMMIT_SHA ??
  process.env.COMMIT_SHA ??
  'dev'
).slice(0, 7);

app.get('/health', async (c) =>
  c.json({
    ok: true,
    cache: cacheEnabled,
    commit: COMMIT,
    // Which AI is actually live per tier, so "did my dashboard change take
    // effect on the deployed build?" is one request instead of guesswork.
    providers: await aiProviders(deepseekConfigured()),
  }),
);

/** What a bounce page says, per kind of thing being shared. */
const BOUNCE_COPY = {
  'schedule-import': {
    title: 'Calgym workout plan',
    body: 'Open this shared plan in the Calgym app to add it to your week.',
  },
  'meal-import': {
    title: 'Calgym food',
    body: 'Open this shared food in the Calgym app to add it to your day.',
  },
} as const;

/**
 * The page a share link lands on. It bounces into the app via the `calapp://`
 * deep link, with a button as the fallback.
 */
function bouncePage(deepLink: string): string {
  // Only ever our own two screens — the prefix check below is what stops this
  // page from redirecting anywhere else.
  const screen = deepLink.startsWith('calapp://meal-import')
    ? 'meal-import'
    : 'schedule-import';
  const copy = BOUNCE_COPY[screen];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${copy.title}</title>
<style>
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:#F5F3FA; color:#2A2440; display:flex; min-height:100vh; align-items:center;
    justify-content:center; text-align:center; padding:24px; }
  .card { max-width:360px; }
  h1 { font-size:22px; margin:16px 0 8px; }
  p { color:#6B6480; line-height:1.5; margin:0 0 24px; }
  a.btn { display:inline-block; background:#6D5AAB; color:#fff; text-decoration:none;
    font-weight:700; padding:14px 28px; border-radius:14px; }
  .logo { width:64px; height:64px; border-radius:16px;
    background:linear-gradient(135deg,#9B86D4,#7FB89B); margin:0 auto; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo"></div>
    <h1>${copy.title}</h1>
    <p>${copy.body}</p>
    <a class="btn" id="open" href="${deepLink}">Open in Calgym</a>
  </div>
  <script>
    var link = ${JSON.stringify(deepLink)};
    if (link.indexOf('calapp://schedule-import?') === 0 || link.indexOf('calapp://meal-import?') === 0) {
      setTimeout(function () { window.location.href = link; }, 300);
    }
  </script>
</body>
</html>`;
}

/** Code shape for a shared plan; anything else is not one of ours. */
function validCode(raw: string): string | null {
  const code = (raw ?? '').trim();
  return /^[A-Za-z0-9]{6,16}$/.test(code) ? code : null;
}

/**
 * Publish a plan and get a short code back.
 *
 * The plan used to be base64'd into the link itself, which produced URLs
 * thousands of characters long — WhatsApp linkified only the first part, so
 * what arrived was a link with no payload and the app rightly called it
 * invalid. The payload lives here now and the link is a handful of characters.
 */
app.post('/api/share', async (c) => {
  const ref = await callerRef(c);
  if (!ref) return c.json({ error: 'identify_required' }, 401);
  const body = await c.req.json<{ payload?: unknown; kind?: string }>().catch(() => ({}) as never);
  if (!body?.payload || typeof body.payload !== 'object') {
    return c.json({ error: 'invalid_request' }, 400);
  }
  // A weekly plan is a few kB; anything far larger is not one.
  if (JSON.stringify(body.payload).length > 256 * 1024) {
    return c.json({ error: 'payload_too_large' }, 413);
  }
  // The path decides which screen the link opens. Keeping that in the URL means
  // /s/:code and /m/:code stay a pure redirect with no database read.
  const path = body.kind === 'meal' ? 'm' : 's';
  try {
    const code = await createShareLink(body.payload);
    if (!code) return c.json({ error: 'share_unavailable' }, 503);
    return c.json({ code, url: `${publicBase(c)}/${path}/${code}` });
  } catch (err) {
    console.error('create share failed:', err);
    return c.json({ error: 'share_failed' }, 500);
  }
});

/** The app fetches the plan behind a code. */
app.get('/api/share/:code', async (c) => {
  const code = validCode(c.req.param('code'));
  if (!code) return c.json({ error: 'invalid_request' }, 400);
  const payload = await readShareLink(code);
  if (!payload) return c.json({ error: 'not_found' }, 404);
  return c.json({ payload });
});

/** Short link: what actually gets pasted into a chat. */
app.get('/s/:code', (c) => {
  const code = validCode(c.req.param('code'));
  return c.html(
    bouncePage(code ? `calapp://schedule-import?c=${code}` : 'calapp://schedule-import'),
  );
});

/** Same, for a shared meal. */
app.get('/m/:code', (c) => {
  const code = validCode(c.req.param('code'));
  return c.html(bouncePage(code ? `calapp://meal-import?c=${code}` : 'calapp://meal-import'));
});

/**
 * The original link shape, kept working so plans shared before short codes
 * existed still open.
 */
app.get('/s', (c) => {
  const raw = c.req.query('d') ?? '';
  // base64url only — reject anything else so nothing untrusted is injected.
  const data = /^[A-Za-z0-9_-]+$/.test(raw) ? raw : '';
  return c.html(
    bouncePage(data ? `calapp://schedule-import?d=${data}` : 'calapp://schedule-import'),
  );
});

interface AnalyzeBody {
  image?: string;
  language?: string;
}

function parseBody(body: AnalyzeBody): { image: string; language: Language } | null {
  const image = body.image?.replace(/^data:image\/\w+;base64,/, '');
  if (!image || image.length < 100) return null;
  // ~10 MB base64 cap: anything bigger is not a legitimate app upload.
  if (image.length > 10 * 1024 * 1024) return null;
  const language: Language = body.language === 'ar' ? 'ar' : 'en';
  return { image, language };
}

/** Who to bill a model call's real token usage against, and under which
 * usage-counter kind — passed through the shared call helpers below so the
 * admin dashboard's per-user cost estimate reflects an actual API response
 * rather than a flat per-action guess. */
interface Track {
  ref: string;
  kind: string;
}

/** Adds one call's real input/output tokens and their estimated USD cost
 * onto the caller's usage-counter row. Takes plain token counts rather than
 * an Anthropic.Message so any provider's response can report through the
 * same path (see the DeepSeek pilot on /api/analyze-exercise). Best-effort:
 * a lost cost figure must never fail the request that already succeeded. */
async function trackUsage(
  track: Track,
  model: string,
  usage: { input_tokens: number; output_tokens: number },
): Promise<void> {
  try {
    const cost = estimateCostUsd(model, usage.input_tokens, usage.output_tokens);
    await recordTokens(track.ref, track.kind, usage.input_tokens, usage.output_tokens, cost);
  } catch (err) {
    console.error('trackUsage failed:', err);
  }
}

async function analyzeMealImage(
  image: string,
  prompt: string,
  model: string = MODEL,
  track?: Track,
): Promise<MealAnalysis> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: image },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  if (track) await trackUsage(track, model, response.usage);

  return toMealAnalysis(replyText(response));
}

/**
 * Background-only comparison call: runs DeepSeek's vision model on the same
 * meal photo Claude just answered, purely to log how it compares before
 * ever trusting it with a real answer on this route (the app's single most
 * heavily used one). Never awaited by the request handler, never shown to
 * the user, and never touches reserve()/release() — a DeepSeek failure or
 * slowdown here can't affect or delay the real response. Results land in
 * deepseek_shadow_log, visible on the admin dashboard.
 */
async function shadowTestMealAnalysis(
  ref: string,
  image: string,
  language: Language,
  claudeModel: string,
  claudeResult: MealAnalysis,
  claudeMs: number,
): Promise<void> {
  const start = Date.now();
  try {
    // deepseek-flash is a reasoning model: its chain-of-thought competes with
    // the final JSON answer for the same max_tokens budget on this model, so
    // a text-heavy photo (a menu screenshot, several modifiers) can burn the
    // whole budget thinking and leave nothing for the answer itself
    // (finish_reason: length, empty content). Generous on purpose — this
    // call is a fire-and-forget background comparison, never on the user's
    // critical path, so the extra latency/cost is free to spend.
    const ds = await deepseekVisionCall(image, mealPrompt(language), 8000);
    const deepseekResult = toMealAnalysis(ds.text);
    const deepseekCostUsd = estimateCostUsd(ds.model, ds.inputTokens, ds.outputTokens);
    await recordShadowTest({
      ref,
      claudeModel,
      claudeResult,
      claudeMs,
      deepseekResult,
      deepseekError: null,
      deepseekMs: Date.now() - start,
      deepseekCostUsd,
    });
  } catch (err) {
    await recordShadowTest({
      ref,
      claudeModel,
      claudeResult,
      claudeMs,
      deepseekResult: null,
      deepseekError: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      deepseekMs: Date.now() - start,
      deepseekCostUsd: null,
    });
  }
}

async function analyze(
  image: string,
  prompt: string,
  model: string = MODEL,
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg',
  track?: Track,
): Promise<unknown> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: image },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  if (track) await trackUsage(track, model, response.usage);

  return extractJson(replyText(response));
}

/** Same as `analyze`, for a PDF document instead of an image (e.g. an InBody export). */
async function analyzeDocument(pdf: string, prompt: string, model: string = MODEL, track?: Track): Promise<unknown> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdf },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  if (track) await trackUsage(track, model, response.usage);

  return extractJson(replyText(response));
}

/** Text-only completion (no image) — used for cacheable equipment details. */
async function textCall(prompt: string, maxTokens = 1500, track?: Track): Promise<unknown> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  if (track) await trackUsage(track, MODEL, response.usage);
  return extractJson(replyText(response));
}

/**
 * The response an AI route's catch block should send. Every one of these
 * routes used to map any thrown error — a genuine glitch, a malformed
 * reply, or the Anthropic account simply being out of credit — to the same
 * generic `fallbackCode`, which reads as "try again" (transient) even when
 * the real issue is "add credit" (won't fix itself no matter how many times
 * the user retries).
 */
function aiFailure(c: Context, err: unknown, fallbackCode: string) {
  // isInsufficientCreditError only recognises Anthropic's wording; classify
  // covers DeepSeek's too, plus the seven other things that actually go wrong.
  const failure = isInsufficientCreditError(err)
    ? ({ code: 'ai_credits_exhausted', httpStatus: 503, retryable: false } as const)
    : classifyAiError(err);
  const code = failure.code || fallbackCode;
  // Recorded before responding, and never allowed to fail the response: a
  // problem with the failure log must not become a second failure. Without
  // this the only trace of a production outage was a console line on a host
  // nobody is watching, which is why "generation failed" could be reported
  // for two days with no way to find out why.
  void recordAiFailure({
    route: new URL(c.req.url).pathname,
    code,
    detail: describeAiError(err),
  }).catch((logErr) => console.error('recordAiFailure failed:', logErr));
  console.error(`AI failure on ${new URL(c.req.url).pathname} [${code}]:`, describeAiError(err));
  return c.json({ error: code, retryable: failure.retryable }, failure.httpStatus);
}

/**
 * Which AI answers for this caller, from the per-membership setting the
 * admin dashboard writes. Consulted only by routes DeepSeek can actually
 * serve; the ones it can't are listed below.
 */
async function providerFor(access: Access): Promise<AiProvider> {
  const providers = await aiProviders(deepseekConfigured());
  return providers[access.plan] ?? 'claude';
}

async function providerForContext(access: Access, context: unknown): Promise<AiProvider> {
  return hasWearableData(context) ? 'claude' : providerFor(access);
}

/**
 * What the dashboard's provider setting cannot cover, and why. Every route
 * now follows the per-tier setting; the only exception left is a file
 * format, not a feature: our DeepSeek client speaks the OpenAI chat format,
 * which carries images and not PDFs.
 *
 * Body readings used to be listed here on my assumption that DeepSeek's
 * image detail was too coarse for a printed table of numbers. The admin
 * report test disproved that on a real Arabic InBody printout — every
 * field matched Claude, including the fat-percent-vs-fat-mass trap and the
 * Arabic status words — so the route now follows the tier like the rest.
 */
/** Products one person may add per day before the queue stops accepting them. */
const SUBMISSIONS_PER_DAY = 25;

const AI_PROVIDER_FIXED_ROUTES = [
  {
    route: 'PDF uploads only',
    reason: 'A report or attachment sent as a PDF goes to Claude whatever the tier says, because our DeepSeek client sends images. Photos of the same report follow the tier setting. Ask for PDF-to-image conversion if you want this last case moved too.',
  },
];

/** Our Anthropic tool definitions, in OpenAI's function-calling shape. The
 * schema body is identical JSON Schema; only the wrapper differs. */
function toDeepseekTool(tool: Anthropic.Tool): DeepseekTool {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
  };
}

/**
 * DeepSeek's reasoning models occasionally spend the whole budget thinking
 * and return no content at all; one retry catches nearly all of those
 * without falling back to a paid Claude call.
 */
async function withOneRetry<T>(call: (attempt: 0 | 1) => Promise<T>): Promise<T> {
  try {
    return await call(0);
  } catch (err) {
    console.warn('deepseek call failed once, retrying:', err instanceof Error ? err.message : err);
    return await call(1);
  }
}

/**
 * Token budget for a DeepSeek text call: the retry gets three times the
 * room, because the failure it most often follows is the model's hidden
 * reasoning spending the whole first budget (DeepseekBudgetError).
 */
const dsBudget = (attempt: 0 | 1, base: number) => (attempt ? base * 3 : base);

/**
 * A text meal estimate from Claude with web search (restaurant menus), used
 * by describe and refine. A search turn paused mid-way is continued; a
 * disabled web search falls back to a plain call; and a reply with no usable
 * JSON (a search turn that ended in prose, a cut-off or malformed answer)
 * gets one retry without tools and with a JSON-only reminder — with the head
 * of what came back logged, because that failure is invisible otherwise.
 */
async function mealWithSearch(
  request: { model: string; max_tokens: number; messages: { role: 'user'; content: string }[] },
  ref: string,
  label: string,
  prompt: string,
): Promise<MealAnalysis> {
  let response;
  try {
    response = await anthropic.messages.create({ ...request, tools: [WEB_SEARCH_TOOL] });
    for (let turns = 0; response.stop_reason === 'pause_turn' && turns < 2; turns++) {
      await trackUsage({ ref, kind: 'describe' }, request.model, response.usage);
      response = await anthropic.messages.create({
        ...request,
        tools: [WEB_SEARCH_TOOL],
        messages: [...request.messages, { role: 'assistant' as const, content: response.content as Anthropic.MessageParam['content'] }],
      });
    }
  } catch (err) {
    // Web search is an org-level Console setting; a disabled account must
    // still get its estimate, just without a restaurant lookup.
    if (!isWebSearchDisabled(err)) throw err;
    console.warn(`web search unavailable, retrying ${label} without it`);
    response = await anthropic.messages.create(request);
  }
  await trackUsage({ ref, kind: 'describe' }, request.model, response.usage);
  try {
    return toMealAnalysis(replyText(response), citationDomains(response));
  } catch (parseErr) {
    const head = response.content
      .map((b) => (b.type === 'text' ? b.text.slice(0, 160) : `<${b.type}>`))
      .join(' | ')
      .slice(0, 400);
    console.warn(
      `${label} reply unparseable (${parseErr instanceof Error ? parseErr.message.slice(0, 120) : parseErr}); stop=${response.stop_reason}; head: ${head}. Retrying without web search.`,
    );
    const retry = await anthropic.messages.create({
      ...request,
      messages: [{ role: 'user' as const, content: prompt + JSON_ONLY_REMINDER }],
    });
    await trackUsage({ ref, kind: 'describe' }, request.model, retry.usage);
    return toMealAnalysis(replyText(retry));
  }
}

app.post('/api/analyze-meal', async (c) => {
  const parsed = parseBody(await c.req.json<AnalyzeBody>().catch(() => ({})));
  if (!parsed) return c.json({ error: 'invalid_request' }, 400);
  const ref = (await callerRef(c))!;
  const access = await checkAccess(ref, 'meal');
  const claim = await reserve(ref, access, 'meal');
  if (!claim.ok) return c.json(quotaError(access), 402);
  try {
    if ((await providerFor(access)) === 'deepseek') {
      // Same generous budget as the shadow test, for the same reason (a
      // reasoning model's thinking shares max_tokens with the JSON answer).
      // Parsed inside the retry, so a malformed answer gets the second try too.
      const result = await withOneRetry(async (attempt) => {
        const ds = await deepseekVisionCall(parsed.image, mealPrompt(parsed.language), dsBudget(attempt, 8000));
        await trackUsage({ ref, kind: 'meal' }, ds.model, { input_tokens: ds.inputTokens, output_tokens: ds.outputTokens });
        return toMealAnalysis(ds.text);
      });
      return c.json(result);
    }
    const model = access.spec.highAccuracy ? PREMIUM_MODEL : MEAL_MODEL;
    const claudeStart = Date.now();
    const result = await analyzeMealImage(parsed.image, mealPrompt(parsed.language), model, { ref, kind: 'meal' });
    if (deepseekConfigured()) {
      // Fire-and-forget: the user's real response never waits on this. Only
      // runs while Claude is the live provider — it exists to compare the
      // two, so with DeepSeek live there's nothing to compare against.
      void shadowTestMealAnalysis(ref, parsed.image, parsed.language, model, result, Date.now() - claudeStart);
    }
    return c.json(result);
  } catch (err) {
    console.error('analyze-meal failed:', err);
    await release(ref, 'meal');
    return aiFailure(c, err, 'analysis_failed');
  }
});

/**
 * The barcode item shape the client actually stores — a superset of the
 * server's own slimmer FoodItem (parse.ts), which has no need for the
 * per-100g scaling fields a packaged product's review screen uses.
 * basePer100/gramsEaten are optional: an Open Food Facts hit always has
 * them (real per-100g label data), but an AI-photo-resolved report might
 * not — the model estimates one serving as photographed, not necessarily
 * a clean per-100g figure, so this is cached and shown as a normal single
 * scanned item rather than mislabeled as scalable per-100g data.
 */
interface BarcodeItem {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  portion: string;
  basePer100?: { calories: number; proteinG: number; carbsG: number; fatG: number };
  gramsEaten?: number;
}

/** Open Food Facts lookup, run server-side so a hit can be written through
 * to barcode_cache — every product OFF actually has only needs asking OFF
 * once, ever, across every Calgym user. */
async function lookupOffBarcode(barcode: string): Promise<BarcodeItem | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_en,brands,nutriments`,
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
  return { name: label, ...per100, portion: '100 g', basePer100: per100, gramsEaten: 100 };
}

/** Barcodes are plain digit strings (UPC/EAN) in practice; this just keeps
 * garbage out of the cache table, not a real format validator. */
function isPlausibleBarcode(v: string): boolean {
  return /^[0-9]{6,14}$/.test(v);
}

/**
 * Barcode → nutrition. Checks the app's own first-party cache first (see
 * barcode_cache — grown from every product a user has ever resolved via the
 * AI photo-scan fallback below), then Open Food Facts, write-through on an
 * OFF hit so the same product is never looked up there twice. No AI call
 * and no quota — this is exactly as free as the OFF lookup it replaces.
 */
app.get('/api/barcode', async (c) => {
  const code = (c.req.query('code') ?? '').trim();
  if (!isPlausibleBarcode(code)) return c.json({ error: 'invalid_request' }, 400);
  const ref = await callerRef(c);
  const cached = await getCachedBarcode(code, ref);
  // `source` tells the app whether this product's facts came from Open Food
  // Facts, which is ODbL-licensed and must be credited on screen, or from our
  // own label reads, which need no credit. `status` marks a reading that has
  // not been checked by a person yet — served back to whoever contributed it,
  // never to anyone else.
  if (cached) return c.json({ item: cached.item, source: cached.source, status: cached.status });
  try {
    const item = await lookupOffBarcode(code);
    if (item) await setCachedBarcode(code, item, 'off');
    return c.json({ item, source: item ? 'off' : null });
  } catch (err) {
    console.error('barcode lookup failed:', err);
    return c.json({ item: null, source: null });
  }
});

/**
 * Files an AI-resolved product into the shared barcode cache — called after
 * the "Use camera" fallback (analyze-meal on a photo of the label) succeeds
 * for a barcode neither the cache nor OFF had. No AI call happens here,
 * just a cache write, so it costs nothing beyond the analyze-meal call the
 * client already paid for.
 */
app.post('/api/barcode/report', async (c) => {
  const body = await c.req
    .json<{ barcode?: string; item?: BarcodeItem }>()
    .catch(() => ({}) as never);
  const barcode = (body.barcode ?? '').trim();
  const item = body.item;
  if (
    !isPlausibleBarcode(barcode) ||
    !item ||
    typeof item.name !== 'string' ||
    !item.name.trim() ||
    typeof item.calories !== 'number'
  ) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const ref = await callerRef(c);
  // One person can add a reasonable number of products a day. Beyond that it
  // is a misfiring client or someone gaming the catalogue, and either way a
  // reviewer should not have to wade through it.
  if (ref && (await submissionsToday(ref)) >= SUBMISSIONS_PER_DAY) {
    return c.json({ error: 'rate_limited' }, 429);
  }
  // Every reading is recorded, including one that disagrees with what is
  // already on file — that disagreement is exactly the signal a reviewer
  // needs, and dropping it (as this route used to) threw it away. The cache
  // row is still only created when nothing is there, and starts unpublished.
  const result = await submitBarcode(barcode, item, ref);
  return c.json({ ok: result.recorded, conflicting: result.conflicting });
});

/**
 * "This product is wrong." Enough reports and it stops being served to
 * everyone until a person looks at it — a wrong entry left published is worse
 * than no entry at all, because it is silently believed.
 */
app.post('/api/barcode/flag', async (c) => {
  const body = await c.req.json<{ barcode?: string }>().catch(() => ({}) as never);
  const barcode = (body.barcode ?? '').trim();
  if (!isPlausibleBarcode(barcode)) return c.json({ error: 'invalid_request' }, 400);
  const flags = await flagBarcode(barcode);
  return c.json({ ok: true, flags });
});

app.post('/api/analyze-equipment', async (c) => {
  const parsed = parseBody(await c.req.json<AnalyzeBody>().catch(() => ({})));
  if (!parsed) return c.json({ error: 'invalid_request' }, 400);
  const ref = (await callerRef(c))!;
  const access = await checkAccess(ref, 'equipment');
  if (!access.featureAllowed) return c.json(featureLocked(access), 403);
  const claim = await reserve(ref, access, 'equipment');
  if (!claim.ok) return c.json(quotaError(access), 402);
  try {
    const provider = await providerFor(access);
    // Step 1: cheap vision call to identify the machine. Naming a machine
    // needs far less image detail than reading a printout, so this one is
    // within DeepSeek's flat 384-token image budget.
    const id = (await (provider === 'deepseek'
      ? withOneRetry(() => deepseekVisionCall(parsed.image, identifyEquipmentPrompt(parsed.language), 4000)).then(
          async (ds) => {
            await trackUsage({ ref, kind: 'equipment' }, ds.model, {
              input_tokens: ds.inputTokens,
              output_tokens: ds.outputTokens,
            });
            return extractJson(ds.text);
          },
        )
      : analyze(parsed.image, identifyEquipmentPrompt(parsed.language), undefined, undefined, {
          ref,
          kind: 'equipment',
        }))) as {
      name?: string;
      confidence?: number;
    };
    const name = (id.name ?? '').trim();
    if (!name) {
      // Nothing recognised is not a result worth charging for.
      await release(ref, 'equipment');
      return c.json({
        name: parsed.language === 'ar' ? 'لا يوجد جهاز واضح' : 'No equipment detected',
        primaryMuscles: [],
        secondaryMuscles: [],
        setupSteps: [],
        formCues: [],
        commonMistakes: [],
        suggestion: { sets: 0, reps: '', note: '' },
        confidence: 0,
      });
    }

    // Step 2: serve the token-heavy analysis from the shared cache when possible.
    const key = canonicalKey(name);
    const cached = await getCachedEquipment(key, parsed.language);
    if (cached) {
      // Filters out anything cached before the muscle-id vocabulary existed
      // (old entries hold localized muscle names, not ids).
      const clean = sanitizeEquipmentMuscles(cached as Record<string, unknown>);
      // ...but filtering an old entry leaves it with NO muscles at all, and
      // serving that hid the muscle map on every future scan of the machine
      // — permanently, since the empty answer came from cache and rescanning
      // returned the same empty answer. An entry with nothing left to draw
      // is treated as a miss so it gets regenerated and overwritten below.
      if (clean.primaryMuscles.length > 0) return c.json(clean);
      console.warn(`equipment cache entry "${key}" (${parsed.language}) has no usable muscle ids; regenerating`);
    }

    // Step 3: cache miss — generate details (text only, no image) and store.
    // The cache is shared across providers on purpose: these are stable
    // facts about a machine, and the muscle-id sanitizer applies either way.
    const detailsPrompt = equipmentDetailsPrompt(parsed.language, name);
    let raw: unknown;
    if (provider === 'deepseek') {
      const ds = await withOneRetry((attempt) => deepseekTextCall(detailsPrompt, dsBudget(attempt, 4000)));
      await trackUsage({ ref, kind: 'equipment' }, ds.model, {
        input_tokens: ds.inputTokens,
        output_tokens: ds.outputTokens,
      });
      raw = extractJson(ds.text);
    } else {
      raw = await textCall(detailsPrompt, 1500, { ref, kind: 'equipment' });
    }
    const details = sanitizeEquipmentMuscles(raw as Record<string, unknown>);
    await setCachedEquipment(key, parsed.language, details);
    return c.json(details);
  } catch (err) {
    console.error('analyze-equipment failed:', err);
    await release(ref, 'equipment');
    return aiFailure(c, err, 'analysis_failed');
  }
});

interface BodyReadingBody {
  image?: string;
  imageMediaType?: string;
  pdf?: string;
  language?: string;
}

const SUPPORTED_IMAGE_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
type SupportedImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/** Like `parseBody`, but also accepts a PDF export (InBody etc. print/save as
 * PDF far more often than a clean single photo) — kept separate from the
 * shared image-only `parseBody` since no other route needs this. */
function parseBodyReadingBody(
  body: BodyReadingBody,
): (({ image: string; mediaType: SupportedImageMediaType } | { pdf: string }) & { language: Language }) | null {
  const language: Language = body.language === 'ar' ? 'ar' : 'en';
  const image = body.image?.replace(/^data:image\/\w+;base64,/, '');
  // The camera/gallery path always sends JPEG (see photo.ts); a file picked
  // from Files/iCloud Drive keeps its real format and says so explicitly.
  // Anything outside Claude's supported set is rejected here rather than
  // sent on to get an opaque failure back.
  const mediaType = SUPPORTED_IMAGE_MEDIA_TYPES.has(body.imageMediaType ?? '')
    ? (body.imageMediaType as SupportedImageMediaType)
    : 'image/jpeg';
  // Anthropic rejects any single image over 5 MB of decoded bytes; base64
  // inflates by 4/3, so ~6.6 MB of text is the real ceiling. Newer clients
  // downscale before sending; an older build's raw upload is refused here
  // with a code the app can explain rather than after a paid failed call.
  if (image && image.length >= 100 && image.length <= 6_600_000) {
    return { image, mediaType, language };
  }
  const pdf = body.pdf?.replace(/^data:application\/pdf;base64,/, '');
  // Anthropic's own cap is far higher (32 MB / 100 pages) — a scan report is
  // a page or two, so this stays generous without accepting something absurd.
  if (pdf && pdf.length >= 100 && pdf.length <= 20 * 1024 * 1024) {
    return { pdf, language };
  }
  return null;
}

/**
 * Read an uploaded report — a photo or a PDF — with whichever provider the
 * caller's tier is on.
 *
 * The one asymmetry: our DeepSeek client sends images only, so a PDF always
 * goes to Claude regardless of the tier setting. That is a limit of the wire
 * format we speak, not a judgement about DeepSeek's accuracy — a real
 * Arabic InBody printout came back field-for-field identical to Claude's
 * read in the admin report test, which is why this route moved here at all.
 * Photos are the common case (people snap the printout at the gym), so in
 * practice this leaves only the occasional emailed PDF on Claude.
 */
async function readDocument(
  parsed: { image: string; mediaType: SupportedImageMediaType } | { pdf: string },
  prompt: string,
  provider: AiProvider,
  track: Track,
): Promise<unknown> {
  if ('pdf' in parsed) return analyzeDocument(parsed.pdf, prompt, MODEL, track);
  if (provider === 'deepseek') {
    const ds = await withOneRetry(() => deepseekVisionCall(parsed.image, prompt, 8000));
    await trackUsage(track, ds.model, { input_tokens: ds.inputTokens, output_tokens: ds.outputTokens });
    return extractJson(ds.text);
  }
  return analyze(parsed.image, prompt, MODEL, parsed.mediaType, track);
}

app.post('/api/analyze-body-reading', async (c) => {
  const parsed = parseBodyReadingBody(await c.req.json<BodyReadingBody>().catch(() => ({})));
  if (!parsed) return c.json({ error: 'invalid_request' }, 400);
  const ref = (await callerRef(c))!;
  const access = await checkAccess(ref, 'bodyReading');
  if (!access.featureAllowed) return c.json(featureLocked(access), 403);
  const claim = await reserve(ref, access, 'bodyReading');
  if (!claim.ok) return c.json(quotaError(access), 402);
  try {
    const prompt = bodyReadingPrompt(parsed.language);
    const track = { ref, kind: 'bodyReading' };
    const raw = await readDocument(parsed, prompt, await providerFor(access), track);
    const result = toBodyReadingAnalysis(raw);
    if (!result) {
      // A legitimate 200 from the model (unreadable photo, or a QR/barcode
      // screen instead of the actual results printout) — not a thrown
      // error, so it must be released here too, or a bad photo silently
      // costs the user a real quota action for nothing.
      await release(ref, 'bodyReading');
      return c.json({ error: 'no_reading_detected' }, 422);
    }
    return c.json(result);
  } catch (err) {
    console.error('analyze-body-reading failed:', err);
    await release(ref, 'bodyReading');
    return aiFailure(c, err, 'analysis_failed');
  }
});

app.post('/api/analyze-text', async (c) => {
  const body = await c.req.json<{ text?: string; language?: string }>().catch(() => ({}) as never);
  const text = (body.text ?? '').trim().slice(0, 500);
  if (text.length < 3) return c.json({ error: 'invalid_request' }, 400);
  const language: Language = body.language === 'ar' ? 'ar' : 'en';
  const ref = (await callerRef(c))!;
  const access = await checkAccess(ref, 'describe');
  const claim = await reserve(ref, access, 'describe');
  if (!claim.ok) return c.json(quotaError(access), 402);
  try {
    if ((await providerFor(access)) === 'deepseek') {
      // No web search on this path — a branded/restaurant item gets
      // DeepSeek's own knowledge of it rather than a live menu lookup.
      // Parsed inside the retry, so a malformed answer gets the second try too.
      const result = await withOneRetry(async (attempt) => {
        const ds = await deepseekTextCall(textMealPrompt(language, text, { canSearch: false }) + (attempt ? JSON_ONLY_REMINDER : ''), dsBudget(attempt, 4000));
        await trackUsage({ ref, kind: 'describe' }, ds.model, { input_tokens: ds.inputTokens, output_tokens: ds.outputTokens });
        return toMealAnalysis(ds.text);
      });
      return c.json(result);
    }
    const request = {
      model: access.spec.highAccuracy ? PREMIUM_MODEL : MEAL_MODEL,
      // A described meal can list several dishes, and an Arabic answer costs
      // roughly twice the tokens of the same answer in English — 1000 was
      // close enough to the ceiling that a four-dish Arabic meal came back
      // truncated, and therefore unparseable. Higher still now that a
      // restaurant lookup can add a search-and-reason turn before the answer.
      max_tokens: 3000,
      messages: [{ role: 'user' as const, content: textMealPrompt(language, text) }],
    };
    return c.json(await mealWithSearch(request, ref, 'analyze-text', textMealPrompt(language, text)));
  } catch (err) {
    // The text is logged (trimmed) because the failures worth fixing here are
    // all about what the user wrote, and they are invisible otherwise.
    console.error(`analyze-text failed for "${text.slice(0, 120)}":`, err);
    await release(ref, 'describe');
    return aiFailure(c, err, 'analysis_failed');
  }
});

/** Loose validation for the client's current on-screen items — the model
 * revalidates its own output through toMealAnalysis regardless, so this only
 * needs to guard against garbage, not fully re-derive the FoodItem shape. */
function parseRefineItems(raw: unknown): FoodItem[] {
  if (!Array.isArray(raw)) return [];
  const items: FoodItem[] = [];
  for (const entry of raw) {
    const it = entry as Record<string, unknown>;
    if (typeof it?.name !== 'string' || !it.name.trim()) continue;
    items.push({
      name: it.name,
      portion: typeof it.portion === 'string' ? it.portion : '1',
      calories: Number(it.calories) || 0,
      proteinG: Number(it.proteinG) || 0,
      carbsG: Number(it.carbsG) || 0,
      fatG: Number(it.fatG) || 0,
    });
  }
  return items;
}

app.post('/api/refine-meal', async (c) => {
  const body = await c.req
    .json<{ items?: unknown; message?: string; language?: string }>()
    .catch(() => ({}) as never);
  const message = (body.message ?? '').trim().slice(0, 500);
  const items = parseRefineItems(body.items);
  if (message.length < 2 || items.length === 0) return c.json({ error: 'invalid_request' }, 400);
  const language: Language = body.language === 'ar' ? 'ar' : 'en';
  const ref = (await callerRef(c))!;
  const access = await checkAccess(ref, 'describe');
  const claim = await reserve(ref, access, 'describe');
  if (!claim.ok) return c.json(quotaError(access), 402);
  try {
    if ((await providerFor(access)) === 'deepseek') {
      // Parsed inside the retry, so a malformed answer gets the second try too.
      const result = await withOneRetry(async (attempt) => {
        const ds = await deepseekTextCall(refineMealPrompt(language, items, message, { canSearch: false }) + (attempt ? JSON_ONLY_REMINDER : ''), dsBudget(attempt, 4000));
        await trackUsage({ ref, kind: 'describe' }, ds.model, { input_tokens: ds.inputTokens, output_tokens: ds.outputTokens });
        return toMealAnalysis(ds.text);
      });
      return c.json(result);
    }
    const request = {
      model: access.spec.highAccuracy ? PREMIUM_MODEL : MEAL_MODEL,
      max_tokens: 3000,
      messages: [{ role: 'user' as const, content: refineMealPrompt(language, items, message) }],
    };
    return c.json(await mealWithSearch(request, ref, 'refine-meal', refineMealPrompt(language, items, message)));
  } catch (err) {
    console.error(`refine-meal failed for "${message.slice(0, 120)}":`, err);
    await release(ref, 'describe');
    return aiFailure(c, err, 'analysis_failed');
  }
});

app.post('/api/analyze-exercise', async (c) => {
  const body = await c.req.json<{ name?: string; language?: string }>().catch(() => ({}) as never);
  const name = (body.name ?? '').trim().slice(0, 120);
  if (name.length < 2) return c.json({ error: 'invalid_request' }, 400);
  const language: Language = body.language === 'ar' ? 'ar' : 'en';
  const ref = (await callerRef(c))!;
  // Gated as equipment, metered as its own kind — so pass the kind too, or the
  // quota check would price this against the wrong route's weight.
  const access = await checkAccess(ref, 'equipment', 'exercise');
  if (!access.featureAllowed) return c.json(featureLocked(access), 403);
  const claim = await reserve(ref, access, 'exercise');
  if (!claim.ok) return c.json(quotaError(access), 402);
  try {
    const prompt = exerciseInfoPrompt(language, name);
    if ((await providerFor(access)) === 'deepseek') {
      // Same reasoning-token budget issue as the meal call (see there) —
      // 600 was tight enough that this used to lose to the Claude fallback
      // on most real requests.
      const ds = await withOneRetry((attempt) => deepseekTextCall(prompt, dsBudget(attempt, 4000)));
      await trackUsage({ ref, kind: 'exercise' }, ds.model, {
        input_tokens: ds.inputTokens,
        output_tokens: ds.outputTokens,
      });
      return c.json(extractJson(ds.text));
    }
    const result = await textCall(prompt, 600, { ref, kind: 'exercise' });
    return c.json(result);
  } catch (err) {
    console.error('analyze-exercise failed:', err);
    await release(ref, 'exercise');
    return aiFailure(c, err, 'analysis_failed');
  }
});

interface CoachBody {
  messages?: { role?: string; content?: string }[];
  language?: string;
  /** Compact snapshot of the caller's own logs (profile, targets, recent days). */
  context?: unknown;
}

/**
 * Serialize the app-supplied context for the system prompt. Capped so a
 * malformed or oversized payload can never blow up the token bill.
 */
function contextText(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  try {
    const json = JSON.stringify(raw);
    // Room for two days of diary entries (recentMeals) on top of the summary.
    if (json.length > 9000) return undefined;
    return json;
  } catch {
    return undefined;
  }
}

app.post('/api/coach', async (c) => {
  const body = await c.req.json<CoachBody>().catch(() => ({}) as CoachBody);
  const language: Language = body.language === 'ar' ? 'ar' : 'en';
  const messages = (body.messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content!.slice(0, 2000) }));
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const ref = (await callerRef(c))!;
  const access = await checkAccess(ref, 'coach');
  if (!access.spec.coach) return c.json(featureLocked(access), 403);
  const claim = await reserve(ref, access, 'coach');
  // 'cap' means the coach ration is spent while the plan still has actions
  // left, which the app shows as a coach-specific upsell rather than a wall.
  if (!claim.ok) {
    return claim.reason === 'cap'
      ? c.json(featureLocked(access), 403)
      : c.json(quotaError(access), 402);
  }
  try {
    const system = coachSystemPrompt(language, contextText(body.context)) + coachScopeNote(access);
    const tools = coachToolsFor(access);
    if ((await providerForContext(access, body.context)) === 'deepseek') {
      // OpenAI-shaped: the system prompt is the first message rather than a
      // separate field, and the schedule tool stays optional (tool_choice
      // auto) because most coach messages are just conversation.
      const ds = await withOneRetry(() =>
        deepseekToolCall(
          [{ role: 'system', content: system }, ...messages],
          tools.map(toDeepseekTool),
          6000,
        ),
      );
      await trackUsage({ ref, kind: 'coach' }, ds.model, {
        input_tokens: ds.inputTokens,
        output_tokens: ds.outputTokens,
      });
      const call = ds.toolCalls.find((t) => t.name === 'propose_weekly_schedule');
      const plan = call ? sanitizeSchedulePlan(call.args) : undefined;
      const recipeCall = ds.toolCalls.find((t) => t.name === 'write_recipe');
      const recipeDraft = recipeCall ? sanitizeRecipe(recipeCall.args) : undefined;
      const { actions, suggestions } = sanitizeCoachActions(ds.toolCalls);
      // A tool-only reply has no prose; the app shows the card alone, but a
      // blank bubble above it reads as a glitch, so borrow the plan's own
      // one-line summary the way the Claude path's fallbackIntro does.
      const reply = ds.text || (plan ? (plan.summary ?? '') : recipeDraft ? recipeDraft.name : (actions[0]?.note ?? ''));
      return c.json({ reply, schedulePlan: plan, recipeDraft, actions, suggestions });
    }
    const response = await anthropic.messages.create({
      model: MODEL,
      // A plain reply fits easily in 500, but a full week's worth of days and
      // exercises inside the propose_weekly_schedule tool call does not.
      max_tokens: 2000,
      system,
      messages,
      tools,
    });
    await trackUsage({ ref, kind: 'coach' }, MODEL, response.usage);
    const reply = replyText(response);
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'propose_weekly_schedule',
    );
    const schedulePlan: CoachSchedulePlan | undefined = toolUse
      ? sanitizeSchedulePlan(toolUse.input)
      : undefined;
    // A recipe the coach wrote is returned as a draft only; the app saves it
    // as Needs review and never plans or logs it on its own (S18).
    const recipeUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'write_recipe',
    );
    const recipeDraft = recipeUse ? sanitizeRecipe(recipeUse.input) : undefined;
    // Proposed edits and follow-up chips: cards the app applies only on a tap.
    const { actions, suggestions } = sanitizeCoachActions(
      response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use').map((b) => ({ name: b.name, args: b.input })),
    );
    return c.json({ reply: reply || actions[0]?.note || '', schedulePlan, recipeDraft, actions, suggestions });
  } catch (err) {
    console.error('coach failed:', err);
    await release(ref, 'coach');
    return aiFailure(c, err, 'coach_failed');
  }
});

/** The coach's tools for this member (see scopeCoachTools). */
function coachToolsFor(access: Access): Anthropic.Tool[] {
  return scopeCoachTools([SCHEDULE_TOOL, RECIPE_TOOL, ...ACTION_TOOLS], access);
}

interface CoachAttachmentBody {
  image?: string;
  imageMediaType?: string;
  pdf?: string;
  language?: string;
}

/** Reads an uploaded document (photo or PDF) and turns it into the compact
 * reference summary the coach carries into future conversations — reuses
 * the same access/quota ration as `/api/coach` since it's the same coach
 * feature, not a separate billable action. */
app.post('/api/coach-attachment', async (c) => {
  const parsed = parseBodyReadingBody(await c.req.json<CoachAttachmentBody>().catch(() => ({})));
  if (!parsed) return c.json({ error: 'invalid_request' }, 400);
  const ref = (await callerRef(c))!;
  // Documents the coach keeps as memory are a Pro+ feature once locks are on.
  const access = await checkAccess(ref, 'coachDocs', 'coach');
  if (!access.featureAllowed) return c.json(featureLocked(access), 403);
  const claim = await reserve(ref, access, 'coach');
  if (!claim.ok) {
    return claim.reason === 'cap'
      ? c.json(featureLocked(access), 403)
      : c.json(quotaError(access), 402);
  }
  try {
    const prompt = coachAttachmentSummaryPrompt(parsed.language);
    // Same document-reading job as a body reading, and the same one
    // asymmetry: a PDF goes to Claude because our DeepSeek client sends
    // images. Unlike that route this wants prose back, not JSON.
    if (!('pdf' in parsed) && (await providerFor(access)) === 'deepseek') {
      const ds = await withOneRetry(() => deepseekVisionCall(parsed.image, prompt, 4000));
      await trackUsage({ ref, kind: 'coach' }, ds.model, {
        input_tokens: ds.inputTokens,
        output_tokens: ds.outputTokens,
      });
      return c.json({ summary: ds.text.trim() });
    }
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: [
            'pdf' in parsed
              ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: parsed.pdf } }
              : { type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.image } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });
    await trackUsage({ ref, kind: 'coach' }, MODEL, response.usage);
    return c.json({ summary: replyText(response).trim() });
  } catch (err) {
    console.error('coach-attachment failed:', err);
    await release(ref, 'coach');
    return aiFailure(c, err, 'analysis_failed');
  }
});

interface ProgramBody {
  language?: string;
  context?: unknown;
  /** The questions answered before building; absent from older app builds. */
  answers?: unknown;
}

interface TailorBody {
  language?: string;
  context?: unknown;
  answers?: unknown;
  /** The draft as the app holds it now. */
  program?: unknown;
  /** What they asked for. */
  request?: string;
  /** The chat so far on this draft, oldest first. */
  history?: { role?: string; text?: string }[];
  draftId?: string;
}

/** Free changes a new program draft comes with — paid for by the build. */
const FREE_TAILOR_CHANGES = 2;

/**
 * One forced tool call on whichever provider this caller is on, metered
 * under `kind`. Returns the tool's raw input (or JSON found in prose), for
 * the caller to validate.
 */
async function programToolCall(opts: {
  route: string;
  access: Access;
  context: unknown;
  ref: string;
  kind: string;
  system: string;
  user: string;
  tool: Anthropic.Tool;
  claudeTokens: number;
  deepseekTokens: number;
}): Promise<unknown> {
  const { route, access, context, ref, kind, system, user, tool } = opts;
  return withProviderFallback(route, await providerForContext(access, context), {
    deepseek: async () => {
      // On a reasoning model the chain-of-thought shares the budget with the
      // answer, so DeepSeek gets far more headroom than Claude.
      const ds = await withOneRetry(() =>
        deepseekToolCall(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          [toDeepseekTool(tool)],
          opts.deepseekTokens,
          tool.name,
        ),
      );
      await trackUsage({ ref, kind }, ds.model, { input_tokens: ds.inputTokens, output_tokens: ds.outputTokens });
      const call = ds.toolCalls.find((t) => t.name === tool.name);
      // Belt and braces: a model that ignores tool_choice and just writes the
      // JSON as prose still produces something usable.
      return call ? call.args : extractJson(ds.text);
    },
    claude: async () => {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: opts.claudeTokens,
        system,
        messages: [{ role: 'user', content: user }],
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
      });
      await trackUsage({ ref, kind }, MODEL, response.usage);
      const toolUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === tool.name,
      );
      return toolUse?.input;
    },
  }, undefined, { fallback: !hasWearableData(context) });
}

/**
 * Hold a program to the answers: the chosen days, and no meal naming an
 * allergen (or meat, for a vegetarian). A meal that breaks the rules is sent
 * back once to be replaced; if the replacement breaks them too, the meal is
 * dropped rather than shown.
 */
async function enforceAnswers(
  program: ProgramPlan,
  answers: PlanAnswers,
  call: (request: string, program: ProgramPlan) => Promise<unknown>,
): Promise<ProgramPlan> {
  let out = fitProgram(program, answers);
  const bad = mealViolations(out.mealPlan, answers);
  if (bad.length > 0) {
    try {
      const rev = sanitizeRevision(await call(violationsRequest(bad), out));
      if (rev?.mealPlanDays) out = fitProgram(applyRevision(out, { ...rev, schedule: undefined, targets: undefined }), answers);
    } catch (err) {
      console.warn('allergen repair failed:', err instanceof Error ? err.message : err);
    }
  }
  return { ...out, mealPlan: stripViolations(out.mealPlan, answers) };
}

interface RecipeBody {
  request?: string;
  language?: string;
  context?: unknown;
}

/**
 * One cookable recipe. Costs more than a meal scan and less than a programme,
 * so it is metered as its own kind (see DEFAULT_ACTION_WEIGHTS).
 */
app.post('/api/generate-recipe', async (c) => {
  const body = await c.req.json<RecipeBody>().catch(() => ({}) as RecipeBody);
  const language: Language = body.language === 'ar' ? 'ar' : 'en';
  const request = (body.request ?? '').trim().slice(0, 300);
  if (request.length < 2) return c.json({ error: 'invalid_request' }, 400);
  const ref = (await callerRef(c))!;
  const access = await checkAccess(ref, 'recipe');
  if (!access.featureAllowed) return c.json(featureLocked(access), 403);
  const claim = await reserve(ref, access, 'recipe');
  if (!claim.ok) return c.json(quotaError(access), 402);
  const system = recipePrompt(language, request, contextText(body.context));
  try {
    const recipe = await withProviderFallback('/api/generate-recipe', await providerForContext(access, body.context), {
      deepseek: async () => {
        const ds = await withOneRetry(() =>
          deepseekToolCall(
            [
              { role: 'system', content: system },
              { role: 'user', content: request },
            ],
            [toDeepseekTool(RECIPE_TOOL)],
            8000,
            'write_recipe',
          ),
        );
        await trackUsage({ ref, kind: 'recipe' }, ds.model, {
          input_tokens: ds.inputTokens,
          output_tokens: ds.outputTokens,
        });
        const call = ds.toolCalls.find((t) => t.name === 'write_recipe');
        // Same belt and braces as the programme route: a model that writes the
        // JSON as prose instead of calling the tool still gives a usable recipe.
        return sanitizeRecipe(call ? call.args : extractJson(ds.text));
      },
      claude: async () => {
        const response = await anthropic.messages.create({
          model: MODEL,
          // Up to 20 ingredients with four macros each plus 15 steps; cut off
          // mid-JSON and the whole tool call is unusable.
          max_tokens: 4000,
          system,
          messages: [{ role: 'user', content: request }],
          tools: [RECIPE_TOOL],
          tool_choice: { type: 'tool', name: 'write_recipe' },
        });
        await trackUsage({ ref, kind: 'recipe' }, MODEL, response.usage);
        const toolUse = response.content.find(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'write_recipe',
        );
        return toolUse ? sanitizeRecipe(toolUse.input) : undefined;
      },
    }, undefined, { fallback: !hasWearableData(body.context) });
    if (!recipe) {
      await release(ref, 'recipe');
      return c.json({ error: 'analysis_failed' }, 502);
    }
    return c.json(recipe);
  } catch (err) {
    console.error('generate-recipe failed:', err);
    await release(ref, 'recipe');
    return aiFailure(c, err, 'analysis_failed');
  }
});

app.post('/api/generate-program', async (c) => {
  const body = await c.req.json<ProgramBody>().catch(() => ({}) as ProgramBody);
  const language: Language = body.language === 'ar' ? 'ar' : 'en';
  const answers = sanitizeAnswers(body.answers);
  const scope: PlanScope = answers?.scope ?? 'both';
  const ref = (await callerRef(c))!;
  const access = await checkAccess(ref, 'program');
  if (!access.featureAllowed) return c.json(featureLocked(access), 403);
  const claim = await reserve(ref, access, 'program');
  // 'cap' is the month's programme designs used up, not the allowance.
  if (!claim.ok) return claim.reason === 'cap' ? c.json(featureLocked(access), 403) : c.json(quotaError(access), 402);
  const context = contextText(body.context);
  const system = programPrompt(language, context, answers);
  try {
    const raw = await programToolCall({
      route: '/api/generate-program',
      access,
      context: body.context,
      ref,
      kind: 'program',
      system,
      user: 'Design my program.',
      tool: programTool(scope),
      // A full week's schedule AND a full week of named meals with macros
      // alongside targets and a real summary — a 7-day meal plan alone is
      // ~4k tokens of tool JSON. Cut off mid-JSON and the call is unusable.
      claudeTokens: scope === 'training' ? 4000 : 10000,
      deepseekTokens: 20000,
    });
    let program = sanitizeProgram(raw, scope);
    if (program && answers) {
      program = await enforceAnswers(program, answers, (request, current) =>
        programToolCall({
          route: '/api/generate-program',
          access,
          context: body.context,
          ref,
          kind: 'program',
          system: tailorPrompt(language, JSON.stringify(current), answers),
          user: request,
          tool: REVISE_TOOL,
          claudeTokens: 6000,
          deepseekTokens: 12000,
        }),
      );
      if (scope === 'food' && !program.mealPlan) program = undefined;
    }
    if (!program) {
      await release(ref, 'program');
      return c.json({ error: 'analysis_failed' }, 502);
    }
    // The draft's two free changes are remembered here, not trusted from the app.
    const draftId = crypto.randomUUID();
    await createProgramDraft(draftId, ref, FREE_TAILOR_CHANGES).catch((err) => console.warn('draft record failed:', err));
    return c.json({ ...program, draftId, freeChanges: FREE_TAILOR_CHANGES });
  } catch (err) {
    console.error('generate-program failed:', err);
    await release(ref, 'program');
    return aiFailure(c, err, 'analysis_failed');
  }
});

/**
 * Tailor a draft program in conversation. The first two changes to a draft
 * are covered by its build; after that each costs one action. A reply that
 * changes nothing (a question answered) costs nothing.
 */
app.post('/api/tailor-program', async (c) => {
  const body = await c.req.json<TailorBody>().catch(() => ({}) as TailorBody);
  const language: Language = body.language === 'ar' ? 'ar' : 'en';
  const request = (body.request ?? '').trim().slice(0, 500);
  if (request.length < 2) return c.json({ error: 'invalid_request' }, 400);
  const answers = sanitizeAnswers(body.answers);
  const scope: PlanScope = answers?.scope ?? 'both';
  const program = sanitizeProgram(body.program, scope);
  if (!program) return c.json({ error: 'invalid_request' }, 400);
  const ref = (await callerRef(c))!;
  const access = await checkAccess(ref, 'program', 'tailor');
  if (!access.featureAllowed) return c.json(featureLocked(access), 403);

  const draftId = typeof body.draftId === 'string' ? body.draftId.slice(0, 64) : '';
  // Only a draft this caller really built can be tailored: otherwise a
  // hand-made "program" could be redesigned whole at a change's price.
  const take = draftId ? await takeFreeChange(draftId, ref) : null;
  if (!take) return c.json({ error: 'no_draft' }, 404);
  const free = take.free;
  if (!free) {
    const claim = await reserve(ref, access, 'tailor');
    if (!claim.ok) return c.json(quotaError(access), 402);
  }
  const refund = async () => {
    if (free) await returnFreeChange(draftId, ref).catch(() => {});
    else await release(ref, 'tailor');
  };

  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-6)
    .map((m) => `${m?.role === 'assistant' ? 'Coach' : 'Them'}: ${String(m?.text ?? '').slice(0, 400)}`)
    .join('\n');
  const call = (user: string, current: ProgramPlan, withHistory: boolean) =>
    programToolCall({
      route: '/api/tailor-program',
      access,
      context: body.context,
      ref,
      kind: 'tailor',
      system:
        tailorPrompt(language, JSON.stringify(current), answers, contextText(body.context)) +
        (withHistory && history ? `\n\nEarlier in this chat:\n${history}` : ''),
      user,
      tool: REVISE_TOOL,
      claudeTokens: 6000,
      deepseekTokens: 12000,
    });
  try {
    const rev = sanitizeRevision(await call(request, program, true));
    if (!rev) {
      await refund();
      return c.json({ error: 'analysis_failed' }, 502);
    }
    // Moving training days in the chat changes the chosen days from then on.
    const nextAnswers: PlanAnswers | undefined =
      answers && rev.weekdays && scope !== 'food' ? { ...answers, weekdays: rev.weekdays, days: rev.weekdays.length } : answers;
    let next = applyRevision(program, rev);
    if (nextAnswers) next = await enforceAnswers(next, nextAnswers, (req, current) => call(req, current, false));
    const changed = rev.changes.length > 0 || JSON.stringify(next) !== JSON.stringify(program);
    if (!changed) await refund();
    const left = free ? take.left : 0;
    return c.json({
      program: next,
      answers: nextAnswers ?? null,
      reply: rev.reply,
      changes: rev.changes,
      // What this change cost: nothing (free or no change) or one action.
      charged: changed && !free,
      freeLeft: changed ? left : free ? left + 1 : left,
    });
  } catch (err) {
    console.error('tailor-program failed:', err);
    await refund();
    return aiFailure(c, err, 'analysis_failed');
  }
});

/**
 * The app's entitlement check: current plan, remaining AI actions, and the
 * sponsor slot to display. Safe to call often; cheap.
 */
app.get('/api/me', async (c) => {
  const ref = await callerRef(c);
  const access = await checkAccess(ref, 'meal');
  const user = ref ? await getOrCreateUser(ref) : null;
  const sponsor = await getSetting<Record<string, unknown> | null>('sponsor', null);
  const [prices, limits, weights] = await Promise.all([
    planPrices(),
    planLimits(),
    actionWeights(),
  ]);
  const [coachUsed, programUsed] = ref
    ? await Promise.all([
        typeof access.spec.coachCap === 'number' ? getUsageKind(ref, 'coach', access.period) : 0,
        access.spec.programs !== null ? getUsageKind(ref, 'program', access.period) : 0,
      ])
    : [0, 0];
  const programWeight = weights.program ?? 1;
  const usage = ref ? await getUsageByKind(ref, access.period) : {};
  // When an Essentials member may next switch module (null = any time).
  const nextChange =
    access.plan === 'essentials' && user?.module && user.moduleSetAt
      ? new Date(new Date(user.moduleSetAt).getTime() + MODULE_CHANGE_DAYS * 86400000)
      : null;
  // The app sends this on every launch — guest or signed-in — so it is the
  // one place a device gets recorded for every account the admin table shows,
  // not only the ones that reach a sign-in screen. Best-effort: a failed
  // write here must never break the entitlement fetch every screen relies on.
  const device = (c.req.query('device') ?? '').trim().slice(0, 80);
  if (ref && device) await setUserDevice(ref, device).catch(() => {});
  return c.json({
    plan: access.plan,
    used: access.used,
    limit: access.limit,
    remaining: Math.max(0, access.limit - access.used),
    period: access.period,
    // What this plan unlocks, so the app can gate its UI consistently.
    features: {
      coach: access.spec.coach,
      equipment: access.spec.equipment,
      highAccuracy: access.spec.highAccuracy,
      coachCap: access.spec.coachCap ?? null,
      coachUsed,
      coachDocs: access.spec.coachDocs,
      // Programme designs a month (null = no separate cap) and how many are used.
      programs: access.spec.programs,
      programsUsed: Math.floor(programUsed / Math.max(1, programWeight)),
    },
    // Plan locks on: the app locks what the plan doesn't include. Off: every
    // feature stays open, as before plans had features of their own.
    locks: access.locks,
    trial: access.trial,
    // Essentials' module ('food' | 'training'; null until chosen), whether the
    // plan covers everything, and when the module may next change.
    module: access.module,
    scope: access.spec.scope,
    moduleNextChange: nextChange && nextChange.getTime() > Date.now() ? nextChange.toISOString() : null,
    // When the current store period (or trial) ends, for "Trial ends 12 Oct".
    planUntil: user?.storePlan?.plan === access.plan ? (user.storePlan.until ?? null) : null,
    // This month's AI use by kind, in actions, for the usage breakdown.
    usage,
    // What the upgrade screen should show. Editable from the admin page so
    // a price change doesn't need an app release — but note it only changes
    // the DISPLAY: the amount actually charged comes from the store product.
    pricing: {
      ...prices,
      limits,
      coachCap: PLANS.free.coachCap ?? null,
      trialLimit: await trialLimit(),
    },
    // What each action costs against the allowance, so the app can say "this
    // uses 5 of your credits" before spending them rather than after.
    weights,
    sponsor,
    // The store SDK's public keys. Served rather than baked into the app so
    // subscriptions switch on by setting two variables on the server, with
    // no release. Public by design (RevenueCat's "public app-specific" keys);
    // the secret key never leaves this server.
    billing: {
      iosKey: process.env.REVENUECAT_IOS_KEY || null,
      androidKey: process.env.REVENUECAT_ANDROID_KEY || null,
    },
    // How long a promo gift has left, so the app can say so.
    promo: user?.promo ?? null,
  });
});

/**
 * Choose the Essentials module (Food or Training). Sent before an Essentials
 * purchase so the plan knows its module the moment it arrives, and from
 * Profile to switch — which an Essentials member may do once every 30 days.
 */
app.post('/api/module', async (c) => {
  const ref = await callerRef(c);
  if (!ref) return c.json({ error: 'identify_required' }, 400);
  const body = await c.req.json<{ module?: string }>().catch(() => ({}) as { module?: string });
  if (body.module !== 'food' && body.module !== 'training') return c.json({ error: 'invalid_request' }, 400);
  const out = await setUserModule(ref, body.module);
  if (!out.ok) return c.json({ error: 'module_locked', nextChange: out.nextChange }, 409);
  return c.json({ ok: true, module: body.module });
});

/**
 * Claim a guest install for a signed-in account. The app calls this once, right
 * after sign-in, so the month's usage and any granted plan follow the person
 * instead of starting over. Install ids are unguessable and each one can only
 * ever be claimed once, so this is not a route to another user's plan.
 */
app.post('/api/link', async (c) => {
  const to = await callerRef(c);
  const body = await c.req.json<{ from?: string }>().catch(() => ({}) as { from?: string });
  const from = validRef(body.from ?? '');
  if (!to || !from) return c.json({ error: 'invalid_request' }, 400);
  try {
    // 'taken' is settled, not an error: that id already belongs to an account
    // and retrying will never change it, so the app should stop asking.
    const result = await linkRefs(from, to);
    return c.json({ ok: true, result });
  } catch (err) {
    console.error('link failed:', err);
    return c.json({ error: 'link_failed' }, 500);
  }
});

/**
 * Subscription webhook (RevenueCat). The store tells RevenueCat, RevenueCat
 * tells us, and the plan the app already reads from /api/me changes — no other
 * part of the billing model moves.
 *
 * Always answers 200 for events we understand but choose not to act on: a
 * non-2xx makes RevenueCat retry forever over something that will never
 * succeed. Genuine failures do return 500, because those deserve a retry.
 */
/**
 * Redeem a promotion code.
 *
 * A free code applies straight away and the reply carries the new
 * entitlement, so the app can show the tier without a second round trip. A
 * percent code returns the store offer to present; the discount itself is
 * the store's to apply, and only the store's webhook can say a paid
 * subscription started.
 */
app.post('/api/redeem', async (c) => {
  const ref = await callerRef(c);
  if (!ref) return c.json({ error: 'identify_required' }, 400);
  const body = await c.req.json<{ code?: string; platform?: string }>().catch(() => ({}) as never);
  const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : 'web';
  const result = await redeemPromo(String(body.code ?? ''), ref, platform);
  if (!result.ok) return c.json({ error: result.reason }, result.reason === 'unknown' ? 404 : 409);
  if (result.kind === 'free') {
    const access = await checkAccess(ref, 'coach');
    return c.json({
      ok: true,
      kind: 'free',
      code: result.code,
      plan: result.plan,
      until: result.until,
      entitlement: { plan: access.plan, used: access.used, limit: access.limit, period: access.period },
    });
  }
  const { ok: _ok, ...offer } = result;
  return c.json({ ok: true, ...offer });
});

/** Look a code up without spending it — lets the app validate as it is typed. */
app.get('/api/promo/:code', async (c) => {
  const code = normalizeCode(c.req.param('code'));
  const row = code.length >= 3 ? await getPromo(code) : null;
  if (!row) return c.json({ error: 'unknown' }, 404);
  const problem = codeProblem(row);
  if (problem) return c.json({ error: problem }, 409);
  return c.json({
    ok: true,
    code: row.code,
    kind: row.kind,
    plan: row.plan,
    percentOff: row.percentOff,
    durationDays: row.durationDays,
  });
});

/**
 * What RevenueCat says this app user id is entitled to right now — the
 * source of truth when an event alone can't say (see PRODUCT_CHANGE below).
 */
async function subscriberPlan(
  appUserId: string,
  key: string,
): Promise<{ ok: true; found: ReturnType<typeof planFromSubscriber> } | { ok: false; result: string }> {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { ok: false, result: `revenuecat_${res.status}` };
  return { ok: true, found: planFromSubscriber((await res.json()) as SubscriberRecord) };
}

app.post('/api/billing/revenuecat', async (c) => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  // Without a configured secret anyone could grant themselves Pro, so refuse
  // to accept billing events at all rather than trust them.
  if (!secret) return c.json({ error: 'billing_not_configured' }, 503);
  if ((c.req.header('authorization') ?? '') !== secret) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const body = await c.req.json<{ event?: RevenueCatEvent }>().catch(() => ({}) as never);
  const event = body?.event;
  if (!event) return c.json({ error: 'invalid_request' }, 400);

  try {
    // Retries are expected; only the first delivery of an event is applied.
    if (event.id && !(await claimBillingEvent(event.id, event.app_user_id ?? null, event.type ?? null))) {
      return c.json({ ok: true, result: 'duplicate' });
    }

    // Partner earnings follow the money rather than the plan, so they are
    // settled before `decide`, which ignores refunds and out-of-order events.
    // A failure here is logged and never blocks the plan change below.
    if (event.app_user_id) {
      const payer = await resolveRef(event.app_user_id);
      await recordPartnerEarnings(payer, event).catch((err) => console.error('partner earnings failed:', err));
    }

    // A product change names the old product, and a downgrade only takes
    // effect at renewal (an upgrade at once), so the event can't say what the
    // person has now. RevenueCat's own record can: apply that instead.
    const key = process.env.REVENUECAT_SECRET_KEY;
    if ((event.type ?? '').toUpperCase() === 'PRODUCT_CHANGE' && key && event.app_user_id && !event.app_user_id.startsWith('$RCAnonymousID:')) {
      const read = await subscriberPlan(event.app_user_id, key);
      if (read.ok) {
        const ref = await resolveRef(event.app_user_id);
        const found = read.found;
        if (found) await setUserPlan(ref, found.plan, found.trial ? 'revenuecat:product_change:trial' : 'revenuecat:product_change', found.until);
        return c.json({ ok: true, result: found ? 'resynced' : 'resynced_none', plan: found?.plan ?? null });
      }
    }

    const action = decide(event);
    if (action.kind === 'ignore') return c.json({ ok: true, result: 'ignored', reason: action.reason });

    // The id the app sends may since have been claimed by an account.
    const ref = await resolveRef(action.ref);
    const eventMs = Number(event.event_timestamp_ms ?? 0);
    if (!(await billingEventIsCurrent(ref, eventMs))) {
      return c.json({ ok: true, result: 'stale' });
    }

    if (action.kind === 'grant') {
      await setUserPlan(ref, action.plan, action.note, action.until);
      // A first purchase may have come from a discount code: mark it, so the
      // admin sees how many redemptions turned into paying customers.
      if ((event.type ?? '').toUpperCase() === 'INITIAL_PURCHASE') {
        const offer = event.offer_code ? normalizeCode(event.offer_code) : '';
        await recordPromoConversion(ref, offer || null).catch((err) =>
          console.error('promo conversion failed:', err),
        );
      }
    } else {
      await setUserPlan(ref, 'free', action.note, null);
    }
    await markBillingEventApplied(ref, eventMs);
    return c.json({ ok: true, result: action.kind, plan: action.kind === 'grant' ? action.plan : 'free' });
  } catch (err) {
    console.error('billing webhook failed:', err);
    return c.json({ error: 'webhook_failed' }, 500);
  }
});

/**
 * "I just paid": ask RevenueCat directly what this person is entitled to and
 * apply it now, so the plan changes as the store sheet closes rather than
 * whenever the webhook lands. The webhook stays the source of truth for
 * renewals, lapses and refunds; this only ever grants what RevenueCat itself
 * reports as active, for the caller's own id.
 */
app.post('/api/billing/sync', async (c) => {
  const header = validRef(c.req.header('x-calgym-user') ?? '');
  const ref = await callerRef(c);
  if (!header || !ref) return c.json({ error: 'identify_required' }, 400);
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) return c.json({ ok: false, result: 'not_configured' });
  try {
    // The store purchase is filed under the id the app configured with,
    // which is the raw header id; the plan goes to whoever that id now is —
    // but only when that id is really the caller's, never someone else's.
    const raw = await ownStoreId(header, ref, resolveRef);
    const read = await subscriberPlan(raw, key);
    if (!read.ok) return c.json({ ok: false, result: read.result });
    const found = read.found;
    if (found) await setUserPlan(ref, found.plan, found.trial ? 'revenuecat:sync:trial' : 'revenuecat:sync', found.until);
    const access = await checkAccess(ref, 'coach');
    return c.json({
      ok: true,
      result: found ? 'granted' : 'none',
      entitlement: { plan: access.plan, used: access.used, limit: access.limit, period: access.period },
    });
  } catch (err) {
    console.error('billing sync failed:', err);
    return c.json({ ok: false, result: 'sync_failed' });
  }
});

/**
 * Attach the signed-in account's address to its row, so the admin list shows
 * something recognisable next to an opaque id. Sent by the app because the
 * alternative — querying the auth provider — would mean keeping a
 * service-role key on this server for the sake of one column. Guests never
 * call it.
 */
/**
 * Which store country the app is served from and the currency its prices came
 * in, reported by the app after it loads the store's plans. Admin-only
 * information: where people are, and whether the store's prices match.
 */
app.post('/api/storefront', async (c) => {
  const ref = await callerRef(c);
  if (!ref) return c.json({ error: 'identify_required' }, 401);
  const body = await c.req.json<{ country?: string; currency?: string }>().catch(() => ({}) as never);
  const code = (v: unknown, len: number) => (typeof v === 'string' && /^[A-Za-z]{2,3}$/.test(v.trim()) ? v.trim().toUpperCase().slice(0, len) : null);
  try {
    await setUserStore(ref, code(body?.country, 3), code(body?.currency, 3));
    return c.json({ ok: true });
  } catch (err) {
    console.error('storefront failed:', err);
    return c.json({ error: 'storefront_failed' }, 500);
  }
});

app.post('/api/identify', async (c) => {
  const ref = await callerRef(c);
  if (!ref) return c.json({ error: 'identify_required' }, 401);
  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as never);
  // With a sign-in token the address comes from Supabase, not from the body.
  // Either way it is only a label for the admin list: plans given by email
  // look the address up in Supabase Auth (see /admin/api/plan).
  const token = bearerOf(c.req.header('authorization'));
  const verified = token ? await verifyAccessToken(token) : null;
  const email = (verified?.email ?? body?.email ?? '').trim().toLowerCase().slice(0, 200);
  if (!/^\S+@\S+\.\S+$/.test(email)) return c.json({ error: 'invalid_request' }, 400);
  try {
    await setUserEmail(ref, email);
    return c.json({ ok: true });
  } catch (err) {
    console.error('identify failed:', err);
    return c.json({ error: 'identify_failed' }, 500);
  }
});

/** Account deletion — required by both app stores. Irreversible. */
app.delete('/api/me', async (c) => {
  const raw = validRef(c.req.header('x-calgym-user') ?? '');
  if (!raw) return c.json({ error: 'invalid_request' }, 400);
  // A signed-in person also sends their sign-in token, so the account itself
  // can be deleted and not only the records attached to it — and the token,
  // not the header, decides whose account that is.
  const bearer = bearerOf(c.req.header('authorization'));
  try {
    const resolved = await resolveRef(raw);
    let target: string;
    let alsoThisInstall = false;
    if (bearer && supabaseAdminConfigured()) {
      const user = await verifyAccessToken(bearer);
      if (!user) return c.json({ error: 'account_delete_failed', account: 'invalid_token' }, 502);
      target = user.id;
      // This phone's own install id goes too, unless it belongs to someone else.
      alsoThisInstall = raw !== user.id && !isAccountRef(raw) && (resolved === raw || resolved === user.id);
    } else if (bearer) {
      // No Supabase keys to check with: the records follow the header as before.
      target = resolved;
    } else {
      // Without a sign-in only a plain guest install can be deleted: an
      // account, or an install linked to one, needs that account's token.
      if (isAccountRef(raw) || resolved !== raw) return c.json({ error: 'sign_in_required' }, 401);
      target = raw;
    }
    const account = await deleteAuthUser(bearer);
    if (account === 'not_configured') console.error('account deletion: SUPABASE_SERVICE_ROLE_KEY is not set; the sign-in account was left in place');
    if (account === 'failed' || account === 'invalid_token') {
      // Leave the records in place too, so the person can simply try again.
      return c.json({ error: 'account_delete_failed', account }, 502);
    }
    await revokeWhoopFor(target);
    await deleteUser(target);
    if (alsoThisInstall) {
      await revokeWhoopFor(raw);
      await deleteUser(raw);
    }
    return c.json({ ok: true, account });
  } catch (err) {
    console.error('delete account failed:', err);
    return c.json({ error: 'delete_failed' }, 500);
  }
});

app.get('/privacy', (c) => c.html(PRIVACY_HTML));
// A public page showing WHOOP how the integration looks and handles data
// (their app-approval form asks for a link to screenshots).
app.get('/whoop', (c) => c.html(WHOOP_INTEGRATION_HTML));
app.get('/whoop/img/:file', async (c) => {
  const shot = WHOOP_SHOTS.find((s) => s.file === c.req.param('file'));
  if (!shot) return c.notFound();
  const { readFile } = await import('node:fs/promises');
  const body = await readFile(new URL(`./assets/whoop/${shot.file}`, import.meta.url));
  return c.body(body, 200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
});
app.get('/terms', (c) => c.html(TERMS_HTML));
app.get('/support', (c) => c.html(SUPPORT_HTML));

// Account deletion without the app (Google Play requires a web page for it).
// Requests are few and human-reviewed; a small per-address cap keeps a
// script from filling the table.
const deletionHits = new Map<string, { n: number; since: number }>();
app.get('/account-deletion', (c) => c.html(accountDeletionHtml()));
app.post('/account-deletion', async (c) => {
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const email = String(form.email ?? '').trim().slice(0, 200);
  const note = String(form.note ?? '').trim().slice(0, 500) || null;
  // A filled hidden field is a bot; answer as if it worked.
  if (String(form.website ?? '')) return c.html(accountDeletionHtml('sent'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.html(accountDeletionHtml('invalid', email), 400);
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const hit = deletionHits.get(ip);
  if (hit && now - hit.since < 3600_000 && hit.n >= 5) return c.html(accountDeletionHtml('sent'));
  deletionHits.set(ip, hit && now - hit.since < 3600_000 ? { n: hit.n + 1, since: hit.since } : { n: 1, since: now });
  await addDeletionRequest(email, note);
  return c.html(accountDeletionHtml('sent'));
});

// ── WHOOP ─────────────────────────────────────────────────────────────────
// Connecting a wearable (see the growth playbook's wearable-sync entry).
// Only the auth round trip lives here; pulling recovery/strain/sleep data
// once connected is a separate, later step.

function whoopRedirectUri(c: { req: { header: (n: string) => string | undefined; url: string } }): string {
  return `${publicBase(c)}/api/whoop/callback`;
}

/** WHOOP's own `error` param (denial reasons, etc.) reaches here unvalidated. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * The app's return link as a JavaScript string literal, safe to place inside
 * <script>. The message can carry text from the request (WHOOP's `error`
 * param), so it is never spliced into the script by hand: JSON.stringify
 * quotes it, and every "<" is escaped so nothing can close the script tag.
 */
export function appReturnLink(ok: boolean, message: string): string {
  const link = `calapp://whoop-callback?status=${ok ? 'success' : 'error'}&reason=${encodeURIComponent(message)}`;
  return JSON.stringify(link).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** WHOOP's own denial code, cut down to what such a code can look like. */
export function whoopDenialText(raw: string): string {
  return raw.replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, 80) || 'unknown';
}

/** Small standalone confirmation page — this loads in a system browser tab, not inside the app. */
function whoopStatusPage(ok: boolean, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>WHOOP</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:#F5F3FA; color:#2A2440; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  @media (prefers-color-scheme: dark) { body { background:#17141F; color:#F2EFF8; } }
  .card { text-align:center; padding:32px; max-width:320px; }
  .icon { font-size:40px; margin-bottom:12px; }
  p { color:#6B6480; line-height:1.5; }
</style></head>
<body><div class="card">
  <div class="icon">${ok ? '✅' : '⚠️'}</div>
  <h2>${ok ? 'WHOOP connected' : 'Connection failed'}</h2>
  <p>${escapeHtml(message)}</p>
  <p>You can close this tab and return to Calgym.</p>
</div>
<script>
  // Only takes effect when this ran inside the app's in-app browser session,
  // which is watching for exactly this scheme to close itself automatically
  // the instant it sees this redirect — usually before a person can read the
  // text above, which is why the reason travels along with it instead.
  window.location.href = ${appReturnLink(ok, message)};
</script>
</body></html>`;
}

/**
 * One-use tickets for starting a WHOOP connection. The browser tab that goes
 * to WHOOP is a plain navigation that cannot carry the app's headers, so the
 * app asks for a ticket first (with its headers, so the server knows who it
 * is) and opens the link that ticket makes. Kept in memory: a ticket lives
 * ten minutes, and losing them on a restart only means tapping Connect again.
 */
const whoopTickets = new Map<string, { ref: string; until: number }>();

app.post('/api/whoop/start', async (c) => {
  const ref = await callerRef(c);
  if (!ref) return c.json({ error: 'identify_required' }, 401);
  if (!whoopConfigured()) return c.json({ error: 'not_configured' }, 503);
  const now = Date.now();
  for (const [k, v] of whoopTickets) if (v.until < now) whoopTickets.delete(k);
  const ticket = crypto.randomUUID();
  whoopTickets.set(ticket, { ref, until: now + 10 * 60_000 });
  return c.json({ url: `${publicBase(c)}/api/whoop/authorize?ticket=${ticket}` });
});

/** Step 1: send the user's browser to WHOOP's consent screen, for the person a ticket (or, from older builds, `ref`) names. */
app.get('/api/whoop/authorize', async (c) => {
  if (!whoopConfigured()) {
    return c.html(whoopStatusPage(false, 'WHOOP is not configured on the server yet.'), 503);
  }
  const ticket = c.req.query('ticket');
  if (ticket) {
    const held = whoopTickets.get(ticket);
    whoopTickets.delete(ticket);
    if (!held || held.until < Date.now()) {
      return c.html(whoopStatusPage(false, 'This link expired or was already used — try connecting again from the app.'), 400);
    }
    const state = crypto.randomUUID();
    await saveWhoopOAuthState(state, held.ref);
    return c.redirect(buildAuthorizeUrl(whoopRedirectUri(c), state), 302);
  }
  const ref = validRef(c.req.query('ref') ?? '');
  if (!ref) return c.html(whoopStatusPage(false, 'Missing or invalid user reference.'), 400);
  const resolved = await resolveRef(ref);
  // A bare ?ref= proves nothing: once sign-in proof is required it can only
  // start a connection for a plain guest install, never for an account.
  if (enforcingAccountToken() && (isAccountRef(ref) || resolved !== ref)) {
    return c.html(whoopStatusPage(false, 'Please update Calgym from the App Store, then connect WHOOP again.'), 400);
  }
  const state = crypto.randomUUID();
  await saveWhoopOAuthState(state, resolved);
  return c.redirect(buildAuthorizeUrl(whoopRedirectUri(c), state), 302);
});

/** Step 2: WHOOP redirects back here with a code (or an error/denial). */
app.get('/api/whoop/callback', async (c) => {
  const deniedReason = c.req.query('error');
  if (deniedReason) {
    return c.html(whoopStatusPage(false, `WHOOP said: ${whoopDenialText(deniedReason)}`));
  }
  const state = c.req.query('state') ?? '';
  const code = c.req.query('code') ?? '';
  const ref = state ? await consumeWhoopOAuthState(state) : null;
  if (!ref || !code) {
    return c.html(whoopStatusPage(false, 'This link expired or was already used — try connecting again from the app.'));
  }
  try {
    const tokens = await exchangeCodeForToken(code, whoopRedirectUri(c));
    await setWhoopConnection(ref, tokens);
    return c.html(whoopStatusPage(true, 'Recovery, strain and sleep can now be pulled into Calgym.'));
  } catch (err) {
    console.error('whoop token exchange failed:', err);
    // The confirmation page closes almost instantly inside the app's auth
    // session, so the detail travels in the redirect (see whoopStatusPage)
    // rather than relying on anyone reading it here.
    const detail = err instanceof Error ? err.message.slice(0, 300) : 'unknown error';
    return c.html(whoopStatusPage(false, `Something went wrong talking to WHOOP: ${detail}`));
  }
});

/**
 * Whether WHOOP is usable right now, not just whether a connection row
 * exists. A row with a dead access token and no refresh_token to renew it
 * (see setWhoopConnection's comment — WHOOP doesn't always reissue one) is
 * not meaningfully "connected": nothing can actually be pulled with it, so
 * the app should prompt reconnecting instead of showing a green check that
 * silently does nothing.
 */
app.get('/api/whoop/status', async (c) => {
  const ref = await callerRef(c);
  if (!ref) return c.json({ connected: false });
  const [conn, token] = await Promise.all([getWhoopConnection(ref), getValidAccessToken(ref)]);
  return c.json(
    conn && token
      ? { connected: true, scope: conn.scope, connectedAt: conn.connectedAt }
      : { connected: false },
  );
});

app.post('/api/whoop/disconnect', async (c) => {
  const ref = await callerRef(c);
  if (!ref) return c.json({ error: 'identify_required' }, 401);
  // Cancel the access at WHOOP too, not only our copy of the tokens.
  const revoked = await revokeWhoopAccess(ref);
  await deleteWhoopConnection(ref);
  return c.json({ ok: true, revoked });
});

/** Cancel WHOOP access for every connection in a person's account (account deletion). */
async function revokeWhoopFor(ref: string): Promise<void> {
  for (const r of await whoopRefsFor(ref).catch(() => [] as string[])) await revokeWhoopAccess(r);
}

/**
 * Runs one WHOOP data fetch with a single self-heal retry: if the cached
 * access token turns out to be dead — WHOOP returns a 401 even though our
 * own bookkeeping thought it still had time left (revoked from WHOOP's
 * side, or simply expired earlier than reported) — force a fresh refresh
 * and retry exactly once before giving up. This is what actually avoids
 * "reconnect every time": most of the time the stored refresh_token is
 * still good and this recovers silently. Only when even a forced refresh
 * can't produce a working token does it delete the stored connection, so
 * the next status check truthfully says disconnected instead of a green
 * check that silently does nothing — that combination (never self-healing,
 * never reporting the real state) was the actual gap behind reported
 * reconnect loops.
 */
async function withWhoopRetry<T>(
  ref: string,
  token: string,
  run: (token: string) => Promise<T>,
): Promise<T | null> {
  try {
    return await run(token);
  } catch (err) {
    if (!(err instanceof WhoopAuthError)) throw err;
    console.warn(`whoop token rejected for ${ref}, forcing refresh`);
    const fresh = await getValidAccessToken(ref, true);
    if (!fresh) {
      await deleteWhoopConnection(ref);
      return null;
    }
    try {
      return await run(fresh);
    } catch (err2) {
      if (!(err2 instanceof WhoopAuthError)) throw err2;
      console.warn(`whoop token still rejected for ${ref} after refresh — disconnecting`);
      await deleteWhoopConnection(ref);
      return null;
    }
  }
}

/**
 * The actual burn for a day, straight from WHOOP's heart-rate-based workout
 * data, instead of Calgym's set/rep formula estimate. `start`/`end` are the
 * caller's local day boundaries — Calgym has no session concept (exercises
 * are checked off individually), so this sums every WHOOP workout that
 * overlaps the day rather than trying to match one Calgym exercise to one
 * WHOOP workout.
 */
app.get('/api/whoop/day-burn', async (c) => {
  const ref = await callerRef(c);
  const start = c.req.query('start');
  const end = c.req.query('end');
  if (!ref || !start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    return c.json({ totalKcal: null, workouts: [] });
  }
  const token = await getValidAccessToken(ref);
  if (!token) return c.json({ totalKcal: null, workouts: [], connected: false });
  try {
    const workouts = await withWhoopRetry(ref, token, (t) => fetchWorkoutsInRange(t, start, end));
    if (workouts == null) return c.json({ totalKcal: null, workouts: [], connected: false });
    const scored = workouts.filter((w) => w.kilojoule != null);
    // A workout WHOOP has recorded but not yet scored (kilojoule still null)
    // is real evidence something happened today even though it can't be
    // counted yet — surfaced so the client can say "still scoring" instead
    // of the vague, indistinguishable "nothing found" silence a plain
    // totalKcal: null leaves behind.
    const pending = workouts.length > scored.length;
    const totalKcal = scored.length
      ? Math.round(scored.reduce((sum, w) => sum + kilojoulesToKcal(w.kilojoule!), 0))
      : null;
    return c.json({
      totalKcal,
      workouts: scored.map((w) => ({
        sportName: w.sportName,
        start: w.start,
        end: w.end,
        kcal: Math.round(kilojoulesToKcal(w.kilojoule!)),
        strain: w.strain,
        avgHeartRate: w.avgHeartRate,
      })),
      connected: true,
      pending,
    });
  } catch (err) {
    console.error('whoop day-burn failed:', err);
    return c.json({ totalKcal: null, workouts: [], connected: true });
  }
});

/**
 * One-time (or periodic) backfill: every WHOOP workout from the last
 * `days`, each tagged with the local calendar date it happened on (using
 * the workout's own recorded timezone, not a guess). The app groups these
 * into its own day buckets — a connection made after months of WHOOP
 * history shouldn't start the burn calibration from a blank slate.
 */
app.get('/api/whoop/history', async (c) => {
  const ref = await callerRef(c);
  const days = Math.min(180, Math.max(1, Number(c.req.query('days') ?? 60) || 60));
  if (!ref) return c.json({ workouts: [] });
  const token = await getValidAccessToken(ref);
  if (!token) return c.json({ workouts: [] });
  try {
    const history = await withWhoopRetry(ref, token, (t) => fetchWorkoutHistory(t, days));
    if (history == null) return c.json({ workouts: [] });
    const scored = history.filter((w) => w.kilojoule != null);
    return c.json({
      workouts: scored.map((w) => ({
        localDate: w.localDate,
        sportName: w.sportName,
        start: w.start,
        end: w.end,
        kcal: Math.round(kilojoulesToKcal(w.kilojoule!)),
        strain: w.strain,
        avgHeartRate: w.avgHeartRate,
      })),
    });
  } catch (err) {
    console.error('whoop history failed:', err);
    return c.json({ workouts: [] });
  }
});

/**
 * A compact recovery/strain/sleep snapshot for the coach's context — see
 * coachSystemPrompt's WHOOP guidance for how it's meant to be used. Every
 * field is independently best-effort: WHOOP can score recovery without
 * having scored today's cycle yet, and vice versa.
 */
app.get('/api/whoop/summary', async (c) => {
  const ref = await callerRef(c);
  if (!ref) return c.json({ connected: false });
  const token = await getValidAccessToken(ref);
  if (!token) return c.json({ connected: false });
  const [recovery, sleep, todayStrain] = await Promise.all([
    withWhoopRetry(ref, token, fetchLatestRecovery).catch(() => null),
    withWhoopRetry(ref, token, fetchLatestSleep).catch(() => null),
    withWhoopRetry(ref, token, fetchTodayStrain).catch(() => null),
  ]);
  return c.json({
    connected: true,
    recoveryScore: recovery?.recoveryScore ?? null,
    hrvMs: recovery?.hrvMs ?? null,
    restingHr: recovery?.restingHr ?? null,
    sleepPerformancePercent: sleep?.performancePercent ?? null,
    sleepHours: sleep?.hours ?? null,
    todayStrain: todayStrain ?? null,
  });
});

// ── Admin ─────────────────────────────────────────────────────────────────

/** Shared-secret gate. Set ADMIN_TOKEN in the server environment. */
function adminOk(c: { req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined } }): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  const given = c.req.header('x-admin-token') ?? c.req.query('token') ?? '';
  return given === token;
}

app.get('/admin/api/data', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const [stats, users, limits, sponsor, shadowTests, providers, prices, weights, locks, trial] =
    await Promise.all([
      adminStats(),
      listUsers(),
      planLimits(),
      getSetting<Record<string, unknown> | null>('sponsor', null),
      listShadowTests(),
      aiProviders(deepseekConfigured()),
      planPrices(),
      actionWeights(),
      planLocksOn(),
      trialLimit(),
    ]);
  return c.json({
    stats,
    users,
    limits,
    planLocks: locks,
    trialLimit: trial,
    sponsor,
    plans: PLANS,
    cache: cacheEnabled,
    shadowTests,
    deepseekConfigured: deepseekConfigured(),
    providers,
    prices,
    weights,
    fixedRoutes: AI_PROVIDER_FIXED_ROUTES,
  });
});

const PLAN_IDS: Plan[] = ['free', 'pro', 'proPlus'];

/** Set which AI answers for each membership tier. Takes effect on the next
 * request — no redeploy. Refuses DeepSeek when its key isn't set. */
app.post('/admin/api/providers', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<Partial<Record<Plan, string>>>().catch(() => ({}) as Partial<Record<Plan, string>>);
  const next: Record<string, AiProvider> = {};
  for (const plan of PLAN_IDS) {
    const value = body[plan];
    if (value !== 'claude' && value !== 'deepseek') return c.json({ error: 'invalid_request' }, 400);
    if (value === 'deepseek' && !deepseekConfigured()) return c.json({ error: 'not_configured' }, 400);
    next[plan] = value;
  }
  await setSetting('ai_providers', next);
  return c.json({ ok: true, providers: await aiProviders(deepseekConfigured()) });
});

/** Set the prices the app displays and the dashboard's revenue estimate
 * uses. Does NOT change what anyone is actually billed — see planPrices. */
app.post('/admin/api/prices', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req
    .json<{ pro?: number; proPlus?: number; proYearly?: number; essentials?: number; essentialsYearly?: number; currency?: string }>()
    .catch(() => ({}) as Record<string, never>);
  const valid = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 100000;
  if (!valid(body.pro) || !valid(body.proPlus) || !valid(body.proYearly)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const cur = await planPrices();
  await setSetting('plan_prices', {
    pro: body.pro,
    proPlus: body.proPlus,
    proYearly: body.proYearly,
    essentials: valid(body.essentials) ? body.essentials : cur.essentials,
    essentialsYearly: valid(body.essentialsYearly) ? body.essentialsYearly : cur.essentialsYearly,
    currency: (body.currency ?? 'SAR').trim().slice(0, 8) || 'SAR',
  });
  return c.json({ ok: true, prices: await planPrices() });
});

// A minimal, structurally-valid 1x1 JPEG — just enough for DeepSeek's vision
// endpoint to accept as input. Lets the admin dashboard fire one real
// DeepSeek vision call on demand (see "Test DeepSeek vision now") to see the
// raw response immediately, without spending a real user's meal scan on it.
const TEST_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

app.post('/admin/api/test-deepseek-vision', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  if (!deepseekConfigured()) return c.json({ error: 'not_configured' }, 400);
  const start = Date.now();
  try {
    const ds = await deepseekVisionCall(TEST_JPEG_B64, mealPrompt('en'), 500);
    return c.json({
      ok: true,
      ms: Date.now() - start,
      model: ds.model,
      inputTokens: ds.inputTokens,
      outputTokens: ds.outputTokens,
      text: ds.text,
    });
  } catch (err) {
    return c.json({ ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * Settle the open question above with evidence instead of reasoning: run one
 * REAL body-composition report through both providers with the identical
 * prompt the live route uses, and hand back both parsed results so they can
 * be compared field by field.
 *
 * Deliberately spends on both providers — that is the point of the test —
 * and charges no user's quota, since no user made the request.
 */
app.post('/admin/api/test-report', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const parsed = parseBodyReadingBody(await c.req.json<BodyReadingBody>().catch(() => ({})));
  if (!parsed) return c.json({ error: 'invalid_request' }, 400);
  const prompt = bodyReadingPrompt(parsed.language);
  const isPdf = 'pdf' in parsed;

  const claudeStart = Date.now();
  const claude = await (isPdf
    ? analyzeDocument(parsed.pdf, prompt, MODEL)
    : analyze(parsed.image, prompt, MODEL, parsed.mediaType)
  )
    .then((raw) => ({ ok: true, ms: Date.now() - claudeStart, model: MODEL, parsed: toBodyReadingAnalysis(raw), raw }))
    .catch((err) => ({
      ok: false,
      ms: Date.now() - claudeStart,
      model: MODEL,
      error: err instanceof Error ? err.message : String(err),
    }));

  if (isPdf) {
    return c.json({
      claude,
      deepseek: {
        ok: false,
        skipped: true,
        error: 'Our DeepSeek client sends images only, so a PDF cannot be compared. Re-run with a photo or screenshot of the report to test DeepSeek.',
      },
    });
  }
  if (!deepseekConfigured()) {
    return c.json({ claude, deepseek: { ok: false, skipped: true, error: 'DEEPSEEK_API_KEY is not set on this server.' } });
  }

  const dsStart = Date.now();
  const deepseek = await deepseekVisionCall(parsed.image, prompt, 8000)
    .then((ds) => ({
      ok: true,
      ms: Date.now() - dsStart,
      model: ds.model,
      inputTokens: ds.inputTokens,
      outputTokens: ds.outputTokens,
      parsed: toBodyReadingAnalysis(extractJson(ds.text)),
      raw: ds.text.slice(0, 2000),
    }))
    .catch((err) => ({
      ok: false,
      ms: Date.now() - dsStart,
      error: err instanceof Error ? err.message : String(err),
    }));

  return c.json({ claude, deepseek });
});

// A realistic (not trivial) exercise-info prompt, so this actually exercises
// deepseek-v4-flash's reasoning behavior the way a real request would —
// unlike the vision test's blank image, a one-word prompt wouldn't tell us
// whether the reasoning-token budget is actually large enough now.
app.post('/admin/api/test-deepseek-text', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  if (!deepseekConfigured()) return c.json({ error: 'not_configured' }, 400);
  const start = Date.now();
  try {
    const ds = await deepseekTextCall(exerciseInfoPrompt('en', 'Bulgarian Split Squat'), 4000);
    return c.json({
      ok: true,
      ms: Date.now() - start,
      model: ds.model,
      inputTokens: ds.inputTokens,
      outputTokens: ds.outputTokens,
      text: ds.text,
    });
  } catch (err) {
    return c.json({ ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/admin/api/plan', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req
    .json<{ ref?: string; email?: string; plan?: string; days?: number; note?: string; module?: string }>()
    .catch(() => ({}) as never);
  // Either one account by ref, or the account signed in with an address. The
  // address is looked up in Supabase Auth, which verified it — never in the
  // emails apps report to us, which anyone could set to anything.
  const email = (body.email ?? '').trim();
  let refs: string[];
  if (email) {
    const found = await findAuthUserByEmail(email);
    if (found === 'failed') return c.json({ error: 'lookup_failed' }, 502);
    refs = found === 'not_configured' ? await refsForEmail(email) : found ? [found.id] : [];
  } else {
    refs = [(body.ref ?? '').trim()].filter(Boolean);
  }
  if (email && !refs.length) return c.json({ error: 'no_account' }, 404);
  if (!refs.length) return c.json({ error: 'invalid_request' }, 400);
  const plan: Plan = body.plan === 'essentials' || body.plan === 'pro' || body.plan === 'proPlus' ? body.plan : 'free';
  const until =
    plan !== 'free' && body.days && body.days > 0
      ? new Date(Date.now() + body.days * 86400000).toISOString()
      : null;
  for (const ref of refs) {
    // An admin grant of Essentials sets its module outright (no 30-day wait).
    if (plan === 'essentials' && (body.module === 'food' || body.module === 'training')) {
      await setUserModule(ref, body.module, new Date(), true);
    }
    await setUserPlan(ref, plan, 'admin', until, body.note);
    // Setting someone to free is a revoke: a running code gift goes too, or
    // the person would stay on the gifted tier with the table showing free.
    if (plan === 'free') await clearPromo(ref);
  }
  return c.json({ ok: true, refs, ...(await getOrCreateUser(refs[0])) });
});

app.post('/admin/api/limits', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req
    .json<{ free?: number; essentials?: number; pro?: number; proPlus?: number; trial?: number }>()
    .catch(() => ({}) as never);
  const [cur, curTrial] = await Promise.all([planLimits(), trialLimit()]);
  const pick = (v: unknown, fallback: number) =>
    Number.isFinite(v) ? Math.max(0, Number(v)) : fallback;
  await setSetting('plan_limits', {
    free: pick(body.free, cur.free),
    essentials: pick(body.essentials, cur.essentials),
    pro: pick(body.pro, cur.pro),
    proPlus: pick(body.proPlus, cur.proPlus),
    trial: pick(body.trial, curTrial),
  });
  return c.json({ ok: true, limits: await planLimits(), trialLimit: await trialLimit() });
});

/** Turn per-plan feature locks on or off. Off until the store can sell. */
app.post('/admin/api/plan-locks', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ on?: boolean }>().catch(() => ({}) as { on?: boolean });
  await setSetting('plan_locks', { on: body.on === true });
  return c.json({ ok: true, on: await planLocksOn() });
});

/** Every code with its counters, newest first. */
app.get('/admin/api/promos', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const [rows, totals] = await Promise.all([listPromos(), codeEarningTotals()]);
  return c.json({
    promos: rows.map((r) => ({ ...r, remaining: remaining(r), problem: codeProblem(r), earned: totals[r.code] ?? null })),
  });
});

/** Create a code or edit one. Counters survive an edit — they are the history. */
app.post('/admin/api/promo', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as never);
  const clean = cleanDraft({ ...body, code: String(body.code ?? '') });
  if (!clean.ok) return c.json({ error: clean.error }, 400);
  // Who earns from it: checked against the codes that exist, for the link.
  const all = await listPromos(1000);
  const byCode = new Map(all.map((p) => [p.code, { partnerId: p.earning?.partnerId ?? null, parentCode: p.earning?.parentCode ?? null }]));
  const earning = cleanEarning(clean.value.code, body, (code) => byCode.get(code) ?? null);
  if (!earning.ok) return c.json({ error: earning.error }, 400);
  const saved = await upsertPromo(clean.value);
  if (!saved) return c.json({ error: 'unavailable' }, 503);
  await setCodeEarning(saved.code, earning.value);
  saved.earning = earning.value;
  return c.json({ ok: true, promo: { ...saved, remaining: remaining(saved), problem: codeProblem(saved) } });
});

/** Delete a code and its redemption history. */
app.post('/admin/api/promo-delete', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ code?: string }>().catch(() => ({}) as never);
  const code = normalizeCode(String(body.code ?? ''));
  // A code that has earned anyone money is part of their history: turn it off instead.
  if (await codeHasEarnings(code)) return c.json({ ok: false, error: 'has_earnings' }, 409);
  const gone = await deletePromo(code);
  return c.json({ ok: gone });
});

/**
 * The overview tab: day-by-day figures for the chosen range, the latest
 * activity, what needs the admin's attention, and a launch checklist of the
 * settings this server can see for itself.
 */
app.get('/admin/api/overview', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const days = Number(c.req.query('days') ?? 30);
  const [overview, partners, deletions] = await Promise.all([adminOverview(Number.isFinite(days) ? days : 30), listPartners(), openDeletionRequests()]);
  if (!overview) return c.json({ error: 'no_database' }, 503);
  const set = (k: string) => !!process.env[k];
  const checklist = [
    { id: 'database', done: cacheEnabled, label: 'Database connected', how: 'Set DATABASE_URL on Railway.' },
    { id: 'claude', done: set('ANTHROPIC_API_KEY'), label: 'Claude API key', how: 'Set ANTHROPIC_API_KEY on Railway.' },
    { id: 'account_token', done: enforcingAccountToken(), label: 'Signed-in requests must prove who they are', how: 'Once the app update that sends sign-in proof has reached most phones (a week or two after it ships), set REQUIRE_ACCOUNT_TOKEN=1 on Railway. Needs SUPABASE_SERVICE_ROLE_KEY.' },
    { id: 'deepseek', done: set('DEEPSEEK_API_KEY'), label: 'DeepSeek API key', how: 'Set DEEPSEEK_API_KEY on Railway (optional — without it everything runs on Claude).' },
    { id: 'rc_ios', done: set('REVENUECAT_IOS_KEY'), label: 'RevenueCat iOS public key', how: 'RevenueCat → Project settings → API keys → Apple public key → REVENUECAT_IOS_KEY.' },
    { id: 'rc_android', done: set('REVENUECAT_ANDROID_KEY'), label: 'RevenueCat Android public key', how: 'RevenueCat → API keys → Google public key → REVENUECAT_ANDROID_KEY.' },
    { id: 'rc_secret', done: set('REVENUECAT_SECRET_KEY'), label: 'RevenueCat secret key (server only)', how: 'RevenueCat → API keys → secret key (v1) → REVENUECAT_SECRET_KEY. Never put it in the app.' },
    { id: 'rc_webhook', done: set('REVENUECAT_WEBHOOK_SECRET'), label: 'RevenueCat webhook secret', how: 'RevenueCat → Integrations → Webhooks → URL /api/billing/revenuecat, authorization header = REVENUECAT_WEBHOOK_SECRET.' },
    { id: 'rc_first_event', done: overview.billingEventsEver > 0, label: 'First store event received', how: 'Make a sandbox purchase on TestFlight; it appears under Recent store events.' },
    { id: 'account_delete', done: supabaseAdminConfigured(), label: 'Account deletion removes the sign-in account', how: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Supabase → Project settings → API) on Railway. Required by both stores.' },
    { id: 'support_email', done: true, label: 'Support email for the legal pages', how: 'Set SUPPORT_EMAIL on Railway (the pages use support@calgym.org until then).' },
  ];
  const owed = Math.round(partners.reduce((sum, p) => sum + p.balance.owed, 0) * 100) / 100;
  return c.json({ ...overview, attention: { ...overview.attention, partnersOwedUsd: owed, deletionRequests: deletions }, checklist });
});

/** Deletion requests from the public page, open ones first. */
app.get('/admin/api/deletion-requests', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ requests: await listDeletionRequests() });
});

/** Delete the account(s) behind a request and close it. */
app.post('/admin/api/deletion-request-done', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ id?: number; deleteRefs?: string[] }>().catch(() => ({}) as never);
  const refs = Array.isArray(body.deleteRefs) ? body.deleteRefs.filter((r) => typeof r === 'string' && r).slice(0, 10) : [];
  const request = (await listDeletionRequests()).find((r) => r.id === Number(body.id));
  if (!request) return c.json({ error: 'not_found' }, 404);
  // The sign-in account first: if that fails the request stays open to retry.
  const account = await deleteAuthUserByEmail(request.email);
  if (account === 'failed') return c.json({ error: 'account_delete_failed' }, 502);
  for (const ref of refs) {
    await revokeWhoopFor(ref);
    await deleteUser(ref);
  }
  await markDeletionRequestDone(request.id);
  return c.json({ ok: true, deleted: refs.length, account });
});

// ── Partners ──────────────────────────────────────────────────────────────

/** Every partner with their codes, sales and money. */
app.get('/admin/api/partners', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ partners: await listPartners() });
});

/** Create a partner (no id) or edit one. */
app.post('/admin/api/partner', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as never);
  const clean = cleanPartner(body);
  if (!clean.ok) return c.json({ error: clean.error }, 400);
  const id = typeof body.id === 'string' && body.id ? body.id : null;
  const saved = await savePartner(id, clean.value);
  if (!saved) return c.json({ error: id ? 'not_found' : 'unavailable' }, id ? 404 : 503);
  return c.json({ ok: true, partner: saved });
});

app.post('/admin/api/partner-delete', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ id?: string }>().catch(() => ({}) as never);
  const out = await deletePartner(String(body.id ?? ''));
  return out === 'deleted' ? c.json({ ok: true }) : c.json({ ok: false, error: out }, out === 'has_earnings' ? 409 : 404);
});

/** A fresh private link for a partner; the old one stops working. */
app.post('/admin/api/partner-token', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ id?: string }>().catch(() => ({}) as never);
  const saved = await rotatePartnerToken(String(body.id ?? ''));
  return saved ? c.json({ ok: true, partner: saved }) : c.json({ error: 'not_found' }, 404);
});

/** Record money paid to a partner (outside the app). */
app.post('/admin/api/partner-payout', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ id?: string; amountUsd?: unknown; note?: unknown }>().catch(() => ({}) as never);
  const amount = Math.round(Number(body.amountUsd) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return c.json({ error: 'amount_out_of_range' }, 400);
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 200) : null;
  const ok = await addPayout(String(body.id ?? ''), amount, note);
  return ok ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
});

/** One partner in full — the same figures their private page shows. */
app.get('/admin/api/partner-report', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const report = await partnerReport(c.req.query('id') ?? '');
  return report ? c.json(report) : c.json({ error: 'not_found' }, 404);
});

/** A partner's own read-only page, reached by the secret link the admin shares. */
app.get('/partner/:token', async (c) => {
  c.header('X-Robots-Tag', 'noindex, nofollow');
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
  const partner = await getPartnerByToken(c.req.param('token'));
  if (!partner) return c.html(partnerNotFoundHtml(), 404);
  const report = await partnerReport(partner.id);
  if (!report) return c.html(partnerNotFoundHtml(), 404);
  return c.html(partnerPageHtml(report));
});

/** Who used a code, and when. */
app.get('/admin/api/promo-redemptions', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const code = normalizeCode(c.req.query('code') ?? '');
  return c.json({ code, redemptions: await listRedemptions(code) });
});

/**
 * What each AI route costs against a plan's monthly allowance. These are cost
 * hypotheses, not fixed truths — the per-kind spend the usage table records is
 * what should eventually set them, so they are editable without a redeploy.
 */
/** "I've seen these": the AI tab's count starts again from now. The
 * failures themselves stay listed for the full 24 hours. */
app.post('/admin/api/ai-failures/seen', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  await setSetting('ai_failures_seen_at', new Date().toISOString());
  return c.json({ ok: true });
});

app.post('/admin/api/weights', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as never);
  const cur = await actionWeights();
  const next: Record<string, number> = {};
  for (const kind of Object.keys(DEFAULT_ACTION_WEIGHTS)) {
    const v = body[kind];
    next[kind] =
      typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 50 ? Math.round(v) : cur[kind];
  }
  await setSetting('action_weights', next);
  return c.json({ ok: true, weights: await actionWeights() });
});

/** Products waiting on a person, newest and most-reported first, each with
 * every competing reading so two can be compared side by side. */
app.get('/admin/api/barcode-queue', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ queue: await barcodeQueue(50) });
});

/** Why AI calls have been failing. The summary answers "is everything broken
 * for one reason" at a glance; the rows carry the provider's own words. */
app.get('/admin/api/ai-failures', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const [summary, recent] = await Promise.all([aiFailureSummary(24), recentAiFailures(15)]);
  return c.json({ summary, recent });
});

/** Publish a checked product to everyone, or reject it. Publishing stamps
 * when it was checked, which is the only thing that makes "verified" mean
 * anything later. */
app.post('/admin/api/barcode-review', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req
    .json<{ barcode?: string; action?: string; item?: unknown }>()
    .catch(() => ({}) as never);
  const barcode = (body.barcode ?? '').trim();
  const action = body.action === 'reject' ? 'reject' : 'publish';
  if (!isPlausibleBarcode(barcode)) return c.json({ error: 'invalid_request' }, 400);
  const ok = await reviewBarcode(barcode, action, body.item);
  return c.json({ ok });
});

/** The rented sponsor slot (a real advertiser you sell the spot to). */
app.post('/admin/api/sponsor', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req
    .json<{ enabled?: boolean; title?: string; subtitle?: string; imageUrl?: string; linkUrl?: string }>()
    .catch(() => ({}) as never);
  const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const url = clean(body.linkUrl, 500);
  const img = clean(body.imageUrl, 500);
  await setSetting('sponsor', {
    enabled: !!body.enabled,
    title: clean(body.title, 80),
    subtitle: clean(body.subtitle, 140),
    // Only allow https links so the app never opens something unexpected.
    imageUrl: /^https:\/\//.test(img) ? img : '',
    linkUrl: /^https:\/\//.test(url) ? url : '',
  });
  return c.json({ ok: true, sponsor: await getSetting('sponsor', null) });
});

app.get('/admin', (c) => c.html(ADMIN_HTML));

initDb()
  .then(() => {
    serve({ fetch: app.fetch, port: PORT }, (info) => {
      console.log(
        `Calgym AI server listening on :${info.port} (model: ${MODEL}, cache: ${cacheEnabled ? 'on' : 'off'})`,
      );
    });
  })
  .catch((err) => {
    console.error('DB init failed, starting without cache:', err);
    serve({ fetch: app.fetch, port: PORT }, (info) => {
      console.log(`Calgym AI server listening on :${info.port} (model: ${MODEL}, cache: off)`);
    });
  });
