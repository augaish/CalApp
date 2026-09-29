import { randomBytes } from 'node:crypto';

import pg from 'pg';

import { HISTORICAL_COST_FALLBACK_USD, HISTORICAL_COST_PER_ACTION_USD } from './pricing.js';
import type { Language } from './prompts.js';
import {
  balanceFromTotals,
  isRefundEvent,
  isSaleEvent,
  netRevenue,
  splitSale,
  withinTerm,
  type CleanPartner,
  type CodeEarning,
  type CommissionTerm,
  type Partner,
  type PartnerBalance,
} from './partners.js';
import { effectivePlan, normalizeCode, type CleanPromo, type PromoCode } from './promo.js';

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
  // First-party barcode → nutrition cache. Open Food Facts (the free public
  // database this app also checks) has thin coverage of Gulf-market
  // products; this table is written to every time a user resolves a barcode
  // OFF didn't have via the AI photo-scan fallback, so the *next* person to
  // scan that exact product anywhere gets an instant hit here first — the
  // app's own barcode coverage grows from what its real users actually buy.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS barcode_cache (
      barcode    TEXT PRIMARY KEY,
      item       JSONB NOT NULL,
      source     TEXT NOT NULL DEFAULT 'off',
      hits       INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
  // Catalogue quality. A product read from a photo is one person's reading of
  // one label in one light — good enough for them, not yet good enough to hand
  // to everyone. `status` is what separates the two.
  await pool.query(
    `ALTER TABLE barcode_cache ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'`,
  );
  await pool.query(`ALTER TABLE barcode_cache ADD COLUMN IF NOT EXISTS contributed_by TEXT`);
  await pool.query(`ALTER TABLE barcode_cache ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE barcode_cache ADD COLUMN IF NOT EXISTS flags INTEGER NOT NULL DEFAULT 0`);
  // Every reading ever submitted for a barcode, not just the first. Two people
  // reading the same label differently is the signal a reviewer needs, and the
  // old write-once behaviour threw the second one away.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS barcode_submissions (
      id         BIGSERIAL PRIMARY KEY,
      barcode    TEXT NOT NULL,
      item       JSONB NOT NULL,
      ref        TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS barcode_submissions_barcode_idx ON barcode_submissions (barcode)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS barcode_submissions_ref_idx ON barcode_submissions (ref, created_at)`,
  );
  // Why AI calls failed, so an outage can be read instead of reproduced. Kept
  // small on purpose: the newest few hundred rows answer "what is wrong right
  // now", which is the only question this table exists for, and pruneAiFailures
  // drops the rest rather than growing a log nobody reads.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_failures (
      id         BIGSERIAL PRIMARY KEY,
      route      TEXT NOT NULL,
      code       TEXT NOT NULL,
      detail     TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS ai_failures_created_idx ON ai_failures (created_at DESC)`,
  );
  // Real token counts and their estimated USD cost (see pricing.ts), summed
  // onto the same row `reserve()` already creates — added after the fact via
  // ALTER so an existing deployment's counters keep their count history.
  await pool.query(`ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS input_tokens BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS output_tokens BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0`);
  // DeepSeek shadow-test log for the meal-photo route: every real meal scan
  // Claude answers also gets a background, non-blocking DeepSeek vision call
  // on the same photo, purely to compare accuracy and cost before ever
  // trusting DeepSeek with a real answer on this route. Never read by
  // anything user-facing, never touches quota — admin-dashboard-only.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deepseek_shadow_log (
      id                BIGSERIAL PRIMARY KEY,
      ref               TEXT NOT NULL,
      claude_model      TEXT NOT NULL,
      claude_result     JSONB NOT NULL,
      claude_ms         INTEGER,
      deepseek_result   JSONB,
      deepseek_error    TEXT,
      deepseek_ms       INTEGER,
      deepseek_cost_usd NUMERIC(12,6),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
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
  // Essentials covers one module, Food or Training, chosen by the member and
  // changeable once every 30 days (see setUserModule).
  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS module TEXT`);
  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS module_set_at TIMESTAMPTZ`);
  // A user's WHOOP connection, one row per account. Kept separate from
  // app_users (rather than more ALTER-ADD columns) since disconnecting is a
  // single DELETE and the row simply doesn't exist for anyone who hasn't
  // connected — no nullable columns to thread through every user query.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whoop_connections (
      ref           TEXT PRIMARY KEY,
      access_token  TEXT NOT NULL,
      refresh_token TEXT,
      expires_at    TIMESTAMPTZ NOT NULL,
      scope         TEXT NOT NULL,
      connected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // WHOOP only sends a refresh_token on some grants (observed: not
  // reliably on a re-authorization of an app the user already approved
  // before) — this used to be NOT NULL, which crashed the whole connect
  // flow on exactly that case instead of just losing the ability to
  // auto-refresh later.
  await pool.query(`ALTER TABLE whoop_connections ALTER COLUMN refresh_token DROP NOT NULL`);
  // One-time CSRF token for the OAuth redirect round trip: the authorize step
  // writes ref-by-state here, the callback reads and deletes it, so a forged
  // callback with a guessed or reused state matches no one.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whoop_oauth_state (
      state      TEXT PRIMARY KEY,
      ref        TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Abandoned attempts (closed the browser, never finished) are the only
  // thing that accumulates here — sweep anything stale on every boot.
  await pool.query(`DELETE FROM whoop_oauth_state WHERE created_at < now() - INTERVAL '1 day'`);

  // Promotion codes and who used them. `redeemed_count` is kept on the row
  // rather than counted from the redemptions table on every read, because
  // the same number is also the gate: the UPDATE that increments it is what
  // enforces the campaign limit, under the row lock, so two taps arriving
  // together cannot both pass a limit of one. See src/promo.ts.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      code            TEXT PRIMARY KEY,
      kind            TEXT NOT NULL DEFAULT 'free',
      plan            TEXT NOT NULL DEFAULT 'pro',
      percent_off     INTEGER NOT NULL DEFAULT 100,
      duration_days   INTEGER,
      offer_ios       TEXT,
      offer_android   TEXT,
      max_redemptions INTEGER,
      redeemed_count  INTEGER NOT NULL DEFAULT 0,
      starts_at       TIMESTAMPTZ,
      expires_at      TIMESTAMPTZ,
      active          BOOLEAN NOT NULL DEFAULT true,
      note            TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // One row per (code, person). The primary key is the rule "once each":
  // it cannot be raced, and it survives a retry that lost its response.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS promo_redemptions (
      code  TEXT NOT NULL REFERENCES promo_codes (code) ON DELETE CASCADE,
      ref   TEXT NOT NULL,
      plan  TEXT NOT NULL,
      until TIMESTAMPTZ,
      at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (code, ref)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS promo_redemptions_at ON promo_redemptions (at DESC)`);
  // A percent code only discounts; whether the person then paid is learned
  // later from the store. Null until a purchase is matched to it.
  await pool.query(`ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ`);
  // A free code's grant lives in its own columns, apart from plan/plan_until,
  // which belong to the store (and the admin). A store webhook — an expiry, a
  // refund, a renewal of a lower tier — therefore can never cancel a gift, and
  // a gift can never hide a subscription's own dates. The plan a person gets
  // is the better of the two while each is in date (see effectivePlan).
  await pool.query(`
    ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS promo_plan  TEXT,
      ADD COLUMN IF NOT EXISTS promo_until TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS promo_code  TEXT
  `);
  // Partners and what their codes earn — see src/partners.ts. A code may have
  // an owner, a commission and a term, and a link to the code of whoever
  // brought its owner in. Earnings are ledger lines, one per partner per
  // store transaction; a payout is recorded by hand.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partners (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      contact    TEXT,
      note       TEXT,
      token      TEXT NOT NULL UNIQUE,
      active     BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    ALTER TABLE promo_codes
      ADD COLUMN IF NOT EXISTS partner_id        TEXT REFERENCES partners (id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS commission_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS commission_term   TEXT NOT NULL DEFAULT 'lifetime',
      ADD COLUMN IF NOT EXISTS commission_months INTEGER,
      ADD COLUMN IF NOT EXISTS parent_code       TEXT,
      ADD COLUMN IF NOT EXISTS parent_pct        NUMERIC(5,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS grandparent_pct   NUMERIC(5,2) NOT NULL DEFAULT 0
  `);
  // Whose code brought this person — the first partner code they used — and
  // when their first credited sale was, which a code's term counts from.
  await pool.query(`
    ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS attributed_code TEXT,
      ADD COLUMN IF NOT EXISTS attributed_at   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS first_sale_at   TIMESTAMPTZ
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_earnings (
      id              BIGSERIAL PRIMARY KEY,
      transaction_id  TEXT NOT NULL,
      original_transaction_id TEXT,
      kind            TEXT NOT NULL,
      level           SMALLINT NOT NULL,
      partner_id      TEXT NOT NULL,
      via_code        TEXT NOT NULL,
      sold_code       TEXT NOT NULL,
      ref             TEXT NOT NULL,
      pct             NUMERIC(5,2) NOT NULL,
      net_usd         NUMERIC(12,2) NOT NULL,
      amount_usd      NUMERIC(12,2) NOT NULL,
      estimated       BOOLEAN NOT NULL DEFAULT false,
      product_id      TEXT,
      event_type      TEXT,
      at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (transaction_id, kind, level)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS partner_earnings_partner ON partner_earnings (partner_id, at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS partner_earnings_sold ON partner_earnings (sold_code)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_payouts (
      id         BIGSERIAL PRIMARY KEY,
      partner_id TEXT NOT NULL REFERENCES partners (id) ON DELETE CASCADE,
      amount_usd NUMERIC(12,2) NOT NULL,
      note       TEXT,
      at         TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Day-by-day figures for the admin overview. Monthly counters above stay
  // the source of truth for allowances; these only draw the charts, and start
  // on the day this shipped — days before it read as "not recorded", never 0.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usage_daily (
      day      DATE NOT NULL,
      kind     TEXT NOT NULL,
      actions  INTEGER NOT NULL DEFAULT 0,
      cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
      PRIMARY KEY (day, kind)
    )
  `);
  // Account deletion asked for from the public web page (the in-app button
  // deletes at once); the admin completes these by hand.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deletion_requests (
      id         BIGSERIAL PRIMARY KEY,
      email      TEXT NOT NULL,
      note       TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      done_at    TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_days (
      day DATE NOT NULL,
      ref TEXT NOT NULL,
      PRIMARY KEY (day, ref)
    )
  `);
}

// ── Promotion codes ───────────────────────────────────────────────────────

function promoRow(r: Record<string, unknown>): PromoCode {
  return {
    code: r.code as string,
    kind: (r.kind === 'percent' ? 'percent' : 'free') as PromoCode['kind'],
    plan: r.plan as Plan,
    percentOff: Number(r.percent_off ?? 100),
    durationDays: r.duration_days == null ? null : Number(r.duration_days),
    offerIos: (r.offer_ios as string) ?? null,
    offerAndroid: (r.offer_android as string) ?? null,
    maxRedemptions: r.max_redemptions == null ? null : Number(r.max_redemptions),
    redeemedCount: Number(r.redeemed_count ?? 0),
    startsAt: r.starts_at ? new Date(r.starts_at as string).toISOString() : null,
    expiresAt: r.expires_at ? new Date(r.expires_at as string).toISOString() : null,
    active: !!r.active,
    note: (r.note as string) ?? null,
    createdAt: new Date(r.created_at as string).toISOString(),
    convertedCount: r.converted_count == null ? undefined : Number(r.converted_count),
    earning: {
      partnerId: (r.partner_id as string) ?? null,
      commissionPct: Number(r.commission_pct ?? 0),
      term: (['first', 'months'].includes(r.commission_term as string) ? r.commission_term : 'lifetime') as CommissionTerm,
      termMonths: r.commission_months == null ? null : Number(r.commission_months),
      parentCode: (r.parent_code as string) ?? null,
      parentPct: Number(r.parent_pct ?? 0),
      grandparentPct: Number(r.grandparent_pct ?? 0),
    },
  };
}

const CONVERTED_SQL = `(SELECT COUNT(*) FROM promo_redemptions r
                          WHERE r.code = promo_codes.code AND r.converted_at IS NOT NULL)::int AS converted_count`;

/** Create a code, or edit one that already exists. Counters are never reset. */
export async function upsertPromo(v: CleanPromo): Promise<PromoCode | null> {
  if (!pool) return null;
  const res = await pool.query(
    `INSERT INTO promo_codes
       (code, kind, plan, percent_off, duration_days, offer_ios, offer_android,
        max_redemptions, starts_at, expires_at, active, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (code) DO UPDATE SET
       kind = EXCLUDED.kind, plan = EXCLUDED.plan, percent_off = EXCLUDED.percent_off,
       duration_days = EXCLUDED.duration_days, offer_ios = EXCLUDED.offer_ios,
       offer_android = EXCLUDED.offer_android, max_redemptions = EXCLUDED.max_redemptions,
       starts_at = EXCLUDED.starts_at, expires_at = EXCLUDED.expires_at,
       active = EXCLUDED.active, note = EXCLUDED.note
     RETURNING *`,
    [v.code, v.kind, v.plan, v.percentOff, v.durationDays, v.offerIos, v.offerAndroid,
     v.maxRedemptions, v.startsAt, v.expiresAt, v.active, v.note],
  );
  return promoRow(res.rows[0]);
}

export async function listPromos(limit = 200): Promise<PromoCode[]> {
  if (!pool) return [];
  const res = await pool.query(
    `SELECT *, ${CONVERTED_SQL} FROM promo_codes ORDER BY active DESC, created_at DESC LIMIT $1`,
    [limit],
  );
  return res.rows.map(promoRow);
}

export async function getPromo(code: string): Promise<PromoCode | null> {
  if (!pool) return null;
  const res = await pool.query(`SELECT *, ${CONVERTED_SQL} FROM promo_codes WHERE code = $1`, [code]);
  return res.rows[0] ? promoRow(res.rows[0]) : null;
}

export async function deletePromo(code: string): Promise<boolean> {
  if (!pool) return false;
  const res = await pool.query(`DELETE FROM promo_codes WHERE code = $1`, [code]);
  return (res.rowCount ?? 0) > 0;
}

export interface PromoRedemption {
  code: string;
  ref: string;
  plan: Plan;
  until: string | null;
  at: string;
  /** When a purchase was matched to this redemption (percent codes). */
  convertedAt: string | null;
  /** The account's address, when it signed in — easier to read than a ref. */
  email?: string | null;
}

function redemptionRow(r: Record<string, unknown>): PromoRedemption {
  return {
    code: r.code as string,
    ref: r.ref as string,
    plan: r.plan as Plan,
    until: r.until ? new Date(r.until as string).toISOString() : null,
    at: new Date(r.at as string).toISOString(),
    convertedAt: r.converted_at ? new Date(r.converted_at as string).toISOString() : null,
    email: (r.email as string) ?? null,
  };
}

export async function listRedemptions(code: string, limit = 500): Promise<PromoRedemption[]> {
  if (!pool) return [];
  const res = await pool.query(
    `SELECT r.code, r.ref, r.plan, r.until, r.at, r.converted_at, u.email
       FROM promo_redemptions r LEFT JOIN app_users u ON u.ref = r.ref
      WHERE r.code = $1 ORDER BY r.at DESC LIMIT $2`,
    [code, limit],
  );
  return res.rows.map(redemptionRow);
}

export async function getRedemption(code: string, ref: string): Promise<PromoRedemption | null> {
  if (!pool) return null;
  const res = await pool.query(
    `SELECT code, ref, plan, until, at, converted_at FROM promo_redemptions WHERE code = $1 AND ref = $2`,
    [code, ref],
  );
  return res.rows[0] ? redemptionRow(res.rows[0]) : null;
}

/**
 * Give `ref` a free code's tier until `until`. Written to the promo columns
 * only, never to the store's. When a gift is already running the better tier
 * of the two is kept, and `until` (computed by the caller from the later of
 * now and the running gift's end) extends it rather than overlapping it.
 */
export async function grantPromo(ref: string, plan: Plan, code: string, until: string): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO app_users (ref, promo_plan, promo_until, promo_code) VALUES ($1, $2, $3, $4)
     ON CONFLICT (ref) DO UPDATE SET
       promo_plan = CASE
         WHEN app_users.promo_until > now()
          AND ${rankSql('app_users.promo_plan')} > ${rankSql('EXCLUDED.promo_plan')}
         THEN app_users.promo_plan ELSE EXCLUDED.promo_plan END,
       promo_until = EXCLUDED.promo_until,
       promo_code = EXCLUDED.promo_code`,
    [ref, plan, until, code],
  );
}

