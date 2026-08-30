/**
 * WHOOP OAuth 2.0 and the v2 data endpoints — connecting a user's wearable so
 * recovery/strain/sleep can inform calorie-burn accuracy and the coach.
 *
 * Endpoints confirmed via developer.whoop.com (OAuth, workout, cycle,
 * recovery, sleep, pagination docs) — WHOOP uses a single URL for both the
 * initial token exchange and refreshes, and every collection endpoint shares
 * the same { records, next_token } shape.
 */
import { getWhoopConnection, setWhoopConnection } from './db.js';

const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API_BASE = 'https://api.prod.whoop.com/developer/v2';

/** Kept to the data the coach could plausibly use — see the playbook's wearable-sync entry. */
export const WHOOP_SCOPES = ['read:cycles', 'read:workout', 'read:recovery', 'read:sleep'];

export interface WhoopTokenResponse {
  accessToken: string;
  /** Not always reissued — observed missing on a re-authorization. */
  refreshToken?: string;
  expiresAt: Date;
  scope: string;
}

function clientId(): string {
  const id = process.env.WHOOP_CLIENT_ID;
  if (!id) throw new Error('WHOOP_CLIENT_ID not set');
  return id;
}

function clientSecret(): string {
  const secret = process.env.WHOOP_CLIENT_SECRET;
  if (!secret) throw new Error('WHOOP_CLIENT_SECRET not set');
  return secret;
}

export function whoopConfigured(): boolean {
  return !!process.env.WHOOP_CLIENT_ID && !!process.env.WHOOP_CLIENT_SECRET;
}

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: WHOOP_SCOPES.join(' '),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function parseTokenResponse(res: Response): Promise<WhoopTokenResponse> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WHOOP token request failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope,
  };
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<WhoopTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId(),
      client_secret: clientSecret(),
    }),
  });
  return parseTokenResponse(res);
}

export async function refreshWhoopToken(refreshToken: string): Promise<WhoopTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      scope: WHOOP_SCOPES.join(' '),
    }),
  });
  return parseTokenResponse(res);
}

// One in-flight refresh per ref, shared by every concurrent caller instead
// of each firing its own request to WHOOP's token endpoint — the day-burn
// endpoint alone can now be called 3x at once (see training.tsx's recent-
// days refresh), and if WHOOP rotates the refresh token on use (invalidating
// the old one the moment the first request redeems it), every other
// concurrent call still holding that now-dead refresh token would fail with
// no way to recover short of a full reconnect. Deduping the request removes
// that race entirely, whether or not WHOOP actually rotates.
const refreshInFlight = new Map<string, Promise<string | null>>();

/**
 * A usable access token for `ref`, refreshing and persisting a new one first
 * if the stored one is at or near expiry. Returns null when there's no WHOOP
 * connection at all — every caller treats that as "nothing to add", not an
 * error, since WHOOP is optional.
 */
export async function getValidAccessToken(ref: string): Promise<string | null> {
  const conn = await getWhoopConnection(ref);
  if (!conn) return null;
  // A minute of slack so a token doesn't expire mid-request.
  if (new Date(conn.expiresAt).getTime() > Date.now() + 60_000) return conn.accessToken;
  // No refresh_token on file (WHOOP doesn't always reissue one) — nothing to
  // refresh with. The access token is expired, so this really is a dead end;
  // the user will need to reconnect from the app.
  if (!conn.refreshToken) return null;
  const inFlight = refreshInFlight.get(ref);
  if (inFlight) return inFlight;
  const attempt = (async () => {
    try {
      const refreshed = await refreshWhoopToken(conn.refreshToken!);
      await setWhoopConnection(ref, refreshed);
      return refreshed.accessToken;
    } catch (err) {
      console.error('whoop token refresh failed:', err);
      return null;
    } finally {
      refreshInFlight.delete(ref);
    }
  })();
  refreshInFlight.set(ref, attempt);
  return attempt;
}

async function whoopGet<T>(accessToken: string, path: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error(`whoop GET ${path} failed:`, res.status, await res.text().catch(() => ''));
    return null;
  }
  return (await res.json()) as T;
}

export interface WhoopWorkout {
  start: string;
  end: string;
  sportName: string;
  kilojoule: number | null;
  strain: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}

interface WhoopWorkoutRaw {
  start: string;
  end: string;
  sport_name: string;
  score_state: string;
  /** e.g. "-05:00" — the offset the workout was actually recorded in, not the server's or the request's. */
  timezone_offset: string;
  score?: {
    kilojoule?: number;
    strain?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
  };
}

function toWorkout(raw: WhoopWorkoutRaw): WhoopWorkout {
  const scored = raw.score_state === 'SCORED';
  return {
    start: raw.start,
    end: raw.end,
    sportName: raw.sport_name,
    kilojoule: scored ? (raw.score?.kilojoule ?? null) : null,
    strain: scored ? (raw.score?.strain ?? null) : null,
    avgHeartRate: scored ? (raw.score?.average_heart_rate ?? null) : null,
    maxHeartRate: scored ? (raw.score?.max_heart_rate ?? null) : null,
  };
}

/**
 * Workouts overlapping [start, end). One page (25) is always enough for a
 * single day's gym session(s) — no need to paginate further for this.
 */
