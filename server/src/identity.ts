/**
 * Who is calling — and how sure we are.
 *
 * The app names itself in `x-calgym-user`: a guest's random install id, or a
 * signed-in person's account id (their Supabase user id). On its own that
 * header proves nothing, so anyone who learned an account id could act as
 * that person. A signed-in app therefore also sends its Supabase access
 * token, which only Supabase can issue; when it does, the token decides who
 * the caller is.
 *
 * Phones still running a build that predates the token keep working until
 * REQUIRE_ACCOUNT_TOKEN is set on the server. From then on a request without
 * a token can only ever be the bare install it names: never an account id,
 * and never the account an install id was once linked to.
 */
import { adminHeaders } from './supabase-admin.js';

export interface VerifiedUser {
  id: string;
  email: string | null;
}

/** A Supabase user id — the shape of every account ref. */
export const ACCOUNT_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAccountRef(ref: string): boolean {
  return ACCOUNT_REF.test(ref);
}

export function requireAccountToken(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.REQUIRE_ACCOUNT_TOKEN ?? '');
}

export function bearerOf(header: string | undefined): string | null {
  return (header ?? '').match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
}

/** When the token itself says it expires (seconds since epoch), unverified — only to bound the cache. */
function tokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

const cache = new Map<string, { user: VerifiedUser | null; until: number }>();
const CACHE_MS = 5 * 60_000;

/**
 * Ask Supabase whose token this is. Answers are cached for a few minutes (and
 * never past the token's own expiry), so a busy screen costs one lookup, not
 * one per request. Null for a token Supabase does not accept, and when the
 * server has no Supabase settings to ask with.
 */
export async function verifyAccessToken(token: string, fetchImpl: typeof fetch = fetch): Promise<VerifiedUser | null> {
  const now = Date.now();
  const hit = cache.get(token);
  if (hit && hit.until > now) return hit.user;
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return null;
  let user: VerifiedUser | null = null;
  try {
    const res = await fetchImpl(`${url}/auth/v1/user`, { headers: { apikey: adminHeaders(key).apikey, Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const body = (await res.json()) as { id?: string; email?: string | null };
      if (body.id && ACCOUNT_REF.test(body.id)) user = { id: body.id, email: body.email ? body.email.toLowerCase() : null };
    } else if (res.status >= 500) {
      // Supabase having a bad moment is not the token being bad: don't
      // remember it either way.
      return null;
    }
  } catch {
    return null;
  }
  const exp = tokenExpiry(token);
  if (cache.size > 5000) cache.clear();
  cache.set(token, { user, until: Math.min(now + CACHE_MS, exp ?? now + CACHE_MS) });
  return user;
}

export interface IdentityDeps {
  resolveRef: (ref: string) => Promise<string>;
  verify: (token: string) => Promise<VerifiedUser | null>;
  enforce: boolean;
}

/**
 * The ref a request acts as, or null when it may not act as anyone.
 *
 * - A valid token: the token's own account, whatever the header says.
 * - A token Supabase rejects: refused once enforcing; before that, ignored.
 * - No token, not enforcing: the header, followed through any link (as before).
 * - No token, enforcing: an account id is refused, and an install id stays
 *   itself — signing out leaves a guest, not the account it was linked to.
 */
export async function identify(raw: string | null, token: string | null, deps: IdentityDeps): Promise<string | null> {
  if (token) {
    const user = await deps.verify(token);
    if (user) return user.id;
    if (deps.enforce) return null;
  }
  if (!raw) return null;
  if (!deps.enforce) return deps.resolveRef(raw);
  if (isAccountRef(raw)) return null;
  return raw;
}

/**
 * The id the store files this caller's purchases under: the header id when
 * it really is theirs (their account, or an install linked to it), otherwise
 * their own ref — so nobody can sync someone else's subscription onto
 * themselves by naming that person's id.
 */
export async function ownStoreId(raw: string, ref: string, resolveRef: (r: string) => Promise<string>): Promise<string> {
  if (raw === ref) return raw;
  return (await resolveRef(raw)) === ref ? raw : ref;
}
