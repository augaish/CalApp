// The AI program flow end to end: the real server against a fake Anthropic.
// A build with answers lands training only on the chosen days and never
// plans an allergen (the fake writes almonds on purpose); a draft comes with
// two free changes, then each change costs one action; a question costs
// nothing; only the caller's own draft can be tailored; and an app build
// from before the questions still gets a program.
// Needs Postgres (DATABASE_URL) — spawns its own server on 8792.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';

const DB = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost/calgym?host=/opt/calgym-pg/pgsock&port=5433';
const run = Date.now().toString(36);
const ALICE = `u_progalice_${run}`;
const BOB = `u_progbob_${run}`;

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

const item = (name, calories = 400) => ({ name, portion: '1 plate', calories, proteinG: 30, carbsG: 40, fatG: 12 });
const meal = (slot, name) => ({ slot, name, items: [item(name)] });
const week = () =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    meals: [
      // Almonds on Sunday and Wednesday: the server must send these back.
      meal('breakfast', weekday === 0 || weekday === 3 ? 'Oats with almonds' : 'Eggs and toast'),
      meal('lunch', 'Grilled chicken and rice'),
      meal('dinner', 'Lentil soup'),
    ],
  }));
const seen = [];

// ── Fake Anthropic ──
const ai = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    const tool = body.tools?.[0]?.name;
    const user = String(body.messages?.at(-1)?.content ?? '');
    seen.push({ tool, user, system: String(body.system ?? '') });
    let input;
    if (tool === 'propose_program') {
      const props = body.tools[0].input_schema.properties;
      input = {
        summary: 'Test program',
        durationWeeks: 8,
        targets: { calories: 2300, proteinG: 160, carbsG: 250, fatG: 70 },
        // Training on Monday, Tuesday, Wednesday, Friday — not what was chosen.
        ...(props.schedule ? { schedule: { days: [1, 2, 3, 5].map((weekday, i) => ({ weekday, title: ['Push', 'Pull', 'Legs', 'Arms'][i], exercises: [{ name: 'Bench Press', sets: 3, reps: '8' }] })) } } : {}),
        ...(props.mealPlan ? { mealPlan: { days: week() } } : {}),
      };
    } else if (/must be replaced/.test(user)) {
      // The repair: Sunday fixed, Wednesday still wrong — so it must be dropped.
      input = { reply: '', changes: ['fixed'], mealPlanDays: [
        { weekday: 0, meals: [meal('breakfast', 'Eggs and toast'), meal('lunch', 'Grilled chicken and rice'), meal('dinner', 'Lentil soup')] },
        { weekday: 3, meals: [meal('breakfast', 'Almond pancakes'), meal('lunch', 'Grilled chicken and rice'), meal('dinner', 'Lentil soup')] },
      ] };
    } else if (/^QUESTION/.test(user)) {
      input = { reply: 'Yes, that is fine.', changes: [] };
    } else if (/^MOVE/.test(user)) {
      input = { reply: 'Moved.', changes: ['Push: Sunday → Monday'], weekdays: [1, 2, 4],
        schedule: { days: [1, 2, 4].map((weekday) => ({ weekday, title: 'Day', exercises: [{ name: 'Squat', sets: 3, reps: '5' }] })) } };
    } else {
      input = { reply: 'Swapped.', changes: ['Tuesday dinner: lentil soup → beef stew'], mealPlanDays: [
        { weekday: 2, meals: [meal('breakfast', 'Eggs and toast'), meal('lunch', 'Grilled chicken and rice'), meal('dinner', 'Beef stew')] },
      ] };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: body.model, stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu_1', name: tool, input }],
      usage: { input_tokens: 100, output_tokens: 100 },
    }));
  });
}).listen(8793);

