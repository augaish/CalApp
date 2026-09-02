import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';

import { ADMIN_HTML } from './admin-html.js';
import { PRIVACY_HTML, TERMS_HTML } from './legal-html.js';
import { checkAccess, featureLocked, PLANS, planLimits, quotaError, release, reserve } from './billing.js';
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
  getCachedEquipment,
  getOrCreateUser,
  getSetting,
  getUsageKind,
  getWhoopConnection,
  initDb,
  linkRefs,
  listUsers,
  markBillingEventApplied,
  readShareLink,
  resolveRef,
  saveWhoopOAuthState,
  setCachedEquipment,
  setSetting,
  setUserDevice,
  setUserEmail,
  setUserPlan,
  setWhoopConnection,
} from './db.js';
import {
  citationDomains,
  extractJson,
  isInsufficientCreditError,
  isWebSearchDisabled,
  replyText,
  sanitizeProgram,
  sanitizeSchedulePlan,
  toMealAnalysis,
  type CoachSchedulePlan,
  type FoodItem,
  type MealAnalysis,
} from './parse.js';
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
  whoopConfigured,
} from './whoop.js';
import { decide, type RevenueCatEvent } from './revenuecat.js';
import {
  bodyReadingPrompt,
  coachAttachmentSummaryPrompt,
  coachSystemPrompt,
  equipmentDetailsPrompt,
  exerciseInfoPrompt,
  identifyEquipmentPrompt,
  mealPrompt,
  programPrompt,
  refineMealPrompt,
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
    },
    required: ['summary', 'durationWeeks', 'targets', 'schedule'],
  },
};

const app = new Hono();
app.use('*', cors());

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
 * sends their account id; an install that has since been claimed by an account
 * resolves to that account, so usage and plan stay with the person.
 */
async function callerRef(c: {
  req: { header: (n: string) => string | undefined };
}): Promise<string | null> {
  const ref = validRef(c.req.header('x-calgym-user') ?? '');
  return ref ? await resolveRef(ref) : null;
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

app.get('/health', (c) => c.json({ ok: true, cache: cacheEnabled, commit: COMMIT }));

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

async function analyzeMealImage(
  image: string,
  prompt: string,
  model: string = MODEL,
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

  return toMealAnalysis(replyText(response));
}

async function analyze(
  image: string,
  prompt: string,
  model: string = MODEL,
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg',
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

  return extractJson(replyText(response));
}

/** Same as `analyze`, for a PDF document instead of an image (e.g. an InBody export). */
async function analyzeDocument(pdf: string, prompt: string, model: string = MODEL): Promise<unknown> {
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

  return extractJson(replyText(response));
}

/** Text-only completion (no image) — used for cacheable equipment details. */
async function textCall(prompt: string, maxTokens = 1500): Promise<unknown> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
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
  return isInsufficientCreditError(err)
    ? c.json({ error: 'ai_credits_exhausted' }, 503)
    : c.json({ error: fallbackCode }, 502);
}

