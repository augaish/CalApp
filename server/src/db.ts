import pg from 'pg';

import type { Language } from './prompts.js';

/**
 * Optional Postgres-backed cache for equipment analyses. When DATABASE_URL is
 * unset the cache is disabled and the server falls back to always calling the
 * model — so it runs fine locally with no database.
 */
const url = process.env.DATABASE_URL;

const pool = url
  ? new pg.Pool({
      connectionString: url,
      ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false },
      max: 4,
    })
  : null;

export const cacheEnabled = !!pool;

export async function initDb(): Promise<void> {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS equipment_cache (
      canonical TEXT NOT NULL,
      language  TEXT NOT NULL,
      analysis  JSONB NOT NULL,
      hits      INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (canonical, language)
    );
  `);
  // Accounts. `ref` is whatever identifies the caller today (a device id) and
  // later the auth user id — the rest of the billing model never changes.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      ref          TEXT PRIMARY KEY,
      plan         TEXT NOT NULL DEFAULT 'free',
      plan_source  TEXT NOT NULL DEFAULT 'none',
      plan_until   TIMESTAMPTZ,
      note         TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // One row per user per billing month, so caps reset naturally and we can
  // report cost per user without storing every request.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usage_counters (
      ref     TEXT NOT NULL,
      period  TEXT NOT NULL,
      kind    TEXT NOT NULL,
      count   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (ref, period, kind)
    );
  `);
  // Small key/value store for runtime settings the admin page edits (plan
  // limits, the rented sponsor slot, …) so changes need no redeploy.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
  `);
}

// ── Accounts & entitlement ────────────────────────────────────────────────

export type Plan = 'free' | 'pro' | 'proPlus';

export interface AppUser {
  ref: string;
  plan: Plan;
  planSource: string;
  planUntil: string | null;
  note: string | null;
}

/** Fetch (creating on first sight) the caller's account row. */
export async function getOrCreateUser(ref: string): Promise<AppUser | null> {
  if (!pool) return null;
  try {
    const res = await pool.query(
      `INSERT INTO app_users (ref) VALUES ($1)
       ON CONFLICT (ref) DO UPDATE SET last_seen_at = now()
       RETURNING ref, plan, plan_source, plan_until, note`,
      [ref],
    );
    const r = res.rows[0];
    // An expired grant silently falls back to free.
    const expired = r.plan_until && new Date(r.plan_until).getTime() < Date.now();
    return {
      ref: r.ref,
      plan: expired ? 'free' : (r.plan as Plan),
      planSource: r.plan_source,
      planUntil: r.plan_until ? new Date(r.plan_until).toISOString() : null,
      note: r.note,
    };
  } catch (err) {
    console.error('getOrCreateUser failed:', err);
    return null;
  }
}

/** Grant or revoke Pro (admin, and later the billing webhook). */
export async function setUserPlan(
  ref: string,
  plan: Plan,
  source: string,
  until: string | null,
  note?: string,
): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO app_users (ref, plan, plan_source, plan_until, note)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (ref) DO UPDATE
       SET plan = EXCLUDED.plan,
           plan_source = EXCLUDED.plan_source,
           plan_until = EXCLUDED.plan_until,
           note = COALESCE(EXCLUDED.note, app_users.note)`,
    [ref, plan, source, until, note ?? null],
  );
}

// ── Usage metering ────────────────────────────────────────────────────────

/** Billing period key: the calendar month the usage counts against. */
export function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Total AI actions used this period (all kinds). */
export async function getUsage(ref: string, period = currentPeriod()): Promise<number> {
  if (!pool) return 0;
  try {
    const res = await pool.query(
      'SELECT COALESCE(SUM(count), 0)::int AS n FROM usage_counters WHERE ref = $1 AND period = $2',
      [ref, period],
    );
    return res.rows[0]?.n ?? 0;
  } catch (err) {
    console.error('getUsage failed:', err);
    return 0;
  }
}

