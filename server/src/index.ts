import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { equipmentPrompt, mealPrompt, type Language } from './prompts.js';

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';
const PORT = Number(process.env.PORT ?? 3000);

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

const app = new Hono();
app.use('*', cors());

app.get('/health', (c) => c.json({ ok: true }));

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

  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  // Strip accidental markdown fences before parsing.
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
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
    const result = await analyze(parsed.image, equipmentPrompt(parsed.language));
    return c.json(result);
  } catch (err) {
    console.error('analyze-equipment failed:', err);
    return c.json({ error: 'analysis_failed' }, 502);
  }
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`CalApp AI server listening on :${info.port} (model: ${MODEL})`);
});