app.post('/api/analyze-meal', async (c) => {
  const parsed = parseBody(await c.req.json<AnalyzeBody>().catch(() => ({})));
  if (!parsed) return c.json({ error: 'invalid_request' }, 400);
  const ref = (await callerRef(c))!;
  const access = await checkAccess(ref, 'meal');
  const claim = await reserve(ref, access, 'meal');
  if (!claim.ok) return c.json(quotaError(access), 402);
  try {
    const model = access.spec.highAccuracy ? PREMIUM_MODEL : MEAL_MODEL;
    const result = await analyzeMealImage(parsed.image, mealPrompt(parsed.language), model);
    return c.json(result);
  } catch (err) {
    console.error('analyze-meal failed:', err);
    await release(ref, 'meal');
    return aiFailure(c, err, 'analysis_failed');
  }
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
    // Step 1: cheap vision call to identify the machine.
    const id = (await analyze(parsed.image, identifyEquipmentPrompt(parsed.language))) as {
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
      return c.json(cached);
    }

    // Step 3: cache miss — generate details (text only, no image) and store.
    const details = await textCall(equipmentDetailsPrompt(parsed.language, name), 1500);
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
  if (image && image.length >= 100 && image.length <= 10 * 1024 * 1024) {
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
    const result =
      'pdf' in parsed
        ? await analyzeDocument(parsed.pdf, prompt)
        : await analyze(parsed.image, prompt, MODEL, parsed.mediaType);
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
    let response;
    try {
      response = await anthropic.messages.create({ ...request, tools: [WEB_SEARCH_TOOL] });
    } catch (err) {
      // Web search is an org-level Console setting; a disabled account must
      // still get its meal estimated, just without a restaurant lookup.
      if (!isWebSearchDisabled(err)) throw err;
      console.warn('web search unavailable, retrying analyze-text without it');
      response = await anthropic.messages.create(request);
    }
    return c.json(toMealAnalysis(replyText(response), citationDomains(response)));
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
    const request = {
      model: access.spec.highAccuracy ? PREMIUM_MODEL : MEAL_MODEL,
      max_tokens: 3000,
      messages: [{ role: 'user' as const, content: refineMealPrompt(language, items, message) }],
    };
    let response;
    try {
      response = await anthropic.messages.create({ ...request, tools: [WEB_SEARCH_TOOL] });
    } catch (err) {
      // Web search is an org-level Console setting; a disabled account must
      // still get a corrected estimate, just without a restaurant lookup.
      if (!isWebSearchDisabled(err)) throw err;
      console.warn('web search unavailable, retrying refine-meal without it');
      response = await anthropic.messages.create(request);
    }
    return c.json(toMealAnalysis(replyText(response), citationDomains(response)));
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
  const access = await checkAccess(ref, 'equipment');
  if (!access.featureAllowed) return c.json(featureLocked(access), 403);
  const claim = await reserve(ref, access, 'exercise');
  if (!claim.ok) return c.json(quotaError(access), 402);
  try {
    const result = await textCall(exerciseInfoPrompt(language, name), 600);
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
    if (json.length > 6000) return undefined;
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
    const response = await anthropic.messages.create({
      model: MODEL,
      // A plain reply fits easily in 500, but a full week's worth of days and
      // exercises inside the propose_weekly_schedule tool call does not.
      max_tokens: 2000,
      system: coachSystemPrompt(language, contextText(body.context)),
      messages,
      tools: [SCHEDULE_TOOL],
    });
    const reply = replyText(response);
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'propose_weekly_schedule',
    );
    const schedulePlan: CoachSchedulePlan | undefined = toolUse
      ? sanitizeSchedulePlan(toolUse.input)
      : undefined;
    return c.json({ reply, schedulePlan });
  } catch (err) {
    console.error('coach failed:', err);
    await release(ref, 'coach');
    return aiFailure(c, err, 'coach_failed');
  }
});

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
  const access = await checkAccess(ref, 'coach');
  if (!access.spec.coach) return c.json(featureLocked(access), 403);
  const claim = await reserve(ref, access, 'coach');
  if (!claim.ok) {
    return claim.reason === 'cap'
      ? c.json(featureLocked(access), 403)
      : c.json(quotaError(access), 402);
  }
  try {
    const prompt = coachAttachmentSummaryPrompt(parsed.language);
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
}

app.post('/api/generate-program', async (c) => {
  const body = await c.req.json<ProgramBody>().catch(() => ({}) as ProgramBody);
  const language: Language = body.language === 'ar' ? 'ar' : 'en';
  const ref = (await callerRef(c))!;
  const access = await checkAccess(ref, 'program');
  if (!access.featureAllowed) return c.json(featureLocked(access), 403);
  const claim = await reserve(ref, access, 'program');
  if (!claim.ok) return c.json(quotaError(access), 402);
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      // A full week's schedule alongside targets and a real summary needs more
      // room than a plain coach reply.
      max_tokens: 2500,
      system: programPrompt(language, contextText(body.context)),
      messages: [{ role: 'user', content: 'Design my program.' }],
      tools: [PROGRAM_TOOL],
      tool_choice: { type: 'tool', name: 'propose_program' },
    });
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'propose_program',
    );
    const program = toolUse ? sanitizeProgram(toolUse.input) : undefined;
    if (!program) {
      await release(ref, 'program');
      return c.json({ error: 'analysis_failed' }, 502);
    }
    return c.json(program);
  } catch (err) {
    console.error('generate-program failed:', err);
    await release(ref, 'program');
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
  const sponsor = await getSetting<Record<string, unknown> | null>('sponsor', null);
  const coachUsed =
    ref && typeof access.spec.coachCap === 'number'
      ? await getUsageKind(ref, 'coach', access.period)
      : 0;
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
    },
    sponsor,
  });
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
 * Attach the signed-in account's address to its row, so the admin list shows
 * something recognisable next to an opaque id. Sent by the app because the
 * alternative — querying the auth provider — would mean keeping a
 * service-role key on this server for the sake of one column. Guests never
 * call it.
 */
