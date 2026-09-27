/**
 * Deleting the sign-in account itself, not just what hangs off it.
 *
 * Both stores require that "Delete my account" removes the account. The app
 * signs in through Supabase Auth, and only a server holding the project's
 * service-role key may delete an auth user — so the app sends its own access
 * token, this checks it with Supabase to learn whose account it is, and then
 * deletes that account (and, belt and braces, its cloud backup row).
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server; the key
 * never goes in the app.
 */

export type AuthDeletion = 'deleted' | 'not_signed_in' | 'not_configured' | 'invalid_token' | 'failed';

export function supabaseAdminConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export async function deleteAuthUser(accessToken: string | null, fetchImpl: typeof fetch = fetch): Promise<AuthDeletion> {
  if (!accessToken) return 'not_signed_in';
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return 'not_configured';
  try {
    const me = await fetchImpl(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${accessToken}` } });
    if (!me.ok) return 'invalid_token';
    const id = ((await me.json()) as { id?: string })?.id;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return 'invalid_token';
    const admin = { apikey: key, Authorization: `Bearer ${key}` };
    await fetchImpl(`${url}/rest/v1/user_data?user_id=eq.${id}`, { method: 'DELETE', headers: admin }).catch(() => null);
    const del = await fetchImpl(`${url}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin });
    return del.ok || del.status === 404 ? 'deleted' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * The same, found by email — for a request made from the public deletion
 * page, where there is no sign-in token. Looks through the project's users
 * (a small project: a few pages at most).
 */
export async function deleteAuthUserByEmail(email: string, fetchImpl: typeof fetch = fetch): Promise<AuthDeletion> {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return 'not_configured';
  const admin = { apikey: key, Authorization: `Bearer ${key}` };
  const want = email.trim().toLowerCase();
  try {
    for (let page = 1; page <= 50; page++) {
      const res = await fetchImpl(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: admin });
      if (!res.ok) return 'failed';
      const users = ((await res.json()) as { users?: { id: string; email?: string }[] }).users ?? [];
      const hit = users.find((u) => (u.email ?? '').toLowerCase() === want);
      if (hit) {
        await fetchImpl(`${url}/rest/v1/user_data?user_id=eq.${hit.id}`, { method: 'DELETE', headers: admin }).catch(() => null);
        const del = await fetchImpl(`${url}/auth/v1/admin/users/${hit.id}`, { method: 'DELETE', headers: admin });
        return del.ok || del.status === 404 ? 'deleted' : 'failed';
      }
      if (users.length < 200) return 'not_signed_in';
    }
    return 'not_signed_in';
  } catch {
    return 'failed';
  }
}
