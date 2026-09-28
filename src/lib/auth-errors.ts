/**
 * What went wrong with a sign-in, in words a person can act on — kept free
 * of React Native so it can be tested. Raw provider text ("fetch failed:
 * UnexpectedException…") is never the message; it is kept only as a detail
 * for the unknown case, where it is the one thing support can go on.
 */

const NETWORK = /network connection was lost|network request failed|fetch failed|timed out|timeout|offline|internet connection|could not connect|socket|ENOTFOUND|ECONNRESET/i;
const RATE = /rate limit|security purposes|too many|after \d+ seconds/i;
const BAD_CODE = /token has expired|invalid|otp_expired|expired/i;

export function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
  return NETWORK.test(msg);
}

export type AuthFailure =
  | { kind: 'network' }
  | { kind: 'rateLimited' }
  | { kind: 'badCode' }
  | { kind: 'other'; detail?: string };

export function authFailure(err: unknown, stage: 'send' | 'verify' | 'provider'): AuthFailure {
  const msg = err instanceof Error ? err.message.trim() : String(err ?? '').trim();
  if (isNetworkError(err)) return { kind: 'network' };
  if (RATE.test(msg)) return { kind: 'rateLimited' };
  if (stage === 'verify' && BAD_CODE.test(msg)) return { kind: 'badCode' };
  return { kind: 'other', detail: msg || undefined };
}

/** Run once more after a dropped connection — a phone switching masts drops a reused socket. */
export async function retryOnNetwork<T>(run: () => Promise<T>, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await wait(700);
    return run();
  }
}
