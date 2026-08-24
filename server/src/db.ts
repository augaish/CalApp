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
  // Old id → account id, written when a guest signs in. See resolveRef below.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ref_links (
      from_ref   TEXT PRIMARY KEY,
      to_ref     TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Shared workout plans. The payload used to travel inside the link itself,
  // which produced URLs long enough for chat apps to break in half; it lives
  // here now and the link carries only a short code.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS share_links (
      code       TEXT PRIMARY KEY,
      payload    JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      hits       INTEGER NOT NULL DEFAULT 0
    );
  `);
  // Billing webhooks are retried by the store until acknowledged, so each one
  // is recorded and replays are dropped rather than re-applied.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_events (
      event_id    TEXT PRIMARY KEY,
      ref         TEXT,
      type        TEXT,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Webhooks can also arrive out of order; this remembers how recent the last
  // applied one was so a stale retry cannot undo a newer state.
  await pool.query(
    `ALTER TABLE app_users ADD COLUMN IF NOT EXISTS plan_event_ms BIGINT NOT NULL DEFAULT 0`,
  );
  // The address a signed-in account uses, so support has something human to
  // recognise a row by. Guests never have one.
  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT`);
  // What the row was last seen on — set from the launch ping, so it covers
  // guests too, not only signed-in accounts.
  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS device TEXT`);
}

/**
 * Record a webhook as handled. Returns false when it has been seen before, so
 * the caller can skip it — stores retry aggressively and a replayed renewal
 * must not extend anyone twice.
 */
export async function claimBillingEvent(
  eventId: string,
  ref: string | null,
  type: string | null,
): Promise<boolean> {
  if (!pool) return true;
  const res = await pool.query(
    `INSERT INTO billing_events (event_id, ref, type) VALUES ($1, $2, $3)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [eventId, ref, type],
  );
  return (res.rowCount ?? 0) > 0;
}

/** True when this event is not older than the last one applied to the account. */
export async function billingEventIsCurrent(ref: string, eventMs: number): Promise<boolean> {
  if (!pool || !eventMs) return true;
  const res = await pool.query('SELECT plan_event_ms FROM app_users WHERE ref = $1', [ref]);
  const last = Number(res.rows[0]?.plan_event_ms ?? 0);
  return eventMs >= last;
}

export async function markBillingEventApplied(ref: string, eventMs: number): Promise<void> {
  if (!pool || !eventMs) return;
  await pool.query(
    `UPDATE app_users SET plan_event_ms = GREATEST(plan_event_ms, $2) WHERE ref = $1`,
    [ref, eventMs],
  );
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

/**
 * Record the address a signed-in account uses. Sent by the app rather than
 * read from the auth provider, which would mean holding a service-role key on
 * this server for the sake of one column.
 */
export async function setUserEmail(ref: string, email: string): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO app_users (ref, email) VALUES ($1, $2)
     ON CONFLICT (ref) DO UPDATE SET email = EXCLUDED.email`,
    [ref, email],
  );
}

/**
 * Record what device an account was last seen on. Sent with the launch ping
 * (`/api/me`), so it covers every install — guest or signed-in — not only the
 * ones that ever reach a sign-in screen.
 */
export async function setUserDevice(ref: string, device: string): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO app_users (ref, device) VALUES ($1, $2)
     ON CONFLICT (ref) DO UPDATE SET device = EXCLUDED.device`,
    [ref, device],
  );
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

/** Usage of a single action kind this period (e.g. how many coach messages). */
export async function getUsageKind(
  ref: string,
  kind: string,
  period = currentPeriod(),
): Promise<number> {
  if (!pool) return 0;
  try {
    const res = await pool.query(
      'SELECT COALESCE(count, 0)::int AS n FROM usage_counters WHERE ref = $1 AND period = $2 AND kind = $3',
      [ref, period, kind],
    );
    return res.rows[0]?.n ?? 0;
  } catch (err) {
    console.error('getUsageKind failed:', err);
    return 0;
  }
}

export type Reservation =
  | { ok: true; used: number; kindUsed: number }
  | { ok: false; reason: 'quota' | 'cap'; used: number; kindUsed: number };

/**
 * Claim one action against the allowance, checking and incrementing under a
 * lock on the account row. Reading the total and then writing it as two steps
 * let a burst of parallel requests all see "14 of 15 used" and every one of
 * them proceed; holding the row makes that impossible. The lock is per account,
 * so one user's burst never slows anyone else down.
 */