export async function fetchWorkoutsInRange(
  accessToken: string,
  start: string,
  end: string,
): Promise<WhoopWorkout[]> {
  const params = new URLSearchParams({ start, end, limit: '25' });
  const data = await whoopGet<{ records: WhoopWorkoutRaw[] }>(
    accessToken,
    `/activity/workout?${params.toString()}`,
  );
  return (data?.records ?? []).map(toWorkout);
}

/**
 * The calendar date (YYYY-MM-DD) a workout falls on in the timezone it was
 * actually recorded in — a backfill spans many past days and the user may
 * have traveled or simply live somewhere other than wherever this server
 * happens to run, so the workout's own `timezone_offset` is the only
 * trustworthy source for "what day was this," not the server's clock.
 */
function localDateOf(startIso: string, timezoneOffset: string): string {
  const sign = timezoneOffset.startsWith('-') ? -1 : 1;
  const [hh, mm] = timezoneOffset.replace(/^[+-]/, '').split(':').map(Number);
  const offsetMs = sign * ((hh || 0) * 60 + (mm || 0)) * 60_000;
  const local = new Date(new Date(startIso).getTime() + offsetMs);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface WhoopHistoryWorkout extends WhoopWorkout {
  /** The workout's own local calendar date, YYYY-MM-DD — see localDateOf. */
  localDate: string;
}

/**
 * Every workout from the last `sinceDays`, for a one-time (or periodic)
 * backfill so a WHOOP that already has months of history doesn't start
 * from a blank slate — see the day-burn endpoint for the single-day
 * version this reuses the same scoring rules as. Paginates up to 6 pages
 * (150 workouts) — plenty for months of even twice-daily training, and a
 * firm cap so one very long history can't turn into an unbounded fetch.
 */
export async function fetchWorkoutHistory(
  accessToken: string,
  sinceDays: number,
): Promise<WhoopHistoryWorkout[]> {
  const start = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const end = new Date().toISOString();
  const results: WhoopHistoryWorkout[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < 6; page++) {
    const params = new URLSearchParams({ start, end, limit: '25' });
    if (nextToken) params.set('nextToken', nextToken);
    const data = await whoopGet<{ records: WhoopWorkoutRaw[]; next_token?: string }>(
      accessToken,
      `/activity/workout?${params.toString()}`,
    );
    if (!data) break;
    for (const r of data.records) {
      results.push({ ...toWorkout(r), localDate: localDateOf(r.start, r.timezone_offset) });
    }
    if (!data.next_token) break;
    nextToken = data.next_token;
  }
  return results;
}

export interface WhoopRecovery {
  recoveryScore: number | null;
  hrvMs: number | null;
  restingHr: number | null;
}

/** Most recent scored recovery, or null if there isn't one yet (e.g. still calibrating). */
export async function fetchLatestRecovery(accessToken: string): Promise<WhoopRecovery | null> {
  const data = await whoopGet<{
    records: { score_state: string; score?: { recovery_score?: number; hrv_rmssd_milli?: number; resting_heart_rate?: number } }[];
  }>(accessToken, '/recovery?limit=1');
  const r = data?.records?.[0];
  if (!r || r.score_state !== 'SCORED') return null;
  return {
    recoveryScore: r.score?.recovery_score ?? null,
    hrvMs: r.score?.hrv_rmssd_milli ?? null,
    restingHr: r.score?.resting_heart_rate ?? null,
  };
}

export interface WhoopSleep {
  performancePercent: number | null;
  hours: number | null;
}

/** Most recent scored sleep (the last main sleep, not a nap). */
export async function fetchLatestSleep(accessToken: string): Promise<WhoopSleep | null> {
  const data = await whoopGet<{
    records: {
      nap: boolean;
      score_state: string;
      score?: { sleep_performance_percentage?: number; stage_summary?: { total_in_bed_time_milli?: number; total_awake_time_milli?: number } };
    }[];
  }>(accessToken, '/activity/sleep?limit=5');
  const r = data?.records?.find((rec) => !rec.nap && rec.score_state === 'SCORED');
  if (!r) return null;
  const stage = r.score?.stage_summary;
  const asleepMs =
    stage?.total_in_bed_time_milli != null && stage?.total_awake_time_milli != null
      ? stage.total_in_bed_time_milli - stage.total_awake_time_milli
      : null;
  return {
    performancePercent: r.score?.sleep_performance_percentage ?? null,
    hours: asleepMs != null ? Math.round((asleepMs / 3_600_000) * 10) / 10 : null,
  };
}

/** Strain accumulated so far in the current (still-open) physiological cycle. */
export async function fetchTodayStrain(accessToken: string): Promise<number | null> {
  const data = await whoopGet<{ records: { score_state: string; score?: { strain?: number } }[] }>(
    accessToken,
    '/cycle?limit=1',
  );
  const r = data?.records?.[0];
  if (!r || r.score_state !== 'SCORED') return null;
  return r.score?.strain ?? null;
}

/** 1 kJ ≈ 0.239 kcal — WHOOP reports energy in kilojoules, everywhere else in this app is kcal. */
export function kilojoulesToKcal(kj: number): number {
  return kj / 4.184;
}
