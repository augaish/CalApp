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
// photo. Fine for a plate of food (the shadow test showed it matching
// Claude's reads closely); not fine for reading small print, which is why
// body-composition reports stay on Claude.
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

/**
 * A reasoning model's hidden thinking shares max_tokens with its answer; when
 * the thinking uses it all, the reply arrives with finish_reason=length and
 * no content. Typed so the retry can raise the budget instead of repeating
 * the same call and losing the same way.
 */
export class DeepseekBudgetError extends Error {
  constructor(detail: string) {
    super(`DeepSeek ran out of tokens before answering: ${detail}`);
    this.name = 'DeepseekBudgetError';
  }
}

/**
 * The reply's text, or a typed failure. A reply that is tool-call markup
 * (the model trying to invoke a tool it was not given) is a failure too:
 * it has no JSON in it and would surface as "could not read that meal".
 */
export function readTextReply(json: DeepseekChatResponse, what = 'DeepSeek reply'): string {
  const choice = json.choices?.[0];
  const text = choice?.message?.content ?? '';
  if (!text) {
    if (choice?.finish_reason === 'length') throw new DeepseekBudgetError(describeEmptyReply(json));
    throw new Error(`${what} had no content: ${describeEmptyReply(json)}`);
  }
  if (/DSML|<invoke\b|<tool_call\b|<function_call\b/.test(text)) {
    throw new Error(`${what} was tool-call markup, not an answer: ${text.slice(0, 160)}`);
  }
  return text;
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
  const json = (await res.json()) as DeepseekChatResponse;
  const text = readTextReply(json);
  return {
    text,
    model: MODEL,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

interface DeepseekToolCallWire {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

export interface DeepseekChatResponse {
  choices?: {
    message?: { content?: string; reasoning_content?: string; tool_calls?: DeepseekToolCallWire[] };
    finish_reason?: string;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * A 200 response with empty `content` has happened for reasons a blank
 * string can't explain (finish_reason, a reasoning-model split into
 * reasoning_content, a moderation refusal) — dump enough of the raw
 * response to actually diagnose it instead of guessing.
 */
function describeEmptyReply(json: DeepseekChatResponse): string {
  const choice = json.choices?.[0];
  const bits = [
    `finish_reason=${choice?.finish_reason ?? 'unknown'}`,
    choice?.message?.reasoning_content ? `reasoning_content=${choice.message.reasoning_content.slice(0, 200)}` : null,
  ].filter(Boolean);
  return `${bits.join(', ')} raw=${JSON.stringify(json).slice(0, 400)}`;
}

// ── Tool calling ───────────────────────────────────────────────────────────

/** A tool the model may call, in OpenAI's function-calling shape. The
 * `parameters` object is plain JSON Schema — the same schema Anthropic takes
 * as `input_schema`, so our existing tool definitions convert by renaming
 * one field (see toDeepseekTool in index.ts). */
export interface DeepseekTool {
  type: 'function';
  function: { name: string; description?: string; parameters: unknown };
}

export interface DeepseekChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepseekToolResult extends DeepseekResult {
  /** Every tool the model chose to call, with `arguments` already parsed.
   * Empty when it answered in prose instead — which is the normal case for
   * an optional tool like the coach's schedule proposal. */
  toolCalls: { name: string; args: unknown }[];
}

/**
 * Chat completion that may return tool calls. Unlike the plain text/vision
 * helpers, an empty `content` is NOT an error here: a model that answers
 * purely by calling a tool legitimately sends no prose with it.
 *
 * `forceTool` names a tool the model must call (OpenAI's tool_choice), for
 * the cases where the whole point of the request is a structured payload.
 */
export async function deepseekToolCall(
  messages: DeepseekChatMessage[],
  tools: DeepseekTool[],
  maxTokens = 4000,
  forceTool?: string,
): Promise<DeepseekToolResult> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');
  const send = (msgs: DeepseekChatMessage[], toolChoice: unknown) =>
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: msgs, tools, tool_choice: toolChoice }),
    });
  let res = await send(messages, forceTool ? { type: 'function', function: { name: forceTool } } : 'auto');
  // Naming the one function to call is refused by some DeepSeek models (the
  // reasoning ones reject a forced tool_choice with a 400), which failed the
  // recipe and programme routes outright. Ask again with the choice left to
  // the model and an instruction to use that function; the callers also read
  // a JSON answer written as plain text, so either way something usable comes back.
  if (!res.ok && res.status === 400 && forceTool) {
    const first = await res.text().catch(() => '');
    console.warn(`DeepSeek refused forced tool "${forceTool}", retrying unforced: ${first.slice(0, 200)}`);
    res = await send(
      [...messages, { role: 'system', content: `Answer by calling the function "${forceTool}" with the complete result. Do not reply in prose.` }],
      'auto',
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DeepSeek tool request failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as DeepseekChatResponse;
  const message = json.choices?.[0]?.message;
  const toolCalls: { name: string; args: unknown }[] = [];
  for (const call of message?.tool_calls ?? []) {
    const name = call.function?.name;
    if (!name) continue;
    try {
      toolCalls.push({ name, args: JSON.parse(call.function?.arguments ?? '{}') });
    } catch {
      // A tool call truncated mid-JSON (the reasoning budget ran out) is
      // dropped rather than thrown: the caller's sanitizer would reject it
      // anyway, and for an optional tool the prose reply still stands.
      console.warn(`DeepSeek tool call "${name}" had unparseable arguments; ignoring it`);
    }
  }
  const text = message?.content ?? '';
  // Only a reply with neither prose nor a usable tool call is a real failure.
  if (!text && toolCalls.length === 0) {
    throw new Error(`DeepSeek tool reply was empty: ${describeEmptyReply(json)}`);
  }
  return {
    text,
    toolCalls,
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
  const json = (await res.json()) as DeepseekChatResponse;
  const text = readTextReply(json, 'DeepSeek vision reply');
  return {
    text,
    model: VISION_MODEL,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}
