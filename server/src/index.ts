import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { ADMIN_HTML } from './admin-html.js';
import { PRIVACY_HTML, TERMS_HTML } from './legal-html.js';
import { checkAccess, consume, featureLocked, PLANS, planLimits, quotaError } from './billing.js';
import {
  adminStats,
  canonicalKey,
  cacheEnabled,
  deleteUser,
  getCachedEquipment,
  getOrCreateUser,
  getSetting,
  getUsageKind,
  initDb,
  linkRefs,
  listUsers,
  resolveRef,
  setCachedEquipment,
  setSetting,
  setUserPlan,
} from './db.js';
import {
  coachSystemPrompt,
  equipmentDetailsPrompt,
  exerciseInfoPrompt,
  identifyEquipmentPrompt,
  mealPrompt,
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

const app = new Hono();
app.use('*', cors());

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

app.get('/health', (c) => c.json({ ok: true, cache: cacheEnabled }));

/**
 * Shareable workout-plan link. Someone taps `/s?d=<base64url>` (sent over
 * WhatsApp etc.); this page bounces them into the app via the `calapp://`
 * deep link, with a manual button as a fallback. The payload is opaque to the
 * server — it's decoded and applied entirely on-device.
 */
app.get('/s', (c) => {
  const raw = c.req.query('d') ?? '';
  // base64url only — reject anything else so nothing untrusted is injected.
  const data = /^[A-Za-z0-9_-]+$/.test(raw) ? raw : '';
  const deepLink = `calapp://schedule-import?d=${data}`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Calgym workout plan</title>
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
    <h1>Calgym workout plan</h1>
    <p>Open this shared plan in the Calgym app to add it to your week.</p>
    <a class="btn" id="open" href="${deepLink}">Open in Calgym</a>
  </div>
  <script>
    var link = ${JSON.stringify(deepLink)};
    if (link.indexOf('calapp://schedule-import?d=') === 0 && link.length > 'calapp://schedule-import?d='.length) {
      setTimeout(function () { window.location.href = link; }, 300);
    }
  </script>
</body>
</html>`;
  return c.html(html);
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

async function analyze(image: string, prompt: string, model: string = MODEL): Promise<unknown> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1500,
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

  return parseJson(response.content.find((b) => b.type === 'text')?.text ?? '');
}

/** Text-only completion (no image) — used for cacheable equipment details. */
async function textCall(prompt: string, maxTokens = 1000): Promise<unknown> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return parseJson(response.content.find((b) => b.type === 'text')?.text ?? '');
}

function parseJson(text: string): unknown {
  // Strip accidental markdown fences before parsing.
  return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}

app.post('/api/analyze-meal', async (c) => {
  const parsed = parseBody(await c.req.json<AnalyzeBody>().catch(() => ({})));
  if (!parsed) return c.json({ error: 'invalid_request' }, 400);
  const ref = await callerRef(c);
  const access = await checkAccess(ref, 'meal');
  if (!access.withinQuota) return c.json(quotaError(access), 402);
  try {
    const model = access.spec.highAccuracy ? PREMIUM_MODEL : MEAL_MODEL;
    const result = await analyze(parsed.image, mealPrompt(parsed.language), model);
    await consume(ref, 'meal');
    return c.json(result);
  } catch (err) {
    console.error('analyze-meal failed:', err);
    return c.json({ error: 'analysis_failed' }, 502);
  }
});

app.post('/api/analyze-equipment', async (c) => {
  const parsed = parseBody(await c.req.json<AnalyzeBody>().catch(() => ({})));
  if (!parsed) return c.json({ error: 'invalid_request' }, 400);
  const ref = await callerRef(c);
  const access = await checkAccess(ref, 'equipment');
  if (!access.featureAllowed) return c.json(featureLocked(access), 403);
  if (!access.withinQuota) return c.json(quotaError(access), 402);
  try {
    // Step 1: cheap vision call to identify the machine.
    const id = (await analyze(parsed.image, identifyEquipmentPrompt(parsed.language))) as {
      name?: string;
      confidence?: number;
    };
    const name = (id.name ?? '').trim();
    if (!name) {
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
      await consume(ref, 'equipment');
      return c.json(cached);
    }

    // Step 3: cache miss — generate details (text only, no image) and store.
    const details = await textCall(equipmentDetailsPrompt(parsed.language, name), 1500);
    await setCachedEquipment(key, parsed.language, details);
    await consume(ref, 'equipment');
    return c.json(details);
  } catch (err) {
    console.error('analyze-equipment failed:', err);
    return c.json({ error: 'analysis_failed' }, 502);
  }
});

app.post('/api/analyze-text', async (c) => {
  const body = await c.req.json<{ text?: string; language?: string }>().catch(() => ({}) as never);
  const text = (body.text ?? '').trim().slice(0, 500);
  if (text.length < 3) return c.json({ error: 'invalid_request' }, 400);
  const language: Language = body.language === 'ar' ? 'ar' : 'en';
  const ref = await callerRef(c);
  const access = await checkAccess(ref, 'describe');
  if (!access.withinQuota) return c.json(quotaError(access), 402);
  try {
    const response = await anthropic.messages.create({
      model: access.spec.highAccuracy ? PREMIUM_MODEL : MEAL_MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: textMealPrompt(language, text) }],
    });
    const raw = response.content.find((b) => b.type === 'text')?.text ?? '';
    await consume(ref, 'describe');
    return c.json(JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')));
  } catch (err) {
    console.error('analyze-text failed:', err);
    return c.json({ error: 'analysis_failed' }, 502);
  }
});

app.post('/api/analyze-exercise', async (c) => {
  const body = await c.req.json<{ name?: string; language?: string }>().catch(() => ({}) as never);
  const name = (body.name ?? '').trim().slice(0, 120);
  if (name.length < 2) return c.json({ error: 'invalid_request' }, 400);
  const language: Language = body.language === 'ar' ? 'ar' : 'en';
  const ref = await callerRef(c);
  const access = await checkAccess(ref, 'equipment');
  if (!access.featureAllowed) return c.json(featureLocked(access), 403);
  if (!access.withinQuota) return c.json(quotaError(access), 402);
  try {
    const result = await textCall(exerciseInfoPrompt(language, name), 600);
    await consume(ref, 'exercise');
    return c.json(result);
  } catch (err) {
    console.error('analyze-exercise failed:', err);
    return c.json({ error: 'analysis_failed' }, 502);
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
  const ref = await callerRef(c);
  const access = await checkAccess(ref, 'coach');
  if (!access.featureAllowed) return c.json(featureLocked(access), 403);
  if (!access.withinQuota) return c.json(quotaError(access), 402);
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: coachSystemPrompt(language, contextText(body.context)),
      messages,
    });
    const reply = response.content.find((b) => b.type === 'text')?.text ?? '';
    await consume(ref, 'coach');
    return c.json({ reply });
  } catch (err) {
    console.error('coach failed:', err);
    return c.json({ error: 'coach_failed' }, 502);
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
    listUsers(200),
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