/** Take a gift back (admin), leaving any store subscription untouched. */
export async function clearPromo(ref: string): Promise<void> {
  if (!pool) return;
  await pool.query(
    `UPDATE app_users SET promo_plan = NULL, promo_until = NULL, promo_code = NULL WHERE ref = $1`,
    [ref],
  );
}

function rankSql(col: string): string {
  return `(CASE ${col} WHEN 'proPlus' THEN 3 WHEN 'pro' THEN 2 WHEN 'essentials' THEN 1 ELSE 0 END)`;
}

/**
 * A purchase just started for `ref`: mark the percent-code redemption it came
 * from as converted. When the store names the offer code it used, that code
 * is matched exactly (ours, or the App Store code the admin paired with it);
 * otherwise the person's most recent unconverted percent redemption from the
 * last fortnight is taken as the one that led here — Play does not report
 * which offer a subscription was bought with.
 */
export async function recordPromoConversion(ref: string, offerCode: string | null): Promise<string | null> {
  if (!pool) return null;
  const res = await pool.query(
    `UPDATE promo_redemptions r SET converted_at = now()
      WHERE (r.code, r.ref) IN (
        SELECT r2.code, r2.ref FROM promo_redemptions r2 JOIN promo_codes p ON p.code = r2.code
         WHERE r2.ref = $1 AND r2.converted_at IS NULL AND p.kind = 'percent'
           AND CASE WHEN $2::text IS NOT NULL
                    THEN p.code = $2 OR regexp_replace(upper(COALESCE(p.offer_ios, '')), '[^A-Z0-9]', '', 'g') = $2
                    ELSE r2.at > now() - interval '14 days' END
         ORDER BY r2.at DESC LIMIT 1)
      RETURNING r.code`,
    [ref, offerCode],
  );
  return res.rows[0]?.code ?? null;
}

/**
 * Claim one redemption of `code` for `ref`, atomically.
 *
 * The UPDATE is the gate: it only matches a row that is active, in date, not
 * exhausted and not already redeemed by this person, and it increments the
 * counter in the same statement under the row's lock. Two taps arriving at
 * once therefore cannot both pass a limit of one. Nothing is written when it
 * does not match, and the caller asks `getPromo` why so the person gets a
 * reason rather than a shrug.
 */
