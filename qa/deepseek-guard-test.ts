// The two failure shapes from the Railway log, and the prompt that caused
// one of them: DeepSeek told about a web_search tool it does not have.
import { DeepseekBudgetError, readTextReply } from '/home/user/CalApp/server/src/deepseek.ts';
import { refineMealPrompt, textMealPrompt } from '/home/user/CalApp/server/src/prompts.ts';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const throwsWith = (fn: () => unknown, pattern: RegExp, cls?: new (...a: never[]) => Error): string => {
  try {
    fn();
    return 'did not throw';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (cls && !(e instanceof cls)) return `wrong class ${e instanceof Error ? e.name : typeof e}`;
    return pattern.test(msg) ? 'ok' : `unexpected message: ${msg.slice(0, 80)}`;
  }
};

// ── prompts ──
const claude = textMealPrompt('ar', 'قشطة المراعي كامل الدسم');
const ds = textMealPrompt('ar', 'قشطة المراعي كامل الدسم', { canSearch: false });
check('Claude prompt still names the web_search tool', /web_search/.test(claude));
check('DeepSeek prompt never names a tool', !/web_search|tool/i.test(ds.replace(/tool-call markup|attempt a tool call|NO tools/g, '')), ds.match(/.{0,30}tool.{0,30}/g)?.join(' | '));
check('  and says plainly that it cannot search', /cannot search the web/.test(ds));
check('  and asks for brief reasoning', /Keep any reasoning short/.test(ds));
check('  and still asks for the same JSON schema', /"items": \[/.test(ds) && /"confidence": number/.test(ds));
const dsRefine = refineMealPrompt('en', [{ name: 'Rice', calories: 300, proteinG: 6, carbsG: 65, fatG: 1, portion: '1 cup' }], 'it was a big plate', { canSearch: false });
check('refine prompt has the same no-tools variant', /cannot search the web/.test(dsRefine) && !/web_search/.test(dsRefine));

// ── reply guard ──
const reasoningOnly = { choices: [{ message: { content: '', reasoning_content: 'We need answer JSON only. Need parse meal…' }, finish_reason: 'length' }], usage: { prompt_tokens: 900, completion_tokens: 4000 } };
check('reasoning that spent the whole budget is a budget error', throwsWith(() => readTextReply(reasoningOnly), /ran out of tokens/, DeepseekBudgetError) === 'ok', throwsWith(() => readTextReply(reasoningOnly), /ran out of tokens/, DeepseekBudgetError));
const emptyStop = { choices: [{ message: { content: '' }, finish_reason: 'stop' }] };
check('an empty reply that simply stopped is a plain failure', throwsWith(() => readTextReply(emptyStop), /had no content/) === 'ok' && !(() => { try { readTextReply(emptyStop); return false; } catch (e) { return e instanceof DeepseekBudgetError; } })());
const dsml = { choices: [{ message: { content: '<｜DSML｜ calls>\n<｜DSML｜ invoke name="web_search">\n<｜DSML｜ parameter name="query" string="true">قشطة المراعي</｜DSML｜ parameter>' }, finish_reason: 'stop' }] };
check('tool-call markup is a failure, not an answer', throwsWith(() => readTextReply(dsml), /tool-call markup/) === 'ok', throwsWith(() => readTextReply(dsml), /tool-call markup/));
const good = { choices: [{ message: { content: '{"items":[{"name":"قشطة","calories":330,"proteinG":6,"carbsG":4,"fatG":33,"portion":"100 g"}],"confidence":0.7,"notes":"تقدير"}' }, finish_reason: 'stop' }] };
check('a real answer passes through unchanged', readTextReply(good) === good.choices[0].message.content);
const jsonWithToolWord = { choices: [{ message: { content: '{"items":[],"confidence":0,"notes":"No tool was used"}' }, finish_reason: 'stop' }] };
check('the word "tool" inside a JSON answer is not mistaken for markup', readTextReply(jsonWithToolWord).startsWith('{'));

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