app.post('/api/identify', async (c) => {
  const ref = await callerRef(c);
  if (!ref) return c.json({ error: 'identify_required' }, 401);
  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as never);
  const email = (body?.email ?? '').trim().toLowerCase().slice(0, 200);
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
  const ref = await callerRef(c);
  if (!ref) return c.json({ error: 'invalid_request' }, 400);
  try {
    await deleteUser(ref);
    return c.json({ ok: true });
  } catch (err) {
    console.error('delete account failed:', err);
    return c.json({ error: 'delete_failed' }, 500);
  }
});

app.get('/privacy', (c) => c.html(PRIVACY_HTML));
app.get('/terms', (c) => c.html(TERMS_HTML));

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
  window.location.href = 'calapp://whoop-callback?status=${ok ? 'success' : 'error'}&reason=${encodeURIComponent(message)}';
</script>
</body></html>`;
}

/** Step 1: send the user's browser to WHOOP's consent screen. `ref` travels as a query param — this is a plain navigation, not a fetch, so no auth header is available. */
app.get('/api/whoop/authorize', async (c) => {
  if (!whoopConfigured()) {
    return c.html(whoopStatusPage(false, 'WHOOP is not configured on the server yet.'), 503);
  }
  const ref = validRef(c.req.query('ref') ?? '');
  if (!ref) return c.html(whoopStatusPage(false, 'Missing or invalid user reference.'), 400);
  const resolved = await resolveRef(ref);
  const state = crypto.randomUUID();
  await saveWhoopOAuthState(state, resolved);
  return c.redirect(buildAuthorizeUrl(whoopRedirectUri(c), state), 302);
});

/** Step 2: WHOOP redirects back here with a code (or an error/denial). */
app.get('/api/whoop/callback', async (c) => {
  const deniedReason = c.req.query('error');
  if (deniedReason) {
    return c.html(whoopStatusPage(false, `WHOOP said: ${deniedReason}`));
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
  await deleteWhoopConnection(ref);
  return c.json({ ok: true });
});

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
    const workouts = await fetchWorkoutsInRange(token, start, end);
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
    const history = await fetchWorkoutHistory(token, days);
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
    fetchLatestRecovery(token).catch(() => null),
    fetchLatestSleep(token).catch(() => null),
    fetchTodayStrain(token).catch(() => null),
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
  const [stats, users, limits, sponsor] = await Promise.all([
    adminStats(),
    listUsers(),
    planLimits(),
    getSetting<Record<string, unknown> | null>('sponsor', null),
  ]);
  return c.json({ stats, users, limits, sponsor, plans: PLANS, cache: cacheEnabled });
});

app.post('/admin/api/plan', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ ref?: string; plan?: string; days?: number; note?: string }>().catch(() => ({}) as never);
  const ref = (body.ref ?? '').trim();
  if (!ref) return c.json({ error: 'invalid_request' }, 400);
  const plan = body.plan === 'pro' || body.plan === 'proPlus' ? body.plan : 'free';
  const until =
    plan !== 'free' && body.days && body.days > 0
      ? new Date(Date.now() + body.days * 86400000).toISOString()
      : null;
  await setUserPlan(ref, plan, 'admin', until, body.note);
  return c.json({ ok: true, ...(await getOrCreateUser(ref)) });
});

app.post('/admin/api/limits', async (c) => {
  if (!adminOk(c)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req
    .json<{ free?: number; pro?: number; proPlus?: number }>()
    .catch(() => ({}) as never);
  const cur = await planLimits();
  const pick = (v: unknown, fallback: number) =>
    Number.isFinite(v) ? Math.max(0, Number(v)) : fallback;
  await setSetting('plan_limits', {
    free: pick(body.free, cur.free),
    pro: pick(body.pro, cur.pro),
    proPlus: pick(body.proPlus, cur.proPlus),
  });
  return c.json({ ok: true, limits: await planLimits() });
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