export async function claimPromo(
  code: string,
  ref: string,
  until: string | null,
): Promise<PromoCode | null> {
  if (!pool) return null;
  const res = await pool.query(
    `WITH gate AS (
       UPDATE promo_codes
          SET redeemed_count = redeemed_count + 1
        WHERE code = $1
          AND active
          AND (starts_at IS NULL OR starts_at <= now())
          AND (expires_at IS NULL OR expires_at > now())
          AND (max_redemptions IS NULL OR redeemed_count < max_redemptions)
          AND NOT EXISTS (
            SELECT 1 FROM promo_redemptions r WHERE r.code = promo_codes.code AND r.ref = $2
          )
        RETURNING *
     ), ins AS (
       INSERT INTO promo_redemptions (code, ref, plan, until)
       SELECT g.code, $2, g.plan, $3::timestamptz FROM gate g
       RETURNING code
     )
     SELECT g.* FROM gate g JOIN ins i ON i.code = g.code`,
    [code, ref, until],
  );
  return res.rows[0] ? promoRow(res.rows[0]) : null;
}

export interface WhoopConnection {
  accessToken: string;
  /** Null when WHOOP didn't reissue one on this grant — see getValidAccessToken. */
  refreshToken: string | null;
  expiresAt: string;
  scope: string;
  connectedAt: string;
}

/** Start (or restart) an OAuth attempt: remember which user `state` belongs to. */
export async function saveWhoopOAuthState(state: string, ref: string): Promise<void> {
  if (!pool) return;
  await pool.query(`INSERT INTO whoop_oauth_state (state, ref) VALUES ($1, $2)`, [state, ref]);
}

/**
 * Redeem a `state` value from the callback. One-time use — deletes it as it
 * reads, so a replayed callback (or a guessed state) matches nothing the
 * second time. Anything older than 10 minutes is treated as expired; the
 * user closed the browser without finishing, not a slow legitimate flow.
 */
export async function consumeWhoopOAuthState(state: string): Promise<string | null> {
  if (!pool) return null;
  const res = await pool.query(
    `DELETE FROM whoop_oauth_state
     WHERE state = $1 AND created_at > now() - INTERVAL '10 minutes'
     RETURNING ref`,
    [state],
  );
  return res.rows[0]?.ref ?? null;
}

export async function setWhoopConnection(
  ref: string,
  tokens: { accessToken: string; refreshToken?: string; expiresAt: Date; scope: string },
): Promise<void> {
  if (!pool) return;
  // A grant that didn't come back with a refresh_token (see the column
  // comment above) must not blow away one already on file from an earlier
  // successful connection — COALESCE keeps the existing value in that case.
  await pool.query(
    `INSERT INTO whoop_connections (ref, access_token, refresh_token, expires_at, scope)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (ref) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, whoop_connections.refresh_token),
       expires_at = EXCLUDED.expires_at,
       scope = EXCLUDED.scope`,
    [ref, tokens.accessToken, tokens.refreshToken ?? null, tokens.expiresAt.toISOString(), tokens.scope],
  );
}

export async function getWhoopConnection(ref: string): Promise<WhoopConnection | null> {
  if (!pool) return null;
  const res = await pool.query(
    `SELECT access_token, refresh_token, expires_at, scope, connected_at
       FROM whoop_connections WHERE ref = $1`,
    [ref],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    expiresAt: new Date(r.expires_at).toISOString(),
    scope: r.scope,
    connectedAt: new Date(r.connected_at).toISOString(),
  };
}

