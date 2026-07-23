import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import {
  canonicalKey,
  cacheEnabled,
  getCachedEquipment,
  initDb,
  setCachedEquipment,
} from './db.js';
import {
  coachSystemPrompt,
  equipmentDetailsPrompt,
  identifyEquipmentPrompt,
  mealPrompt,
  textMealPrompt,
  type Language,
} from './prompts.js';

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';
const PORT = Number(process.env.PORT ?? 3000);

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

const app = new Hono();
app.use('*', cors());

app.get('/health', (c) => c.json({ ok: true, cache: cacheEnabled }));

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

async function analyze(image: string, prompt: string): Promise<unknown> {
  const response = await anthropic.messages.create({
    model: MODEL,
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
  try {
    const result = await analyze(parsed.image, mealPrompt(parsed.language));
    return c.json(result);
  } catch (err) {
    console.error('analyze-meal failed:', err);
    return c.json({ error: 'analysis_failed' }, 502);
  }
});

app.post('/api/analyze-equipment', async (c) => {
  const parsed = parseBody(await c.req.json<AnalyzeBody>().catch(() => ({})));
  if (!parsed) return c.json({ error: 'invalid_request' }, 400);
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
      return c.json(cached);
    }

    // Step 3: cache miss — generate details (text only, no image) and store.
    const details = await textCall(equipmentDetailsPrompt(parsed.language, name), 1500);
    await setCachedEquipment(key, parsed.language, details);
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
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: textMealPrompt(language, text) }],
    });
    const raw = response.content.find((b) => b.type === 'text')?.text ?? '';
    return c.json(JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')));
  } catch (err) {
    console.error('analyze-text failed:', err);
    return c.json({ error: 'analysis_failed' }, 502);
  }
});

interface CoachBody {
  messages?: { role?: string; content?: string }[];
  language?: string;
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
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: coachSystemPrompt(language),
      messages,
    });
    const reply = response.content.find((b) => b.type === 'text')?.text ?? '';
    return c.json({ reply });
  } catch (err) {
    console.error('coach failed:', err);
    return c.json({ error: 'coach_failed' }, 502);
  }
});

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
