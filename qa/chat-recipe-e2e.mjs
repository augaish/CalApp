// A recipe written in AI Support costs what the recipe generator costs (2),
// charged once and filed as a recipe, not a coach message (R04). A plain
// coach reply still costs 1. Without room for a recipe, the reply comes back
// without it and says why, and only the message is charged.
// Needs Postgres (DATABASE_URL) — spawns its own server on 8792 and a fake
// Anthropic on 8793.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import pg from '/home/user/CalApp/server/node_modules/pg/lib/index.js';

const DB = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost/calgym?host=/opt/calgym-pg/pgsock&port=5433';
const run = Date.now().toString(36);
const ALICE = `u_chatrecipe_${run}`;
const BEN = `u_chatrecipe_low_${run}`;

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

const RECIPE = {
  name: 'Oats & Yogurt Breakfast Bowl', servings: 2, prepMinutes: 10, cookMinutes: 3,
  ingredients: [
    { name: 'Rolled oats', key: 'rolled_oats', amount: 80, unit: 'g', calories: 300, proteinG: 10, carbsG: 54, fatG: 5 },
    { name: 'Greek yogurt', key: 'greek_yogurt', amount: 300, unit: 'g', calories: 220, proteinG: 30, carbsG: 12, fatG: 6 },
  ],
  steps: ['Mix the oats and yogurt.', 'Serve cold.'],
};

// ── Fake Anthropic: "RECIPE …" gets a write_recipe call, anything else plain text ──
const ai = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    const user = String(body.messages?.at(-1)?.content ?? '');
    const canRecipe = (body.tools ?? []).some((t) => t.name === 'write_recipe');
    const content = /^RECIPE/.test(user) && canRecipe
      ? [{ type: 'text', text: 'Here is a breakfast bowl.' }, { type: 'tool_use', id: 'tu_1', name: 'write_recipe', input: RECIPE }]
      : [{ type: 'text', text: 'Sure — keep protein high at breakfast.' }];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', content, usage: { input_tokens: 100, output_tokens: 100 } }));
  });
}).listen(8793);

async function startServer(port) {
  try { await fetch(`http://127.0.0.1:${port}/health`); throw new Error(`port ${port} is already in use`); } catch (e) { if (/in use/.test(e.message)) throw e; }
  const env = { ...process.env, DATABASE_URL: DB, PORT: String(port), ADMIN_TOKEN: 'e2e-admin', REVENUECAT_WEBHOOK_SECRET: 'e2e-hook',
    ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: 'http://127.0.0.1:8793' };
  delete env.DEEPSEEK_API_KEY;
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
const me = async (ref) => (await call('/api/me', { ref })).json ?? {};
const coach = (ref, text) => call('/api/coach', { ref, method: 'POST', body: { language: 'en', messages: [{ role: 'user', content: text }] } });

const server = await startServer(8792);
try {
  await call('/admin/api/plan', { method: 'POST', admin: true, body: { ref: ALICE, plan: 'pro' } });
  await call('/admin/api/plan', { method: 'POST', admin: true, body: { ref: BEN, plan: 'pro' } });

  let before = await me(ALICE);
  const plain = await coach(ALICE, 'What should I eat for breakfast?');
  let after = await me(ALICE);
  check('a plain coach reply costs 1', plain.status === 200 && after.used - before.used === 1, `${plain.status} ${before.used} → ${after.used}`);

  before = after;
  const r = await coach(ALICE, 'RECIPE a high-protein breakfast');
  after = await me(ALICE);
  check('the reply carries the recipe', r.status === 200 && r.json?.recipeDraft?.name === RECIPE.name, `${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
  check('a recipe in chat costs 2, once', after.used - before.used === 2, `${before.used} → ${after.used}`);
  check('filed as a recipe, not a coach message', (after.usage?.recipe ?? 0) - (before.usage?.recipe ?? 0) === 2 && (after.usage?.coach ?? 0) === (before.usage?.coach ?? 0), JSON.stringify(after.usage));

  // Ben has exactly one action left: enough for a message, not for a recipe.
  const limit = (await me(BEN)).limit;
  const db = new pg.Pool({ connectionString: DB });
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
  await db.query(`INSERT INTO usage_counters (ref, period, kind, count) VALUES ($1, $2, 'meal', $3)`, [BEN, period, limit - 1]);
  await db.end();
  const low = await coach(BEN, 'RECIPE a high-protein breakfast');
  const benAfter = await me(BEN);
  check('without room: no recipe, and the reply says why', low.status === 200 && !low.json?.recipeDraft && /takes 2 AI actions/.test(low.json?.reply ?? ''), JSON.stringify(low.json).slice(0, 200));
  check('without room: only the message is charged (1)', benAfter.used === limit && (benAfter.usage?.recipe ?? 0) === 0, `${benAfter.used}/${limit} ${JSON.stringify(benAfter.usage)}`);
} finally {
  try { process.kill(-server.pid); } catch {}
  ai.close();
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