async function startServer(port) {
  try { await fetch(`http://127.0.0.1:${port}/health`); throw new Error(`port ${port} is already in use`); } catch (e) { if (/in use/.test(e.message)) throw e; }
  const env = { ...process.env, DATABASE_URL: DB, PORT: String(port), ADMIN_TOKEN: 'e2e-admin', REVENUECAT_WEBHOOK_SECRET: 'e2e-hook',
    ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: 'http://127.0.0.1:8793' };
  delete env.DEEPSEEK_API_KEY;
  // SERVER_LOG=path keeps the server's output for when something fails.
  const out = process.env.SERVER_LOG ? openSync(process.env.SERVER_LOG, 'w') : 'ignore';
  const child = spawn('npx', ['tsx', 'src/index.ts'], { cwd: '/home/user/CalApp/server', env, stdio: ['ignore', out, out], detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return child; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}
const call = async (path, { ref, method = 'GET', body, admin } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (ref) headers['x-calgym-user'] = ref;
  if (admin) headers['x-admin-token'] = 'e2e-admin';
  const res = await fetch(`http://127.0.0.1:8792${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

const server = await startServer(8792);
try {
  await call('/admin/api/plan', { method: 'POST', admin: true, body: { ref: ALICE, plan: 'proPlus' } });
  const usage = async () => (await call('/api/me', { ref: ALICE })).json?.usage ?? {};

  console.log('=== Build with answers ===');
  const answers = { scope: 'both', weekdays: [0, 2, 4], sessionMinutes: 45, place: 'gym', experience: 'beginner', mealsPerDay: '3', eatingStyle: 'any', allergies: ['nuts'], goal: 'lose', pace: 'steady' };
  const built = await call('/api/generate-program', { ref: ALICE, method: 'POST', body: { language: 'en', answers } });
  const p = built.json ?? {};
  check('build succeeds', built.status === 200, `${built.status} ${JSON.stringify(p).slice(0, 200)}`);
  check('prompt carries the answers as hard rules', /ONLY on these weekdays: 0, 2, 4/.test(seen[0]?.system ?? '') && /ALLERGIES \(never include.*nuts/.test(seen[0]?.system ?? ''));
  check('training only on Sun, Tue, Thu', p.schedule?.days?.map((d) => d.weekday).join() === '0,2,4', p.schedule?.days?.map((d) => d.weekday).join());
  check('no meal names a nut', !JSON.stringify(p.mealPlan ?? {}).toLowerCase().includes('almond'));
  check('the repaired Sunday breakfast is kept', p.mealPlan?.days?.find((d) => d.weekday === 0)?.meals.some((m) => m.slot === 'breakfast' && m.name === 'Eggs and toast'));
  check('the meal still wrong after repair is dropped, the day stays', (() => { const wed = p.mealPlan?.days?.find((d) => d.weekday === 3); return !!wed && !wed.meals.some((m) => m.slot === 'breakfast'); })());
  check('one repair call, not a rebuild', seen.filter((s) => s.tool === 'revise_program').length === 1);
  check('draft id and 2 free changes', typeof p.draftId === 'string' && p.freeChanges === 2);
  check('build metered as a program', (await usage()).program > 0, JSON.stringify(await usage()));

  console.log('=== Tailor: 2 free, then 1 action each ===');
  const { draftId, freeChanges: _f, ...program } = p;
  const tailor = (request, ref = ALICE, id = draftId, prog = program, ans = answers) =>
    call('/api/tailor-program', { ref, method: 'POST', body: { language: 'en', answers: ans, program: prog, request, history: [], draftId: id } });
  let r = await tailor('Swap Tuesday dinner');
  check('change 1 is free', r.status === 200 && r.json.charged === false && r.json.freeLeft === 1, JSON.stringify({ s: r.status, c: r.json?.charged, l: r.json?.freeLeft }));
  check('only Tuesday changed', r.json.program.mealPlan.days.find((d) => d.weekday === 2).meals.at(-1).name === 'Beef stew' && r.json.program.mealPlan.days.find((d) => d.weekday === 1).meals.at(-1).name === 'Lentil soup');
  check('what changed comes back', r.json.changes[0] === 'Tuesday dinner: lentil soup → beef stew');
  check('tailoring sees only changed parts schema', seen.at(-1).tool === 'revise_program');
  r = await tailor('QUESTION is 3 days enough?');
  check('a question changes nothing and costs nothing', r.status === 200 && r.json.charged === false && r.json.freeLeft === 1 && r.json.changes.length === 0, JSON.stringify({ c: r.json?.charged, l: r.json?.freeLeft }));
  r = await tailor('Swap Tuesday dinner again');
  check('change 2 is free', r.json.charged === false && r.json.freeLeft === 0);
  check('no tailor action used yet', !(await usage()).tailor);
  r = await tailor('Swap once more');
  check('change 3 costs 1 action', r.status === 200 && r.json.charged === true, JSON.stringify({ s: r.status, c: r.json?.charged }));
  check('…metered as tailor, weight 1', (await usage()).tailor === 1, JSON.stringify(await usage()));
  r = await tailor('QUESTION one more?');
  check('a paid-period question is refunded', r.json.charged === false && (await usage()).tailor === 1);

  console.log('=== Moving days in the chat ===');
  r = await tailor('MOVE push day to Monday');
  check('new days are kept and become the answers', r.json.program.schedule.days.map((d) => d.weekday).join() === '1,2,4' && r.json.answers.weekdays.join() === '1,2,4', JSON.stringify(r.json?.answers?.weekdays));

  console.log('=== Only your own draft ===');
  r = await tailor('Swap', BOB);
  check("Bob can't tailor Alice's draft", r.status === 404 && r.json.error === 'no_draft', String(r.status));
  r = await tailor('Swap', ALICE, 'made-up-id');
  check('a made-up draft is refused', r.status === 404);
  r = await tailor('Swap', ALICE, '');
  check('no draft id is refused', r.status === 404);
  r = await tailor('x');
  check('an empty request is refused', r.status === 400);

  console.log('=== Scopes and older apps ===');
  const trainingOnly = await call('/api/generate-program', { ref: ALICE, method: 'POST', body: { language: 'en', answers: { scope: 'training', weekdays: [1, 3, 5] } } });
  check('training-only: no meal plan asked or returned', trainingOnly.status === 200 && !trainingOnly.json.mealPlan && !seen.at(-1).system.includes('MEAL PLAN:') && trainingOnly.json.schedule.days.map((d) => d.weekday).join() === '1,3,5', JSON.stringify(trainingOnly.json).slice(0, 150));
  const foodOnly = await call('/api/generate-program', { ref: ALICE, method: 'POST', body: { language: 'en', answers: { scope: 'food', eatingStyle: 'vegetarian' } } });
  check('food-only: no schedule', foodOnly.status === 200 && !foodOnly.json.schedule && !!foodOnly.json.mealPlan);
  check('vegetarian: the chicken lunch is gone', !JSON.stringify(foodOnly.json.mealPlan).includes('chicken'));
  const legacy = await call('/api/generate-program', { ref: ALICE, method: 'POST', body: { language: 'en' } });
  check('an app from before the questions still gets a full program', legacy.status === 200 && !!legacy.json.schedule && !!legacy.json.mealPlan && legacy.json.schedule.days.length === 4);
} finally {
  process.kill(-server.pid, 'SIGTERM');
  ai.close();
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