export async function deleteWhoopConnection(ref: string): Promise<void> {
  if (!pool) return;
  await pool.query(`DELETE FROM whoop_connections WHERE ref = $1`, [ref]);
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

export type Plan = 'free' | 'essentials' | 'pro' | 'proPlus';

export interface AppUser {
  ref: string;
  /** The plan in force: the better of the store/admin grant and a gift. */
  plan: Plan;
  planSource: string;
  planUntil: string | null;
  note: string | null;
  /** The store/admin grant alone, in date or free. */
  storePlan?: { plan: Plan; source: string; until: string | null };
  /** A running promo gift, if any. */
  promo?: { plan: Plan; until: string; code: string | null } | null;
  /** The Essentials module, when one has been chosen. */
  module?: 'food' | 'training' | null;
  moduleSetAt?: string | null;
}

/**
 * The account as the rest of the server sees it: one plan, whichever of the
 * store/admin grant and a promo gift is better while in date. An expired
 * grant silently falls back to free.
 */
function appUserFrom(r: Record<string, unknown>): AppUser {
  const e = effectivePlan(
    { plan: r.plan as Plan, source: r.plan_source as string, until: iso(r.plan_until) },
    { plan: (r.promo_plan as Plan) ?? null, until: iso(r.promo_until), code: (r.promo_code as string) ?? null },
  );
  return {
    ref: r.ref as string,
    plan: e.plan,
    planSource: e.source,
    planUntil: e.until,
    note: (r.note as string) ?? null,
    storePlan: e.store,
    promo: e.promo,
    module: r.module === 'food' || r.module === 'training' ? r.module : null,
    moduleSetAt: iso(r.module_set_at),
  };
}

function iso(v: unknown): string | null {
  return v ? new Date(v as string).toISOString() : null;
}

/** Fetch (creating on first sight) the caller's account row. */
export async function getOrCreateUser(ref: string): Promise<AppUser | null> {
  if (!pool) return null;
  try {
    const res = await pool.query(
      `INSERT INTO app_users (ref) VALUES ($1)
       ON CONFLICT (ref) DO UPDATE SET last_seen_at = now()
       RETURNING ref, plan, plan_source, plan_until, note, promo_plan, promo_until, promo_code, module, module_set_at`,
      [ref],
    );
    // Who used the app today, for the overview's daily-active line.
    pool.query(`INSERT INTO user_days (day, ref) VALUES (${TODAY_SQL}, $1) ON CONFLICT DO NOTHING`, [ref]).catch(() => {});
    return appUserFrom(res.rows[0]);
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

/** The accounts signed in with this address, most recently seen first. */
export async function refsForEmail(email: string): Promise<string[]> {
  if (!pool) return [];
  const res = await pool.query(
    `SELECT ref FROM app_users WHERE lower(email) = lower($1) ORDER BY last_seen_at DESC`,
    [email.trim()],
  );
  return res.rows.map((r) => r.ref as string);
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

/** Days an Essentials member waits between changes of module. */
export const MODULE_CHANGE_DAYS = 30;

/**
 * Choose the Essentials module. The first choice, re-choosing the same one,
 * and any change while not on Essentials are always allowed; a member on
 * Essentials may switch once every MODULE_CHANGE_DAYS, so a single module
 * cannot quietly become both. History is never touched.
 */
export async function setUserModule(
  ref: string,
  module: 'food' | 'training',
  now: Date = new Date(),
  force = false,
): Promise<{ ok: true } | { ok: false; nextChange: string }> {
  if (!pool) return { ok: true };
  const user = await getOrCreateUser(ref);
  if (!force && user?.plan === 'essentials' && user.module && user.module !== module && user.moduleSetAt) {
    const next = new Date(new Date(user.moduleSetAt).getTime() + MODULE_CHANGE_DAYS * 86400000);
    if (next.getTime() > now.getTime()) return { ok: false, nextChange: next.toISOString() };
  }
  if (user?.module === module) return { ok: true };
  await pool.query(
    `INSERT INTO app_users (ref, module, module_set_at) VALUES ($1, $2, $3)
     ON CONFLICT (ref) DO UPDATE SET module = EXCLUDED.module, module_set_at = EXCLUDED.module_set_at`,
    [ref, module, now.toISOString()],
  );
  return { ok: true };
}

/** This period's AI use by kind, in weighted actions. */
export async function getUsageByKind(ref: string, period = currentPeriod()): Promise<Record<string, number>> {
  if (!pool) return {};
  try {
    const res = await pool.query(
      'SELECT kind, count FROM usage_counters WHERE ref = $1 AND period = $2 AND count > 0',
      [ref, period],
    );
    const out: Record<string, number> = {};
    for (const r of res.rows) out[r.kind as string] = Number(r.count);
    return out;
  } catch (err) {
    console.error('getUsageByKind failed:', err);
    return {};
  }
}

// ── Usage metering ────────────────────────────────────────────────────────

/** Billing period key: the calendar month the usage counts against. */
/** The admin's calendar day, for the daily tables: Saudi time unless ADMIN_TZ says otherwise. */
export const ADMIN_TZ = process.env.ADMIN_TZ || 'Asia/Riyadh';
const TODAY_SQL = `(now() AT TIME ZONE '${ADMIN_TZ.replace(/'/g, '')}')::date`;

/** Add to today's action count and cost for a kind. Never throws. */
async function bumpDaily(kind: string, actions: number, costUsd = 0): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO usage_daily (day, kind, actions, cost_usd) VALUES (${TODAY_SQL}, $1, GREATEST(0, $2), $3)
       ON CONFLICT (day, kind) DO UPDATE SET actions = GREATEST(0, usage_daily.actions + $2), cost_usd = usage_daily.cost_usd + $3`,
      [kind, actions, costUsd],
    );
  } catch (err) {
    console.error('bumpDaily failed:', err);
  }
}

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
 * Claim `weight` actions against the allowance, checking and incrementing
 * under a lock on the account row. Reading the total and then writing it as
 * two steps let a burst of parallel requests all see "14 of 15 used" and every
 * one of them proceed; holding the row makes that impossible. The lock is per
 * account, so one user's burst never slows anyone else down.
 *
 * `weight` is what a route costs us: a meal photo is 1, designing a whole
 * programme is several. An action that would overshoot the allowance is
 * refused outright rather than part-served, so the last few credits of a month
 * can still buy something cheap.
 */
export async function reserveUsage(
  ref: string,
  kind: string,
  limit: number,
  kindCap?: number,
  weight = 1,
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
    if (used + weight > limit) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'quota', used, kindUsed };
    }
    if (typeof kindCap === 'number' && kindUsed + weight > kindCap) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'cap', used, kindUsed };
    }
    await client.query(
      `INSERT INTO usage_counters (ref, period, kind, count) VALUES ($1, $2, $3, $4)
       ON CONFLICT (ref, period, kind) DO UPDATE SET count = usage_counters.count + $4`,
      [ref, period, kind, weight],
    );
    await client.query('COMMIT');
    void bumpDaily(kind, weight);
    return { ok: true, used: used + weight, kindUsed: kindUsed + weight };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Hand a reserved action back when the model call itself failed. Refunds the
 * same weight that was reserved, so an expensive route that failed does not
 * quietly keep the difference. */
export async function refundUsage(ref: string, kind: string, weight = 1): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `UPDATE usage_counters SET count = GREATEST(0, count - $4)
        WHERE ref = $1 AND period = $2 AND kind = $3`,
      [ref, currentPeriod(), kind, weight],
    );
    void bumpDaily(kind, -weight);
  } catch (err) {
    // A lost refund only ever costs the user one action; never fail their
    // request over it.
    console.error('refundUsage failed:', err);
  }
}

/** Record one AI action. Returns the new period total. */
export async function recordUsage(ref: string, kind: string, weight = 1): Promise<number> {
  if (!pool) return 0;
  try {
    await pool.query(
      `INSERT INTO usage_counters (ref, period, kind, count) VALUES ($1, $2, $3, $4)
       ON CONFLICT (ref, period, kind) DO UPDATE SET count = usage_counters.count + $4`,
      [ref, currentPeriod(), kind, weight],
    );
    void bumpDaily(kind, weight);
    return await getUsage(ref);
  } catch (err) {
    console.error('recordUsage failed:', err);
    return 0;
  }
}

/**
 * Add one model call's real token counts and estimated cost onto the row
 * `reserve()`/`recordUsage` already created for this (ref, period, kind) —
 * an UPDATE, not an upsert, since every metered AI route reserves before it
 * ever calls the model. Never throws: a lost cost figure should not fail
 * the user's actual request.
 */
export async function recordTokens(
  ref: string,
  kind: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `UPDATE usage_counters
          SET input_tokens = input_tokens + $4,
              output_tokens = output_tokens + $5,
              cost_usd = cost_usd + $6
        WHERE ref = $1 AND period = $2 AND kind = $3`,
      [ref, currentPeriod(), kind, inputTokens, outputTokens, costUsd],
    );
    void bumpDaily(kind, 0, costUsd);
  } catch (err) {
    console.error('recordTokens failed:', err);
  }
}

/**
 * Erase everything we hold for a caller: their account row, every usage
 * counter, and any id aliases pointing at them. Required by the app stores'
 * account-deletion rules.
 */
/**
 * Erase a person from the server. Everything that is theirs is deleted: the
 * account row, usage, daily activity, a WHOOP connection and its tokens, code
 * redemptions and shadow-test logs — for this ref and every device id that
 * was linked to it. Money records the business must keep (store events,
 * partner earnings) and shared catalogue entries stay, but lose any link to
 * the person.
 */
export async function deleteUser(ref: string): Promise<void> {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const linked = await client.query('SELECT from_ref FROM ref_links WHERE to_ref = $1', [ref]);
    const refs = [ref, ...linked.rows.map((r) => r.from_ref as string)];
    for (const table of ['usage_counters', 'user_days', 'whoop_connections', 'whoop_oauth_state', 'promo_redemptions', 'deepseek_shadow_log']) {
      await client.query(`DELETE FROM ${table} WHERE ref = ANY($1)`, [refs]);
    }
    await client.query(`UPDATE billing_events SET ref = NULL WHERE ref = ANY($1)`, [refs]);
    await client.query(`UPDATE partner_earnings SET ref = 'deleted' WHERE ref = ANY($1)`, [refs]);
    await client.query(`UPDATE barcode_submissions SET ref = NULL WHERE ref = ANY($1)`, [refs]);
    await client.query(`UPDATE barcode_cache SET contributed_by = NULL WHERE contributed_by = ANY($1)`, [refs]);
    await client.query('DELETE FROM app_users WHERE ref = ANY($1)', [refs]);
    await client.query('DELETE FROM ref_links WHERE from_ref = ANY($1) OR to_ref = ANY($1)', [refs]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
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

    // A running gift follows the person the same way, unless the account
    // already has a longer one.
    await client.query(
      `UPDATE app_users t
          SET promo_plan = f.promo_plan, promo_until = f.promo_until, promo_code = f.promo_code
         FROM app_users f
        WHERE t.ref = $2 AND f.ref = $1
          AND f.promo_until > now()
          AND (t.promo_until IS NULL OR t.promo_until < f.promo_until)`,
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
  /** Essentials' module, when chosen. */
  module?: 'food' | 'training' | null;
  note: string | null;
  used: number;
  /** Real input+output tokens across every AI call this period. */
  tokens: number;
  /** Estimated USD cost of those tokens — see pricing.ts. */
  costUsd: number;
  /**
   * All-time rough cost estimate (USD) across every period this account has
   * ever used, weighted per action kind — see HISTORICAL_COST_PER_ACTION_USD
   * in pricing.ts. Real token/cost tracking only started once usage_counters
   * gained its input_tokens/output_tokens/cost_usd columns, so anything
   * before that has no tokens recorded even though the actions themselves
   * happened; this is a guess for those, labeled "historical" on the admin
   * page so it's never confused with the real, tracked cost above.
   */
  histCostUsd: number;
  createdAt: string;
  lastSeenAt: string;
}

/** `CASE c.kind WHEN ... THEN ... ELSE ... END` built from
 * HISTORICAL_COST_PER_ACTION_USD so the admin table's historical-cost SQL
 * and pricing.ts can never drift apart. Kind names are our own Feature
 * union, never user input, so this string-built SQL is safe. */
function historicalCostCaseSql(): string {
  const cases = Object.entries(HISTORICAL_COST_PER_ACTION_USD)
    .map(([kind, usd]) => `WHEN '${kind}' THEN ${usd}`)
    .join(' ');
  return `CASE c.kind ${cases} ELSE ${HISTORICAL_COST_FALLBACK_USD} END`;
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
            u.promo_plan, u.promo_until, u.promo_code, u.module, u.module_set_at,
            COALESCE((SELECT SUM(c.count) FROM usage_counters c
                      WHERE c.ref = u.ref AND c.period = $1), 0)::int AS used,
            COALESCE((SELECT SUM(c.input_tokens + c.output_tokens) FROM usage_counters c
                      WHERE c.ref = u.ref AND c.period = $1), 0)::bigint AS tokens,
            COALESCE((SELECT SUM(c.cost_usd) FROM usage_counters c
                      WHERE c.ref = u.ref AND c.period = $1), 0)::numeric AS cost_usd,
            COALESCE((SELECT SUM(c.count * (${historicalCostCaseSql()})) FROM usage_counters c
                      WHERE c.ref = u.ref), 0)::numeric AS hist_cost_usd
       FROM app_users u
      ORDER BY u.last_seen_at DESC
      LIMIT $2`,
    [period, limit],
  );
  return res.rows.map((r) => ({
    ref: r.ref,
    email: r.email ?? null,
    device: r.device ?? null,
    ...(() => {
      // Show what the person actually has, gift included, so a code's
      // recipients do not read as free users in the table.
      const u = appUserFrom(r);
      return { plan: u.plan, planSource: u.planSource, planUntil: u.planUntil, module: u.module ?? null };
    })(),
    note: r.note,
    used: r.used,
    tokens: Number(r.tokens),
    costUsd: Number(r.cost_usd),
    histCostUsd: Number(r.hist_cost_usd),
    createdAt: new Date(r.created_at).toISOString(),
    lastSeenAt: new Date(r.last_seen_at).toISOString(),
  }));
}

export interface AdminStats {
  totalUsers: number;
  proUsers: number;
  activeThisMonth: number;
  actionsThisMonth: number;
  /** Estimated USD cost of every AI call this period, across all users. */
  costUsdThisMonth: number;
}

export async function adminStats(): Promise<AdminStats> {
  if (!pool) {
    return { totalUsers: 0, proUsers: 0, activeThisMonth: 0, actionsThisMonth: 0, costUsdThisMonth: 0 };
  }
  const period = currentPeriod();
  const res = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM app_users) AS total_users,
       (SELECT COUNT(*)::int FROM app_users
         WHERE (plan <> 'free' AND (plan_until IS NULL OR plan_until > now()))
            OR (promo_plan IS NOT NULL AND promo_until > now())) AS pro_users,
       (SELECT COUNT(DISTINCT ref)::int FROM usage_counters WHERE period = $1) AS active_month,
       (SELECT COALESCE(SUM(count), 0)::int FROM usage_counters WHERE period = $1) AS actions_month,
       (SELECT COALESCE(SUM(cost_usd), 0)::numeric FROM usage_counters WHERE period = $1) AS cost_month`,
    [period],
  );
  const r = res.rows[0];
  return {
    totalUsers: r.total_users,
    proUsers: r.pro_users,
    activeThisMonth: r.active_month,
    actionsThisMonth: r.actions_month,
    costUsdThisMonth: Number(r.cost_month),
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

/** The cached product plus where it came from. `source` travels with it
 * because Open Food Facts is ODbL-licensed and has to be credited wherever
 * its data is shown; rows we resolved ourselves from a label photo carry no
 * such obligation, so the app can tell the two apart. */
export async function getCachedBarcode(
  barcode: string,
  /** Who is asking. A pending entry is served back to the person who
   * contributed it — it is their own reading, and withholding it would only
   * make them scan the same label twice — but to nobody else until reviewed. */
  ref?: string | null,
): Promise<{ item: unknown; source: string; status: string } | null> {
  if (!pool) return null;
  try {
    const res = await pool.query(
      `UPDATE barcode_cache SET hits = hits + 1
        WHERE barcode = $1
          AND (status = 'published' OR (status = 'pending' AND contributed_by IS NOT DISTINCT FROM $2))
        RETURNING item, source, status`,
      [barcode, ref ?? null],
    );
    const row = res.rows[0];
    return row ? { item: row.item, source: row.source ?? 'off', status: row.status ?? 'published' } : null;
  } catch (err) {
    console.error('barcode cache read failed:', err);
    return null;
  }
}

/** How many products this caller has submitted in the last day — the basis
 * for a contribution cap, so one misfiring client cannot flood the queue. */
export async function submissionsToday(ref: string): Promise<number> {
  if (!pool) return 0;
  try {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS n FROM barcode_submissions
        WHERE ref = $1 AND created_at > now() - interval '1 day'`,
      [ref],
    );
    return res.rows[0]?.n ?? 0;
  } catch (err) {
    console.error('submissionsToday failed:', err);
    return 0;
  }
}

