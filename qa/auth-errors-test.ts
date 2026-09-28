// Sign-in failures in words, and one quiet retry after a dropped connection.
import { authFailure, isNetworkError, retryOnNetwork } from '/home/user/CalApp/src/lib/auth-errors.ts';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const e = (m: string) => new Error(m);
check("iOS's dropped connection is a network error", isNetworkError(e('fetch failed: UnexpectedException: The network connection was lost. (at ExpoModulesCore/Promise.swift:56)')));
check('React Native offline is a network error', isNetworkError(new TypeError('Network request failed')));
check('a wrong code is not a network error', !isNetworkError(e('Token has expired or is invalid')));
check('dropped connection → "connection dropped", not raw text', authFailure(e('fetch failed: The network connection was lost.'), 'send').kind === 'network');
check('Supabase rate limit → "wait a moment"', authFailure(e('For security purposes, you can only request this after 42 seconds.'), 'send').kind === 'rateLimited');
check('expired code on verify → "code not right"', authFailure(e('Token has expired or is invalid'), 'verify').kind === 'badCode');
const other = authFailure(e('Signups not allowed for otp'), 'send');
check('anything else keeps its detail for support', other.kind === 'other' && other.detail === 'Signups not allowed for otp');

let calls = 0;
const flaky = async () => { calls++; if (calls === 1) throw e('The network connection was lost.'); return 'ok'; };
check('one dropped connection is retried and succeeds', (await retryOnNetwork(flaky, async () => {})) === 'ok' && calls === 2);
let calls2 = 0;
try { await retryOnNetwork(async () => { calls2++; throw e('Token has expired or is invalid'); }, async () => {}); } catch { /* expected */ }
check('other errors are not retried', calls2 === 1);
let calls3 = 0;
try { await retryOnNetwork(async () => { calls3++; throw e('Network request failed'); }, async () => {}); } catch { /* expected */ }
check('only one retry, not a loop', calls3 === 2);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
