// Reading Google's sign-in reply (via Supabase): a PKCE code, implicit-flow
// tokens in the fragment, an error, or nothing.
import { parseAuthCallback } from '/home/user/CalApp/src/lib/auth-callback.ts';

let fails = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — got=${JSON.stringify(got)}`}`);
  if (!ok) fails++;
};
eq('PKCE code in the query', parseAuthCallback('calapp://auth-callback?code=abc123'), { kind: 'code', code: 'abc123' });
eq('implicit tokens in the fragment', parseAuthCallback('calapp://auth-callback#access_token=a.b.c&refresh_token=r1&expires_in=3600&token_type=bearer'), { kind: 'tokens', accessToken: 'a.b.c', refreshToken: 'r1' });
eq('an error wins, decoded', parseAuthCallback('calapp://auth-callback?error=access_denied&error_description=Unsupported+provider%3A+provider+is+not+enabled'), { kind: 'error', message: 'Unsupported provider: provider is not enabled' });
eq('an error in the fragment', parseAuthCallback('calapp://auth-callback#error=server_error&error_description=Database%20error'), { kind: 'error', message: 'Database error' });
eq('nothing usable', parseAuthCallback('calapp://auth-callback'), { kind: 'empty' });
eq('only an access token is not enough', parseAuthCallback('calapp://auth-callback#access_token=x'), { kind: 'empty' });
eq('Expo Go style URL', parseAuthCallback('exp://192.168.1.2:8081/--/auth-callback?code=zz'), { kind: 'code', code: 'zz' });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
