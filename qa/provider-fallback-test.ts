// The recipe/programme routes: one AI failing must not fail the request
// while the other can answer; and DeepSeek refusing a forced tool is asked again.
import { withProviderFallback } from '/home/user/CalApp/server/src/provider-fallback.ts';
import { deepseekToolCall } from '/home/user/CalApp/server/src/deepseek.ts';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

const logged: { route: string; code: string; detail: string }[] = [];
const deps = (both = true) => ({
  available: (p: string) => both || p === 'deepseek',
  record: async (f: { route: string; code: string; detail: string }) => { logged.push(f); },
});
const bad400 = () => Promise.reject(new Error('DeepSeek tool request failed: 400 {"error":{"message":"tool_choice not supported"}}'));

const r1 = await withProviderFallback('/r', 'deepseek', { deepseek: bad400, claude: async () => ({ ok: 'claude' }) }, deps());
check('DeepSeek failing hands the request to Claude', (r1 as { ok: string })?.ok === 'claude', JSON.stringify(r1));
check('  and the fallback is written to the failures log', logged.length === 1 && logged[0].code === 'ai_bad_request' && /deepseek \(fell back\)/.test(logged[0].detail), JSON.stringify(logged));

const r2 = await withProviderFallback('/r', 'claude', { deepseek: async () => ({ ok: 'ds' }), claude: () => Promise.reject(Object.assign(new Error('overloaded'), { status: 529 })) }, deps());
check('Claude failing hands the request to DeepSeek', (r2 as { ok: string })?.ok === 'ds');

const r3 = await withProviderFallback('/r', 'deepseek', { deepseek: async () => undefined, claude: async () => ({ ok: 'claude' }) }, deps());
check('an unusable answer also falls back', (r3 as { ok: string })?.ok === 'claude');

let claudeCalled = false;
await withProviderFallback('/r', 'deepseek', { deepseek: async () => ({ ok: 'ds' }), claude: async () => { claudeCalled = true; return { ok: 'c' }; } }, deps());
check('a working first choice is the only call made', !claudeCalled);

let threw: unknown = null;
try {
  await withProviderFallback('/r', 'deepseek', { deepseek: bad400, claude: async () => ({ ok: 'c' }) }, deps(false));
} catch (e) { threw = e; }
check('with no second AI configured, the original error still comes back', threw instanceof Error && /400/.test((threw as Error).message));

threw = null;
try {
  await withProviderFallback('/r', 'deepseek', { deepseek: bad400, claude: () => Promise.reject(new Error('claude down')) }, deps());
} catch (e) { threw = e; }
check('when both fail, the last error comes back for the usual message', threw instanceof Error && /claude down/.test((threw as Error).message));

const r4 = await withProviderFallback('/r', 'deepseek', { deepseek: async () => null, claude: async () => null }, deps());
check('when both answer unusably, the route gets null (analysis_failed)', r4 === null);

// ── DeepSeek: a refused forced tool is retried unforced ──
process.env.DEEPSEEK_API_KEY = 'test';
const bodies: Record<string, unknown>[] = [];
globalThis.fetch = (async (_url: string, init: { body: string }) => {
  const body = JSON.parse(init.body);
  bodies.push(body);
  if (typeof body.tool_choice === 'object') {
    return new Response(JSON.stringify({ error: { message: 'Thinking mode does not support this tool_choice', type: 'invalid_request_error' } }), { status: 400 });
  }
  return new Response(JSON.stringify({
    choices: [{ message: { content: '', tool_calls: [{ function: { name: 'write_recipe', arguments: '{"title":"Kabsa"}' } }] } }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  }), { status: 200 });
}) as unknown as typeof fetch;
const ds = await deepseekToolCall([{ role: 'user', content: 'kabsa' }], [], 1000, 'write_recipe');
check('a 400 on the forced tool is asked again without forcing', bodies.length === 2 && bodies[1].tool_choice === 'auto');
check('  telling the model which function to use', JSON.stringify(bodies[1].messages).includes('write_recipe'));
check('  and the tool call from the second answer comes through', ds.toolCalls[0]?.name === 'write_recipe' && (ds.toolCalls[0].args as { title: string }).title === 'Kabsa');

bodies.length = 0;
await deepseekToolCall([{ role: 'user', content: 'kabsa' }], [], 1000, 'write_recipe');
check('after one refusal, later calls go straight to the accepted form (one request)', bodies.length === 1 && bodies[0].tool_choice === 'auto', JSON.stringify(bodies.map((b) => b.tool_choice)));

bodies.length = 0;
globalThis.fetch = (async (_u: string, init: { body: string }) => {
  bodies.push(JSON.parse(init.body));
  return new Response('{"error":"bad key"}', { status: 401 });
}) as unknown as typeof fetch;
threw = null;
try { await deepseekToolCall([{ role: 'user', content: 'x' }], [], 1000, 'write_recipe'); } catch (e) { threw = e; }
check('other errors are not retried here (one request, then the error)', bodies.length === 1 && threw instanceof Error && /401/.test((threw as Error).message));

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