/** How many recent AI failures the dashboard shows, and how many rows are kept. */
const AI_FAILURE_KEEP = 300;

export interface AiFailureRow {
  route: string;
  code: string;
  detail: string;
  createdAt: string;
}

/**
 * Record why an AI call failed.
 *
 * Swallows its own errors and never throws: this runs inside a catch block
 * that is already handling one failure, and turning a logging problem into a
 * second failure would lose the response as well as the reason.
 */
export async function recordAiFailure(row: {
  route: string;
  code: string;
  detail: string;
}): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO ai_failures (route, code, detail) VALUES ($1, $2, $3)`,
      [row.route.slice(0, 120), row.code.slice(0, 60), row.detail.slice(0, 400)],
    );
    // Trimmed on write rather than on a schedule, so there is no cron to
    // forget about and the table cannot grow while nobody is looking.
    await pool.query(
      `DELETE FROM ai_failures WHERE id < (
         SELECT MIN(id) FROM (SELECT id FROM ai_failures ORDER BY id DESC LIMIT $1) keep
       )`,
      [AI_FAILURE_KEEP],
    );
  } catch (err) {
    console.error('recordAiFailure failed:', err);
  }
}

/** The most recent AI failures, newest first, for the dashboard. */
export async function recentAiFailures(limit = 40): Promise<AiFailureRow[]> {
  if (!pool) return [];
  try {
    const res = await pool.query(
      `SELECT route, code, detail, created_at FROM ai_failures
        ORDER BY id DESC LIMIT $1`,
      [Math.min(limit, AI_FAILURE_KEEP)],
    );
    return res.rows.map((r) => ({
      route: String(r.route),
      code: String(r.code),
      detail: String(r.detail ?? ''),
      createdAt: new Date(r.created_at).toISOString(),
    }));
  } catch (err) {
    console.error('recentAiFailures failed:', err);
    return [];
  }
}

/**
 * Failures grouped by code over a window, so the dashboard can lead with
 * "everything is failing for one reason" instead of a list to read down.
 */
export async function aiFailureSummary(
  hours = 24,
): Promise<{ code: string; count: number; lastAt: string }[]> {
  if (!pool) return [];
  try {
    const res = await pool.query(
      `SELECT code, COUNT(*)::int AS n, MAX(created_at) AS last_at
         FROM ai_failures
        WHERE created_at > now() - ($1 || ' hours')::interval
        GROUP BY code ORDER BY n DESC`,
      [String(hours)],
    );
    return res.rows.map((r) => ({
      code: String(r.code),
      count: r.n ?? 0,
      lastAt: new Date(r.last_at).toISOString(),
    }));
  } catch (err) {
    console.error('aiFailureSummary failed:', err);
    return [];
  }
}

/**
 * File one person's reading of a label.
 *
 * Always recorded as a submission, even when a cache row already exists —
 * a second, different reading of the same barcode is exactly what tells a
 * reviewer something is wrong, and the old write-once behaviour discarded it.
 * The cache row itself is only created when there is nothing there yet, and
 * it starts pending.
 */
export async function submitBarcode(
  barcode: string,
  item: unknown,
  ref: string | null,
): Promise<{ recorded: boolean; conflicting: boolean }> {
  if (!pool) return { recorded: false, conflicting: false };
  try {
    // A retried submission (same person, same barcode, same reading) is the
    // same contribution, not a second one — a client retry after a dropped
    // connection must never inflate the review queue.
    await pool.query(
      `INSERT INTO barcode_submissions (barcode, item, ref)
       SELECT $1, $2::jsonb, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM barcode_submissions
         WHERE barcode = $1 AND ref IS NOT DISTINCT FROM $3 AND item::text = $2::jsonb::text
       )`,
      [barcode, JSON.stringify(item), ref],
    );
    const existing = await pool.query('SELECT item FROM barcode_cache WHERE barcode = $1', [barcode]);
    if (existing.rowCount === 0) {
      await pool.query(
        `INSERT INTO barcode_cache (barcode, item, source, status, contributed_by)
         VALUES ($1, $2, 'photo', 'pending', $3)
         ON CONFLICT (barcode) DO NOTHING`,
        [barcode, JSON.stringify(item), ref],
      );
      return { recorded: true, conflicting: false };
    }
    // Something is already on file. Whether this agrees with it is the
    // reviewer's question, not ours — we only flag that they differ.
    const before = existing.rows[0].item as { calories?: number } | null;
    const after = item as { calories?: number } | null;
    const conflicting =
      typeof before?.calories === 'number' &&
      typeof after?.calories === 'number' &&
      Math.abs(before.calories - after.calories) > Math.max(20, before.calories * 0.15);
    return { recorded: true, conflicting };
  } catch (err) {
    console.error('submitBarcode failed:', err);
    return { recorded: false, conflicting: false };
  }
}

/** Someone says a shared product is wrong. Enough of those and it stops being
 * shared until a person looks at it — a wrong entry left published is worse
 * than no entry at all. */
export async function flagBarcode(barcode: string, threshold = 3): Promise<number> {
  if (!pool) return 0;
  try {
    const res = await pool.query(
      `UPDATE barcode_cache SET flags = flags + 1,
         status = CASE WHEN flags + 1 >= $2 AND source = 'photo' THEN 'pending' ELSE status END
        WHERE barcode = $1 RETURNING flags`,
      [barcode, threshold],
    );
    return res.rows[0]?.flags ?? 0;
  } catch (err) {
    console.error('flagBarcode failed:', err);
    return 0;
  }
}

export interface QueuedBarcode {
  barcode: string;
  item: unknown;
  source: string;
  status: string;
  hits: number;
  flags: number;
  createdAt: string;
  submissions: { item: unknown; ref: string | null; createdAt: string }[];
}

/** Everything waiting on a person: pending entries, newest first, each with
 * every competing reading so they can be compared side by side. */
export async function barcodeQueue(limit = 50): Promise<QueuedBarcode[]> {
  if (!pool) return [];
  try {
    const res = await pool.query(
      `SELECT barcode, item, source, status, hits, flags, created_at
         FROM barcode_cache WHERE status = 'pending'
        ORDER BY flags DESC, hits DESC, created_at DESC LIMIT $1`,
      [limit],
    );
    const out: QueuedBarcode[] = [];
    for (const row of res.rows) {
      const subs = await pool.query(
        `SELECT item, ref, created_at FROM barcode_submissions
          WHERE barcode = $1 ORDER BY created_at DESC LIMIT 10`,
        [row.barcode],
      );
      out.push({
        barcode: row.barcode,
        item: row.item,
        source: row.source,
        status: row.status,
        hits: row.hits,
        flags: row.flags,
        createdAt: row.created_at,
        submissions: subs.rows.map((r) => ({ item: r.item, ref: r.ref, createdAt: r.created_at })),
      });
    }
    return out;
  } catch (err) {
    console.error('barcodeQueue failed:', err);
    return [];
  }
}

/** A person's decision on a queued product. Publishing stamps when it was
 * checked, which is the only thing that makes "verified" mean anything. */
export async function reviewBarcode(
  barcode: string,
  action: 'publish' | 'reject',
  item?: unknown,
): Promise<boolean> {
  if (!pool) return false;
  try {
    if (action === 'reject') {
      await pool.query(`UPDATE barcode_cache SET status = 'rejected' WHERE barcode = $1`, [barcode]);
      return true;
    }
    await pool.query(
      `UPDATE barcode_cache
          SET status = 'published', verified_at = now(), flags = 0
              ${item ? ', item = $2' : ''}
        WHERE barcode = $1`,
      item ? [barcode, JSON.stringify(item)] : [barcode],
    );
    return true;
  } catch (err) {
    console.error('reviewBarcode failed:', err);
    return false;
  }
}

/** `source` is 'off' (Open Food Facts had it — write-through, so we never
 * hit OFF for the same barcode twice) or 'photo' (a user's AI photo scan
 * resolved a barcode OFF didn't have) — purely informational, for the admin
 * page to see how much of the cache the app itself has grown. */
export async function setCachedBarcode(
  barcode: string,
  item: unknown,
  source: 'off' | 'photo',
): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO barcode_cache (barcode, item, source)
       VALUES ($1, $2, $3)
       ON CONFLICT (barcode) DO UPDATE SET item = EXCLUDED.item, source = EXCLUDED.source`,
      [barcode, JSON.stringify(item), source],
    );
  } catch (err) {
    console.error('barcode cache write failed:', err);
  }
}

