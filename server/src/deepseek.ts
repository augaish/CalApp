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
