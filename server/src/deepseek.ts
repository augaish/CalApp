/**
 * DeepSeek API client — a cost pilot for the cheapest, lowest-stakes AI
 * route (analyze-exercise: plain text in, plain text out, no vision, no
 * tool use) before trusting it anywhere the app's vision scans or the
 * coach's schedule tool-calling depend on Claude-specific behavior. Wire
 * format is OpenAI-compatible chat completions, not the Anthropic SDK.
 *
 * Entirely optional: with no DEEPSEEK_API_KEY set, deepseekConfigured()
 * returns false and every caller falls back to the existing Claude path —
 * this can ship before the key exists on Railway without doing anything.
 */
const API_URL = 'https://api.deepseek.com/chat/completions';

// Current generation as of the September 2026 V4.1 release — the legacy
// `deepseek-chat` alias for this same model already retired, so the
// concrete id is used directly rather than the alias.
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash';

// DeepSeek's vision support is a separate, experimental entry point on the
// same V4.1 Flash model — `deepseek-flash` is the current canonical name
// DeepSeek's own docs point to for multimodal calls (the older
// `deepseek-v4-flash-vision-exp` alias still routes to it too). Every image
// is capped at 384 tokens for billing *and* detail, regardless of
// resolution — a much smaller detail budget than Claude gets for the same
// photo — which is exactly why this is only used for a background shadow
// test (index.ts), never shown to a real user.
const VISION_MODEL = process.env.DEEPSEEK_VISION_MODEL ?? 'deepseek-flash';

export function deepseekConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

export interface DeepseekResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** Text-only completion — the DeepSeek equivalent of index.ts's textCall. */
export async function deepseekTextCall(prompt: string, maxTokens = 1500): Promise<DeepseekResult> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DeepSeek request failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content ?? '';
  return {
    text,
    model: MODEL,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

/** Vision completion — one photo + a text prompt, OpenAI-compatible content-block format. */
export async function deepseekVisionCall(imageBase64Jpeg: string, prompt: string, maxTokens = 2000): Promise<DeepseekResult> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64Jpeg}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DeepSeek vision request failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content ?? '';
  return {
    text,
    model: VISION_MODEL,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}