export async function reserveUsage(
  ref: string,
  kind: string,
  limit: number,
  kindCap?: number,
): Promise<Reservation> {
  if (!pool) return { ok: true, used: 0, kindUsed: 0 };
  const period = currentPeriod();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO app_users (ref) VALUES ($1) ON CONFLICT (ref) DO NOTHING', [
      ref,
    ]);
    await client.query('SELECT 1 FROM app_users WHERE ref = $1 FOR UPDATE', [ref]);
    const res = await client.query(
      `SELECT COALESCE(SUM(count), 0)::int AS n,
              COALESCE(SUM(count) FILTER (WHERE kind = $3), 0)::int AS k
         FROM usage_counters WHERE ref = $1 AND period = $2`,
      [ref, period, kind],
    );
    const used = res.rows[0].n as number;
    const kindUsed = res.rows[0].k as number;
    // The shared allowance is the hard stop; a per-kind cap only rations that
    // one feature, so the two are reported apart for the right error.
    if (used >= limit) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'quota', used, kindUsed };
    }
    if (typeof kindCap === 'number' && kindUsed >= kindCap) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'cap', used, kindUsed };
    }
    await client.query(
      `INSERT INTO usage_counters (ref, period, kind, count) VALUES ($1, $2, $3, 1)
       ON CONFLICT (ref, period, kind) DO UPDATE SET count = usage_counters.count + 1`,
      [ref, period, kind],
    );
    await client.query('COMMIT');
    return { ok: true, used: used + 1, kindUsed: kindUsed + 1 };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Hand a reserved action back when the model call itself failed. */
export async function refundUsage(ref: string, kind: string): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `UPDATE usage_counters SET count = GREATEST(0, count - 1)
        WHERE ref = $1 AND period = $2 AND kind = $3`,
      [ref, currentPeriod(), kind],
    );
  } catch (err) {
    // A lost refund only ever costs the user one action; never fail their
    // request over it.
    console.error('refundUsage failed:', err);
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

/**
 * Erase everything we hold for a caller: their account row, every usage
 * counter, and any id aliases pointing at them. Required by the app stores'
 * account-deletion rules.
 */
export async function deleteUser(ref: string): Promise<void> {
  if (!pool) return;
  await pool.query('DELETE FROM usage_counters WHERE ref = $1', [ref]);
  await pool.query('DELETE FROM app_users WHERE ref = $1', [ref]);
  await pool.query('DELETE FROM ref_links WHERE from_ref = $1 OR to_ref = $1', [ref]);
  aliasCache.clear();
}

// ── Shared plans ──────────────────────────────────────────────────────────

/** Unambiguous alphabet: no O/0, I/l/1, so a code can be read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function newCode(len = 8): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** Store a shared plan and return its code. */
export async function createShareLink(
  payload: unknown,
  ttlDays = 180,
): Promise<string | null> {
  if (!pool) return null;
  const expires = new Date(Date.now() + ttlDays * 86400000).toISOString();
  // Retry on the vanishingly unlikely collision rather than overwrite someone
  // else's plan.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const res = await pool.query(
      `INSERT INTO share_links (code, payload, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO NOTHING RETURNING code`,
      [code, JSON.stringify(payload), expires],
    );
    if (res.rows[0]?.code) return res.rows[0].code as string;
  }
  return null;
}

/** Fetch a shared plan, counting the read. Expired codes read as missing. */
export async function readShareLink(code: string): Promise<unknown | null> {
  if (!pool) return null;
  try {
    const res = await pool.query(
      `UPDATE share_links SET hits = hits + 1
        WHERE code = $1 AND expires_at > now()
        RETURNING payload`,
      [code],
    );
    return res.rows[0]?.payload ?? null;
  } catch (err) {
    console.error('readShareLink failed:', err);
    return null;
  }
}

// ── Identity links ────────────────────────────────────────────────────────

/**
 * When a guest signs in, the id the app sends changes from the anonymous
 * install id to the account id. Left alone that would reset the month's usage
 * to zero — free credits on demand — and strand any plan on the old id.
 * `ref_links` maps the old id onto the account permanently, so the install
 * keeps resolving to the same person even after a later sign-out.
 */
const aliasCache = new Map<string, string>();