/** Record one AI action. Returns the new period total. */
export async function recordUsage(ref: string, kind: string): Promise<number> {
  if (!pool) return 0;
  try {
    await pool.query(
      `INSERT INTO usage_counters (ref, period, kind, count) VALUES ($1, $2, $3, 1)
       ON CONFLICT (ref, period, kind) DO UPDATE SET count = usage_counters.count + 1`,
      [ref, currentPeriod(), kind],
    );
    return await getUsage(ref);
  } catch (err) {
    console.error('recordUsage failed:', err);
    return 0;
  }
}

// ── Settings ──────────────────────────────────────────────────────────────

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  if (!pool) return fallback;
  try {
    const res = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
    return (res.rows[0]?.value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)],
  );
}

// ── Admin reporting ───────────────────────────────────────────────────────

export interface AdminRow {
  ref: string;
  plan: string;
  planSource: string;
  planUntil: string | null;
  note: string | null;
  used: number;
  createdAt: string;
  lastSeenAt: string;
}

export async function listUsers(limit = 200): Promise<AdminRow[]> {
  if (!pool) return [];
  const period = currentPeriod();
  const res = await pool.query(
    `SELECT u.ref, u.plan, u.plan_source, u.plan_until, u.note, u.created_at, u.last_seen_at,
            COALESCE((SELECT SUM(c.count) FROM usage_counters c
                      WHERE c.ref = u.ref AND c.period = $1), 0)::int AS used
       FROM app_users u
      ORDER BY u.last_seen_at DESC
      LIMIT $2`,
    [period, limit],
  );
  return res.rows.map((r) => ({
    ref: r.ref,
    plan: r.plan,
    planSource: r.plan_source,
    planUntil: r.plan_until ? new Date(r.plan_until).toISOString() : null,
    note: r.note,
    used: r.used,
    createdAt: new Date(r.created_at).toISOString(),
    lastSeenAt: new Date(r.last_seen_at).toISOString(),
  }));
}

export interface AdminStats {
  totalUsers: number;
  proUsers: number;
  activeThisMonth: number;
  actionsThisMonth: number;
}

export async function adminStats(): Promise<AdminStats> {
  if (!pool) return { totalUsers: 0, proUsers: 0, activeThisMonth: 0, actionsThisMonth: 0 };
  const period = currentPeriod();
  const res = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM app_users) AS total_users,
       (SELECT COUNT(*)::int FROM app_users
         WHERE plan = 'pro' AND (plan_until IS NULL OR plan_until > now())) AS pro_users,
       (SELECT COUNT(DISTINCT ref)::int FROM usage_counters WHERE period = $1) AS active_month,
       (SELECT COALESCE(SUM(count), 0)::int FROM usage_counters WHERE period = $1) AS actions_month`,
    [period],
  );
  const r = res.rows[0];
  return {
    totalUsers: r.total_users,
    proUsers: r.pro_users,
    activeThisMonth: r.active_month,
    actionsThisMonth: r.actions_month,
  };
}

/** Normalize a machine name to a stable cache key. */
export function canonicalKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

export async function getCachedEquipment(
  canonical: string,
  language: Language,
): Promise<unknown | null> {
  if (!pool) return null;
  try {
    const res = await pool.query(
      'UPDATE equipment_cache SET hits = hits + 1 WHERE canonical = $1 AND language = $2 RETURNING analysis',
      [canonical, language],
    );
    return res.rows[0]?.analysis ?? null;
  } catch (err) {
    console.error('cache read failed:', err);
    return null;
  }
}

export async function setCachedEquipment(
  canonical: string,
  language: Language,
  analysis: unknown,
): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO equipment_cache (canonical, language, analysis)
       VALUES ($1, $2, $3)
       ON CONFLICT (canonical, language) DO UPDATE SET analysis = EXCLUDED.analysis`,
      [canonical, language, JSON.stringify(analysis)],
    );
  } catch (err) {
    console.error('cache write failed:', err);
  }
}
