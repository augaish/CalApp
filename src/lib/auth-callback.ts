/**
 * Reading what an OAuth sign-in hands back. Supabase returns either a PKCE
 * `code` in the query or, in the implicit flow, the tokens in the fragment —
 * and on failure an `error_description`. Kept free of React Native so it can
 * be tested directly.
 */
export type AuthCallback =
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string }
  | { kind: 'empty' };

export function parseAuthCallback(url: string): AuthCallback {
  const params = new Map<string, string>();
  const take = (part: string) => {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const i = pair.indexOf('=');
      const key = decodeURIComponent((i < 0 ? pair : pair.slice(0, i)).replace(/\+/g, ' '));
      const value = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      params.set(key, value);
    }
  };
  const hash = url.indexOf('#');
  const beforeHash = hash < 0 ? url : url.slice(0, hash);
  const q = beforeHash.indexOf('?');
  if (q >= 0) take(beforeHash.slice(q + 1));
  if (hash >= 0) take(url.slice(hash + 1));

  const err = params.get('error_description') || params.get('error');
  if (err) return { kind: 'error', message: err };
  const code = params.get('code');
  if (code) return { kind: 'code', code };
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };
  return { kind: 'empty' };
}