/** Follow an id to the account that claimed it (or return it unchanged). */
export async function resolveRef(ref: string): Promise<string> {
  if (!pool) return ref;
  const hit = aliasCache.get(ref);
  if (hit) return hit;
  try {
    const res = await pool.query('SELECT to_ref FROM ref_links WHERE from_ref = $1', [ref]);
    const to = res.rows[0]?.to_ref as string | undefined;
    if (!to) return ref;
    // Purely an optimisation, so dropping the whole thing when it grows is fine.
    if (aliasCache.size > 5000) aliasCache.clear();
    aliasCache.set(ref, to);
    return to;
  } catch (err) {
    console.error('resolveRef failed:', err);
    return ref;
  }
}

/** 'taken' means the id was already claimed by a different account. */
export type LinkResult = 'linked' | 'noop' | 'taken';

/**
 * Hand everything the anonymous id accumulated to the signed-in account.
 * Claiming is one-shot: once an id points at an account it can never be
 * re-pointed, so a leaked id cannot be replayed onto a second account.
 */
export async function linkRefs(fromRef: string, toRef: string): Promise<LinkResult> {
  if (!pool || fromRef === toRef) return 'noop';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prior = await client.query('SELECT to_ref FROM ref_links WHERE from_ref = $1', [fromRef]);
    const priorTo = prior.rows[0]?.to_ref as string | undefined;
    if (priorTo) {
      await client.query('ROLLBACK');
      return priorTo === toRef ? 'noop' : 'taken';
    }

    await client.query('INSERT INTO app_users (ref) VALUES ($1) ON CONFLICT (ref) DO NOTHING', [
      toRef,
    ]);

    // Usage moves with the person, so signing in never refills the allowance.
    await client.query(
      `INSERT INTO usage_counters (ref, period, kind, count)
       SELECT $2, period, kind, count FROM usage_counters WHERE ref = $1
       ON CONFLICT (ref, period, kind)
         DO UPDATE SET count = usage_counters.count + EXCLUDED.count`,
      [fromRef, toRef],
    );
    await client.query('DELETE FROM usage_counters WHERE ref = $1', [fromRef]);

    // A plan granted before signing in belongs to the person too — but never
    // let the old id downgrade a plan the account already has.
    await client.query(
      `UPDATE app_users t
          SET plan = f.plan,
              plan_source = f.plan_source,
              plan_until = f.plan_until,
              note = COALESCE(t.note, f.note)
         FROM app_users f
        WHERE t.ref = $2 AND f.ref = $1
          AND f.plan <> 'free'
          AND (f.plan_until IS NULL OR f.plan_until > now())
          AND (t.plan = 'free' OR (t.plan_until IS NOT NULL AND t.plan_until <= now()))`,
      [fromRef, toRef],
    );

    await client.query('DELETE FROM app_users WHERE ref = $1', [fromRef]);
    await client.query('INSERT INTO ref_links (from_ref, to_ref) VALUES ($1, $2)', [
      fromRef,
      toRef,
    ]);
    // Flatten any chain (a → b, then b → c) so resolution stays one hop.
    await client.query('UPDATE ref_links SET to_ref = $2 WHERE to_ref = $1', [fromRef, toRef]);
    await client.query('COMMIT');
    aliasCache.clear();
    return 'linked';
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
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
  email: string | null;
  device: string | null;
  plan: string;
  planSource: string;
  planUntil: string | null;
  note: string | null;
  used: number;
  createdAt: string;
  lastSeenAt: string;
}

/**
 * Rows for the admin table, most recently active first.
 *
 * `limit` caps how many come back in one response, not how many exist — the
 * admin page compares this length against `adminStats().totalUsers` and warns
 * when they differ, because a silent gap between "shown" and "total" reads as
 * "some users are missing" when they are really just past the cutoff.
 */
export async function listUsers(limit = 1000): Promise<AdminRow[]> {
  if (!pool) return [];
  const period = currentPeriod();
  const res = await pool.query(
    `SELECT u.ref, u.email, u.device, u.plan, u.plan_source, u.plan_until, u.note, u.created_at, u.last_seen_at,
            COALESCE((SELECT SUM(c.count) FROM usage_counters c
                      WHERE c.ref = u.ref AND c.period = $1), 0)::int AS used
       FROM app_users u
      ORDER BY u.last_seen_at DESC
      LIMIT $2`,
    [period, limit],
  );
  return res.rows.map((r) => ({
    ref: r.ref,
    email: r.email ?? null,
    device: r.device ?? null,
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