export interface ShadowTestInput {
  ref: string;
  claudeModel: string;
  claudeResult: unknown;
  claudeMs: number;
  deepseekResult: unknown | null;
  deepseekError: string | null;
  deepseekMs: number;
  deepseekCostUsd: number | null;
}

/** Best-effort: a lost shadow-test row must never surface as a user-facing error. */
export async function recordShadowTest(t: ShadowTestInput): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO deepseek_shadow_log
        (ref, claude_model, claude_result, claude_ms, deepseek_result, deepseek_error, deepseek_ms, deepseek_cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        t.ref,
        t.claudeModel,
        JSON.stringify(t.claudeResult),
        t.claudeMs,
        t.deepseekResult ? JSON.stringify(t.deepseekResult) : null,
        t.deepseekError,
        t.deepseekMs,
        t.deepseekCostUsd,
      ],
    );
  } catch (err) {
    console.error('shadow test log failed:', err);
  }
}

export interface ShadowTestRow {
  id: number;
  ref: string;
  claudeModel: string;
  claudeResult: unknown;
  claudeMs: number | null;
  deepseekResult: unknown;
  deepseekError: string | null;
  deepseekMs: number | null;
  deepseekCostUsd: number | null;
  createdAt: string;
}

/** Most recent shadow-test rows, newest first, for the admin dashboard. */
export async function listShadowTests(limit = 30): Promise<ShadowTestRow[]> {
  if (!pool) return [];
  const res = await pool.query(
    `SELECT id, ref, claude_model, claude_result, claude_ms,
            deepseek_result, deepseek_error, deepseek_ms, deepseek_cost_usd, created_at
     FROM deepseek_shadow_log ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return res.rows.map((r) => ({
    id: r.id,
    ref: r.ref,
    claudeModel: r.claude_model,
    claudeResult: r.claude_result,
    claudeMs: r.claude_ms,
    deepseekResult: r.deepseek_result,
    deepseekError: r.deepseek_error,
    deepseekMs: r.deepseek_ms,
    deepseekCostUsd: r.deepseek_cost_usd == null ? null : Number(r.deepseek_cost_usd),
    createdAt: r.created_at,
  }));
}

// ── Partners and their earnings ───────────────────────────────────────────


const newToken = () => randomBytes(18).toString('base64url');

function partnerRow(r: Record<string, unknown>): Partner {
  return {
    id: r.id as string,
    name: r.name as string,
    contact: (r.contact as string) ?? null,
    note: (r.note as string) ?? null,
    token: r.token as string,
    active: !!r.active,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export interface PartnerSummary extends Partner {
  codes: string[];
  /** Credited sales (level 0 lines) through the partner's own codes. */
  sales: number;
  balance: PartnerBalance;
}

const HOLD_SQL = `now() - interval '30 days'`;

export async function listPartners(): Promise<PartnerSummary[]> {
  if (!pool) return [];
  const res = await pool.query(`
    SELECT p.*,
      COALESCE((SELECT array_agg(c.code ORDER BY c.code) FROM promo_codes c WHERE c.partner_id = p.id), '{}') AS codes,
      (SELECT COUNT(*) FROM partner_earnings e WHERE e.partner_id = p.id AND e.level = 0 AND e.kind = 'sale')::int AS sales,
      COALESCE((SELECT SUM(amount_usd) FROM partner_earnings e WHERE e.partner_id = p.id), 0) AS earned,
      COALESCE((SELECT SUM(amount_usd) FROM partner_earnings e WHERE e.partner_id = p.id AND e.at <= ${HOLD_SQL}), 0) AS settled,
      COALESCE((SELECT SUM(amount_usd) FROM partner_payouts o WHERE o.partner_id = p.id), 0) AS paid
    FROM partners p ORDER BY p.active DESC, p.created_at DESC`);
  return res.rows.map((r) => ({
    ...partnerRow(r),
    codes: (r.codes as string[]) ?? [],
    sales: Number(r.sales ?? 0),
    balance: balanceFromTotals(Number(r.earned), Number(r.settled), Number(r.paid)),
  }));
}

export async function getPartner(id: string): Promise<Partner | null> {
  if (!pool) return null;
  const res = await pool.query(`SELECT * FROM partners WHERE id = $1`, [id]);
  return res.rows[0] ? partnerRow(res.rows[0]) : null;
}

export async function getPartnerByToken(token: string): Promise<Partner | null> {
  if (!pool || !token) return null;
  const res = await pool.query(`SELECT * FROM partners WHERE token = $1`, [token]);
  return res.rows[0] ? partnerRow(res.rows[0]) : null;
}

/** Create a partner (no id) or edit one. A new partner gets a fresh private-page token. */
export async function savePartner(id: string | null, v: CleanPartner): Promise<Partner | null> {
  if (!pool) return null;
  if (id) {
    const res = await pool.query(
      `UPDATE partners SET name = $2, contact = $3, note = $4, active = $5 WHERE id = $1 RETURNING *`,
      [id, v.name, v.contact, v.note, v.active],
    );
    return res.rows[0] ? partnerRow(res.rows[0]) : null;
  }
  const res = await pool.query(
    `INSERT INTO partners (id, name, contact, note, token, active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [`p_${randomBytes(5).toString('hex')}`, v.name, v.contact, v.note, newToken(), v.active],
  );
  return partnerRow(res.rows[0]);
}

/** A new private link; the old one stops working at once. */
export async function rotatePartnerToken(id: string): Promise<Partner | null> {
  if (!pool) return null;
  const res = await pool.query(`UPDATE partners SET token = $2 WHERE id = $1 RETURNING *`, [id, newToken()]);
  return res.rows[0] ? partnerRow(res.rows[0]) : null;
}

/** Only a partner with no earnings can be deleted; one with history is switched off instead. */
export async function deletePartner(id: string): Promise<'deleted' | 'has_earnings' | 'not_found'> {
  if (!pool) return 'not_found';
  const used = await pool.query(`SELECT 1 FROM partner_earnings WHERE partner_id = $1 LIMIT 1`, [id]);
  if (used.rowCount) return 'has_earnings';
  const res = await pool.query(`DELETE FROM partners WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0 ? 'deleted' : 'not_found';
}

export async function addPayout(partnerId: string, amountUsd: number, note: string | null): Promise<boolean> {
  if (!pool) return false;
  const res = await pool.query(
    `INSERT INTO partner_payouts (partner_id, amount_usd, note)
     SELECT id, $2, $3 FROM partners WHERE id = $1`,
    [partnerId, amountUsd, note],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Store a code's earning terms (after cleanEarning has checked them). */
export async function setCodeEarning(code: string, e: Omit<CodeEarning, 'code'>): Promise<void> {
  if (!pool) return;
  await pool.query(
    `UPDATE promo_codes SET partner_id = $2, commission_pct = $3, commission_term = $4, commission_months = $5,
            parent_code = $6, parent_pct = $7, grandparent_pct = $8
      WHERE code = $1`,
    [code, e.partnerId, e.commissionPct, e.term, e.termMonths, e.parentCode, e.parentPct, e.grandparentPct],
  );
}

/** Whether a code has earned anyone anything — such a code is kept, not deleted. */
export async function codeHasEarnings(code: string): Promise<boolean> {
  if (!pool) return false;
  const res = await pool.query(`SELECT 1 FROM partner_earnings WHERE sold_code = $1 OR via_code = $1 LIMIT 1`, [code]);
  return (res.rowCount ?? 0) > 0;
}

/** Per code: distinct buyers, credited sales and what it earned its owner. */
export async function codeEarningTotals(): Promise<Record<string, { buyers: number; sales: number; netUsd: number; ownerUsd: number }>> {
  if (!pool) return {};
  const res = await pool.query(`
    SELECT sold_code AS code,
           COUNT(DISTINCT ref) FILTER (WHERE kind = 'sale')::int AS buyers,
           COUNT(*) FILTER (WHERE kind = 'sale')::int AS sales,
           COALESCE(SUM(net_usd), 0) AS net_usd,
           COALESCE(SUM(amount_usd), 0) AS owner_usd
      FROM partner_earnings WHERE level = 0 GROUP BY sold_code`);
  const out: Record<string, { buyers: number; sales: number; netUsd: number; ownerUsd: number }> = {};
  for (const r of res.rows) {
    out[r.code] = { buyers: Number(r.buyers), sales: Number(r.sales), netUsd: Number(r.net_usd), ownerUsd: Number(r.owner_usd) };
  }
  return out;
}

/**
 * Remember which partner code brought this person, the first time one does.
 * First come, first served: a later code never takes over someone already
 * brought by another. Codes that pay nobody are not recorded.
 */
export async function attributeUser(ref: string, code: string): Promise<boolean> {
  if (!pool) return false;
  const res = await pool.query(
    `UPDATE app_users u SET attributed_code = c.code, attributed_at = now()
       FROM promo_codes c
      WHERE u.ref = $1 AND u.attributed_code IS NULL AND c.code = $2
        AND (c.partner_id IS NOT NULL OR c.parent_code IS NOT NULL)`,
    [ref, code],
  );
  return (res.rowCount ?? 0) > 0;
}

/** The fields of a RevenueCat event the earnings side reads. */
export interface EarningEvent {
  type?: string;
  id?: string;
  transaction_id?: string | null;
  original_transaction_id?: string | null;
  product_id?: string;
  environment?: string;
  offer_code?: string | null;
  cancel_reason?: string | null;
  price?: unknown;
  commission_percentage?: unknown;
  tax_percentage?: unknown;
  takehome_percentage?: unknown;
  event_timestamp_ms?: number | null;
  purchased_at_ms?: number | null;
}

export type EarningOutcome =
  | { kind: 'credited'; lines: number }
  | { kind: 'reversed'; lines: number }
  | { kind: 'skipped'; reason: string };

async function codeWithPartner(code: string | null): Promise<{ code: CodeEarning; partner: Partner | null } | null> {
  if (!pool || !code) return null;
  const res = await pool.query(
    `SELECT c.*, p.id AS p_id, p.name AS p_name, p.contact AS p_contact, p.note AS p_note, p.token AS p_token,
            p.active AS p_active, p.created_at AS p_created_at
       FROM promo_codes c LEFT JOIN partners p ON p.id = c.partner_id WHERE c.code = $1`,
    [code],
  );
  const r = res.rows[0];
  if (!r) return null;
  const row = promoRow(r);
  return {
    code: { code: row.code, ...(row.earning as Omit<CodeEarning, 'code'>) },
    partner: r.p_id
      ? partnerRow({ id: r.p_id, name: r.p_name, contact: r.p_contact, note: r.p_note, token: r.p_token, active: r.p_active, created_at: r.p_created_at })
      : null,
  };
}

/**
 * Credit (or, for a refund, reverse) what one store transaction earns the
 * partners behind the buyer. Safe to call for every webhook event: anything
 * that is not money, not attributed or already recorded is skipped.
 */
export async function recordPartnerEarnings(ref: string, event: EarningEvent, now: Date = new Date()): Promise<EarningOutcome> {
  if (!pool) return { kind: 'skipped', reason: 'no_database' };
  if ((event.environment ?? '').toUpperCase() === 'SANDBOX' && process.env.PARTNER_COUNT_SANDBOX !== '1') {
    return { kind: 'skipped', reason: 'sandbox' };
  }
  const txn = event.transaction_id || event.id;
  if (!txn) return { kind: 'skipped', reason: 'no_transaction' };

  if (isRefundEvent(event)) {
    // Undo exactly what that transaction earned — by its own id, or failing
    // that the latest sale in its subscription.
    const sale = await pool.query(
      `SELECT * FROM partner_earnings WHERE kind = 'sale' AND transaction_id = (
         SELECT transaction_id FROM partner_earnings
          WHERE kind = 'sale' AND ref = $3 AND (transaction_id = $1 OR ($2::text IS NOT NULL AND original_transaction_id = $2))
          ORDER BY (transaction_id = $1) DESC, at DESC LIMIT 1)`,
      [txn, event.original_transaction_id ?? null, ref],
    );
    let n = 0;
    for (const l of sale.rows) {
      const ins = await pool.query(
        `INSERT INTO partner_earnings (transaction_id, original_transaction_id, kind, level, partner_id, via_code, sold_code, ref,
                                       pct, net_usd, amount_usd, estimated, product_id, event_type, at)
         VALUES ($1,$2,'refund',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (transaction_id, kind, level) DO NOTHING`,
        [l.transaction_id, l.original_transaction_id, l.level, l.partner_id, l.via_code, l.sold_code, l.ref,
         l.pct, -Number(l.net_usd), -Number(l.amount_usd), l.estimated, l.product_id, event.type ?? null, now.toISOString()],
      );
      n += ins.rowCount ?? 0;
    }
    return n ? { kind: 'reversed', lines: n } : { kind: 'skipped', reason: 'nothing_to_reverse' };
  }

  if (!isSaleEvent(event.type)) return { kind: 'skipped', reason: 'not_a_sale' };
  const net = netRevenue(event);
  if (!net || net.usd <= 0) return { kind: 'skipped', reason: 'no_revenue' };

  // Someone who typed a partner's code into the App Store directly never
  // passed through our redeem screen; the offer code on the sale finds it.
  let user = await pool.query(`SELECT attributed_code, first_sale_at FROM app_users WHERE ref = $1`, [ref]);
  if (!user.rows[0]?.attributed_code && event.offer_code) {
    const offer = normalizeCode(event.offer_code);
    const match = await pool.query(
      `SELECT code FROM promo_codes
        WHERE (partner_id IS NOT NULL OR parent_code IS NOT NULL)
          AND (code = $1 OR regexp_replace(upper(COALESCE(offer_ios, '')), '[^A-Z0-9]', '', 'g') = $1
                         OR regexp_replace(upper(COALESCE(offer_android, '')), '[^A-Z0-9]', '', 'g') = $1)
        LIMIT 1`,
      [offer],
    );
    if (match.rows[0]) {
      await getOrCreateUser(ref);
      await attributeUser(ref, match.rows[0].code);
      user = await pool.query(`SELECT attributed_code, first_sale_at FROM app_users WHERE ref = $1`, [ref]);
    }
  }
  const soldCode = user.rows[0]?.attributed_code as string | undefined;
  if (!soldCode) return { kind: 'skipped', reason: 'not_attributed' };

  const sold = await codeWithPartner(soldCode);
  if (!sold) return { kind: 'skipped', reason: 'code_gone' };
  const saleAt = event.purchased_at_ms ? new Date(Number(event.purchased_at_ms)) : now;
  const firstSaleAt = user.rows[0]?.first_sale_at ? new Date(user.rows[0].first_sale_at).toISOString() : null;
  if (!withinTerm(sold.code.term, sold.code.termMonths, firstSaleAt, saleAt)) {
    return { kind: 'skipped', reason: 'term_over' };
  }
  const parent = await codeWithPartner(sold.code.parentCode);
  const grand = parent ? await codeWithPartner(parent.code.parentCode) : null;
  const chain = [sold, ...(parent ? [parent] : []), ...(parent && grand ? [grand] : [])];
  const lines = splitSale(net.usd, chain);

  let n = 0;
  for (const l of lines) {
    const ins = await pool.query(
      `INSERT INTO partner_earnings (transaction_id, original_transaction_id, kind, level, partner_id, via_code, sold_code, ref,
                                     pct, net_usd, amount_usd, estimated, product_id, event_type, at)
       VALUES ($1,$2,'sale',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (transaction_id, kind, level) DO NOTHING`,
      [txn, event.original_transaction_id ?? null, l.level, l.partnerId, l.viaCode, soldCode, ref,
       l.pct, net.usd, l.amountUsd, net.estimated, event.product_id ?? null, event.type ?? null, saleAt.toISOString()],
    );
    n += ins.rowCount ?? 0;
  }
  // The term counts from the first sale, whether or not it paid anyone.
  if (!firstSaleAt) await pool.query(`UPDATE app_users SET first_sale_at = $2 WHERE ref = $1 AND first_sale_at IS NULL`, [ref, saleAt.toISOString()]);
  return n ? { kind: 'credited', lines: n } : { kind: 'skipped', reason: lines.length ? 'already_recorded' : 'no_shares' };
}

export interface PartnerReport {
  partner: Partner;
  balance: PartnerBalance;
  /** The partner's own codes with what each has done. */
  codes: {
    code: string;
    percentOff: number;
    kind: string;
    commissionPct: number;
    term: CommissionTerm;
    termMonths: number | null;
    active: boolean;
    redemptions: number;
    buyers: number;
    sales: number;
    earnedUsd: number;
  }[];
  /** Earned by level: 0 own codes, 1 partners they brought, 2 those partners' partners. */
  byLevel: { level: number; sales: number; earnedUsd: number }[];
  /** Recent lines, newest first — no buyer identities. */
  recent: { at: string; kind: string; level: number; code: string; netUsd: number; pct: number; amountUsd: number }[];
  payouts: { at: string; amountUsd: number; note: string | null }[];
}

export async function partnerReport(partnerId: string): Promise<PartnerReport | null> {
  if (!pool) return null;
  const partner = await getPartner(partnerId);
  if (!partner) return null;
  const [codes, levels, recent, payouts, totals] = await Promise.all([
    pool.query(
      `SELECT c.code, c.kind, c.percent_off, c.commission_pct, c.commission_term, c.commission_months, c.active, c.redeemed_count,
              (SELECT COUNT(DISTINCT e.ref) FROM partner_earnings e WHERE e.sold_code = c.code AND e.level = 0 AND e.kind = 'sale')::int AS buyers,
              (SELECT COUNT(*) FROM partner_earnings e WHERE e.sold_code = c.code AND e.level = 0 AND e.kind = 'sale')::int AS sales,
              COALESCE((SELECT SUM(e.amount_usd) FROM partner_earnings e WHERE e.sold_code = c.code AND e.level = 0 AND e.partner_id = $1), 0) AS earned
         FROM promo_codes c WHERE c.partner_id = $1 ORDER BY c.created_at DESC`,
      [partnerId],
    ),
    pool.query(
      `SELECT level, COUNT(*) FILTER (WHERE kind = 'sale')::int AS sales, COALESCE(SUM(amount_usd), 0) AS earned
         FROM partner_earnings WHERE partner_id = $1 GROUP BY level ORDER BY level`,
      [partnerId],
    ),
    pool.query(
      `SELECT at, kind, level, sold_code, net_usd, pct, amount_usd FROM partner_earnings
        WHERE partner_id = $1 ORDER BY at DESC, id DESC LIMIT 100`,
      [partnerId],
    ),
    pool.query(`SELECT at, amount_usd, note FROM partner_payouts WHERE partner_id = $1 ORDER BY at DESC`, [partnerId]),
    pool.query(
      `SELECT COALESCE(SUM(amount_usd), 0) AS earned,
              COALESCE(SUM(amount_usd) FILTER (WHERE at <= ${HOLD_SQL}), 0) AS settled,
              (SELECT COALESCE(SUM(amount_usd), 0) FROM partner_payouts WHERE partner_id = $1) AS paid
         FROM partner_earnings WHERE partner_id = $1`,
      [partnerId],
    ),
  ]);
  const t = totals.rows[0] ?? {};
  return {
    partner,
    balance: balanceFromTotals(Number(t.earned ?? 0), Number(t.settled ?? 0), Number(t.paid ?? 0)),
    codes: codes.rows.map((r) => ({
      code: r.code,
      kind: r.kind,
      percentOff: Number(r.percent_off),
      commissionPct: Number(r.commission_pct),
      term: r.commission_term,
      termMonths: r.commission_months == null ? null : Number(r.commission_months),
      active: !!r.active,
      redemptions: Number(r.redeemed_count),
      buyers: Number(r.buyers),
      sales: Number(r.sales),
      earnedUsd: Number(r.earned),
    })),
    byLevel: levels.rows.map((r) => ({ level: Number(r.level), sales: Number(r.sales), earnedUsd: Number(r.earned) })),
    recent: recent.rows.map((r) => ({
      at: new Date(r.at).toISOString(),
      kind: r.kind,
      level: Number(r.level),
      code: r.sold_code,
      netUsd: Number(r.net_usd),
      pct: Number(r.pct),
      amountUsd: Number(r.amount_usd),
    })),
    payouts: payouts.rows.map((r) => ({ at: new Date(r.at).toISOString(), amountUsd: Number(r.amount_usd), note: r.note ?? null })),
  };
}

// ── Admin overview ────────────────────────────────────────────────────────

export interface OverviewDay {
  day: string;
  newUsers: number;
  /** Null before daily tracking began — "not recorded", not zero. */
  activeUsers: number | null;
  aiActions: number | null;
  aiCostUsd: number | null;
  purchases: number;
  renewals: number;
  cancellations: number;
  redemptions: number;
  aiFailures: number;
}

export interface AdminOverview {
  days: number;
  timezone: string;
  /** First day the daily tables have data for, or null when none yet. */
  trackingSince: string | null;
  series: OverviewDay[];
  recent: {
    billing: { type: string | null; ref: string | null; email: string | null; at: string }[];
    redemptions: { code: string; ref: string; email: string | null; at: string }[];
    signups: { ref: string; email: string | null; device: string | null; at: string }[];
  };
  attention: { queue: number; aiFailures24h: number; partnersOwedUsd: number; partnersPendingUsd: number };
  billingEventsEver: number;
}

export async function adminOverview(days: number): Promise<AdminOverview | null> {
  if (!pool) return null;
  const n = Math.max(1, Math.min(365, Math.round(days)));
  const tz = ADMIN_TZ.replace(/'/g, '');
  const local = (col: string) => `(${col} AT TIME ZONE '${tz}')::date`;
  const [series, since, billing, redemptions, signups, attention] = await Promise.all([
    pool.query(
      `WITH d AS (SELECT generate_series(${TODAY_SQL} - ($1::int - 1), ${TODAY_SQL}, interval '1 day')::date AS day)
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
         (SELECT COUNT(*) FROM app_users u WHERE ${local('u.created_at')} = d.day)::int AS new_users,
         (SELECT COUNT(*) FROM user_days x WHERE x.day = d.day)::int AS active_users,
         (SELECT COALESCE(SUM(actions), 0) FROM usage_daily x WHERE x.day = d.day)::int AS ai_actions,
         (SELECT COALESCE(SUM(cost_usd), 0) FROM usage_daily x WHERE x.day = d.day) AS ai_cost,
         (SELECT COUNT(*) FROM billing_events b WHERE ${local('b.received_at')} = d.day AND upper(b.type) IN ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE'))::int AS purchases,
         (SELECT COUNT(*) FROM billing_events b WHERE ${local('b.received_at')} = d.day AND upper(b.type) = 'RENEWAL')::int AS renewals,
         (SELECT COUNT(*) FROM billing_events b WHERE ${local('b.received_at')} = d.day AND upper(b.type) IN ('CANCELLATION','EXPIRATION'))::int AS cancellations,
         (SELECT COUNT(*) FROM promo_redemptions r WHERE ${local('r.at')} = d.day)::int AS redemptions,
         (SELECT COUNT(*) FROM ai_failures f WHERE ${local('f.created_at')} = d.day)::int AS ai_failures
       FROM d ORDER BY d.day`,
      [n],
    ),
    pool.query(`SELECT to_char(LEAST((SELECT MIN(day) FROM usage_daily), (SELECT MIN(day) FROM user_days)), 'YYYY-MM-DD') AS since`),
    pool.query(
      `SELECT b.type, b.ref, u.email, b.received_at FROM billing_events b LEFT JOIN app_users u ON u.ref = b.ref
        ORDER BY b.received_at DESC LIMIT 12`,
    ),
    pool.query(
      `SELECT r.code, r.ref, u.email, r.at FROM promo_redemptions r LEFT JOIN app_users u ON u.ref = r.ref
        ORDER BY r.at DESC LIMIT 10`,
    ),
    pool.query(`SELECT ref, email, device, created_at FROM app_users ORDER BY created_at DESC LIMIT 10`),
    pool.query(
      `SELECT
         (SELECT COUNT(*) FROM barcode_cache WHERE status = 'pending')::int AS queue,
         (SELECT COUNT(*) FROM ai_failures WHERE created_at > now() - interval '24 hours')::int AS failures,
         (SELECT COUNT(*) FROM billing_events)::int AS billing_ever,
         COALESCE((SELECT SUM(amount_usd) FROM partner_earnings WHERE at <= now() - interval '30 days'), 0)
           - COALESCE((SELECT SUM(amount_usd) FROM partner_payouts), 0) AS owed,
         COALESCE((SELECT SUM(amount_usd) FROM partner_earnings WHERE at > now() - interval '30 days'), 0) AS pending`,
    ),
  ]);
  const sinceDay = (since.rows[0]?.since as string | null) ?? null;
  const a = attention.rows[0] ?? {};
  return {
    days: n,
    timezone: tz,
    trackingSince: sinceDay,
    series: series.rows.map((r) => {
      const tracked = sinceDay != null && r.day >= sinceDay;
      return {
        day: r.day,
        newUsers: Number(r.new_users),
        activeUsers: tracked ? Number(r.active_users) : null,
        aiActions: tracked ? Number(r.ai_actions) : null,
        aiCostUsd: tracked ? Number(r.ai_cost) : null,
        purchases: Number(r.purchases),
        renewals: Number(r.renewals),
        cancellations: Number(r.cancellations),
        redemptions: Number(r.redemptions),
        aiFailures: Number(r.ai_failures),
      };
    }),
    recent: {
      billing: billing.rows.map((r) => ({ type: r.type ?? null, ref: r.ref ?? null, email: r.email ?? null, at: new Date(r.received_at).toISOString() })),
      redemptions: redemptions.rows.map((r) => ({ code: r.code, ref: r.ref, email: r.email ?? null, at: new Date(r.at).toISOString() })),
      signups: signups.rows.map((r) => ({ ref: r.ref, email: r.email ?? null, device: r.device ?? null, at: new Date(r.created_at).toISOString() })),
    },
    attention: {
      queue: Number(a.queue ?? 0),
      aiFailures24h: Number(a.failures ?? 0),
      partnersOwedUsd: Math.max(0, Math.round(Number(a.owed ?? 0) * 100) / 100),
      partnersPendingUsd: Math.round(Number(a.pending ?? 0) * 100) / 100,
    },
    billingEventsEver: Number(a.billing_ever ?? 0),
  };
}

// ── Account deletion requests (from the public page) ──────────────────────

export async function addDeletionRequest(email: string, note: string | null): Promise<boolean> {
  if (!pool) return false;
  // The same address asking again while a request is open adds nothing.
  await pool.query(
    `INSERT INTO deletion_requests (email, note)
     SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM deletion_requests WHERE lower(email) = lower($1) AND done_at IS NULL)`,
    [email, note],
  );
  return true;
}

export interface DeletionRequest {
  id: number;
  email: string;
  note: string | null;
  createdAt: string;
  doneAt: string | null;
  /** Accounts on the server with that address, so the admin can delete the right one. */
  refs: string[];
}

export async function listDeletionRequests(): Promise<DeletionRequest[]> {
  if (!pool) return [];
  const res = await pool.query(
    `SELECT d.*, COALESCE((SELECT array_agg(u.ref) FROM app_users u WHERE lower(u.email) = lower(d.email)), '{}') AS refs
       FROM deletion_requests d ORDER BY (d.done_at IS NULL) DESC, d.created_at DESC LIMIT 200`,
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    email: r.email,
    note: r.note ?? null,
    createdAt: new Date(r.created_at).toISOString(),
    doneAt: r.done_at ? new Date(r.done_at).toISOString() : null,
    refs: (r.refs as string[]) ?? [],
  }));
}

export async function markDeletionRequestDone(id: number): Promise<boolean> {
  if (!pool) return false;
  const res = await pool.query(`UPDATE deletion_requests SET done_at = now() WHERE id = $1 AND done_at IS NULL`, [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function openDeletionRequests(): Promise<number> {
  if (!pool) return 0;
  const res = await pool.query(`SELECT COUNT(*)::int AS n FROM deletion_requests WHERE done_at IS NULL`);
  return Number(res.rows[0]?.n ?? 0);
}
