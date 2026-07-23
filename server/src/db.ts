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
