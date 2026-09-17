/**
 * Why an AI call failed, in a form the app and the dashboard can act on.
 *
 * Every AI route used to answer `analysis_failed` for anything that threw —
 * a dead API key, a model that no longer exists, a rate limit, a timeout, and
 * a genuinely malformed reply all arrived at the client as one code. The app
 * could then only guess, and did: it told people the recipe "came back
 * incomplete" and suggested rewording, which is a diagnosis nobody had
 * established. A tester duly typed the simplest dish name there is and it
 * failed again, because the fault was never in the request.
 *
 * The server already knows. Both clients throw with the provider's status and
 * body in the message; it was being discarded one line later. This turns it
 * into a code, and `describeAiError` keeps the raw text for the dashboard, so
 * a failure in production can be read rather than reproduced.
 *
 * Deliberately dependency-free: no SDK import, no database, no Hono. It
 * matches on the shape of what the providers actually throw, which means it
 * can be exercised against those shapes directly in a test.
 */

export type AiFailureCode =
  /** The provider account has no credit left. Nothing retrying can fix. */
  | 'ai_credits_exhausted'
  /** Key missing, wrong, or revoked. Configuration, not usage. */
  | 'ai_unauthorized'
  /** The configured model name does not exist or is not available to us. */
  | 'ai_model_unavailable'
  /** Too many requests. Worth retrying shortly. */
  | 'ai_rate_limited'
  /** The provider is overloaded. Worth retrying shortly. */
  | 'ai_overloaded'
  /** Never got an answer: network, DNS, timeout, aborted. */
  | 'ai_timeout'
  /** The provider rejected the request itself — e.g. max_tokens over the
   *  model's ceiling, or a malformed tool schema. Ours to fix, not theirs. */
  | 'ai_bad_request'
  /** The provider answered with an error we have no better name for. */
  | 'ai_provider_error';

export interface AiFailure {
  code: AiFailureCode | string;
  /** HTTP status to answer the app with. */
  httpStatus: 502 | 503;
  /** Whether trying the same thing again could plausibly work. */
  retryable: boolean;
}

interface StatusLike {
  status?: unknown;
  message?: unknown;
  name?: unknown;
  code?: unknown;
  error?: unknown;
}

function messageOf(err: unknown): string {
  if (typeof err === 'string') return err;
  const e = err as StatusLike;
  return typeof e?.message === 'string' ? e.message : String(err ?? '');
}

/**
 * The provider's HTTP status, however it reached us. The Anthropic SDK puts it
 * on `.status`; our DeepSeek client is a bare fetch wrapper that throws
 * `DeepSeek ... failed: 401 {body}`, so the number has to be read back out of
 * the message. Both happen in production and neither is negotiable.
 */
export function providerStatus(err: unknown): number | undefined {
  const e = err as StatusLike;
  if (typeof e?.status === 'number') return e.status;
  const m = /\bfailed:\s*(\d{3})\b/.exec(messageOf(err));
  return m ? Number(m[1]) : undefined;
}

export function classifyAiError(err: unknown): AiFailure {
  const message = messageOf(err);
  const status = providerStatus(err);
  const name = String((err as StatusLike)?.name ?? '');
  const errno = String((err as StatusLike)?.code ?? '');

  // Credit first: Anthropic reports an empty balance as a 400, so status alone
  // would file it as our bad request and send someone hunting a bug in the
  // payload instead of topping up the account.
  if (/credit balance|insufficient[_ ]balance|quota.*exceeded|billing/i.test(message)) {
    return { code: 'ai_credits_exhausted', httpStatus: 503, retryable: false };
  }

  // A key that was never configured never reaches the provider at all.
  if (/API_KEY not set|api key .*(missing|not set)|no api key/i.test(message)) {
    return { code: 'ai_unauthorized', httpStatus: 503, retryable: false };
  }

  if (status === 401 || status === 403 || /authentication_error|permission_error|invalid.*api.?key/i.test(message)) {
    return { code: 'ai_unauthorized', httpStatus: 503, retryable: false };
  }
  if (status === 404 || /not_found_error|model.*(not found|does not exist)|unknown model/i.test(message)) {
    return { code: 'ai_model_unavailable', httpStatus: 503, retryable: false };
  }
  if (status === 429 || /rate_limit/i.test(message)) {
    return { code: 'ai_rate_limited', httpStatus: 503, retryable: true };
  }
  if (status === 529 || /overloaded/i.test(message)) {
    return { code: 'ai_overloaded', httpStatus: 503, retryable: true };
  }
  if (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(errno) ||
    /fetch failed|network|socket hang up|timed? ?out/i.test(message)
  ) {
    return { code: 'ai_timeout', httpStatus: 503, retryable: true };
  }
  if (status === 400 || /invalid_request_error/i.test(message)) {
    return { code: 'ai_bad_request', httpStatus: 502, retryable: false };
  }
  if (typeof status === 'number' && status >= 500) {
    return { code: 'ai_provider_error', httpStatus: 503, retryable: true };
  }
  if (typeof status === 'number' && status >= 400) {
    return { code: 'ai_provider_error', httpStatus: 502, retryable: false };
  }

  // Nothing identifiable. The caller's own fallback applies — for most routes
  // that means the model answered and the answer would not parse, which is the
  // only case where "the reply was unusable" is a true statement.
  return { code: '', httpStatus: 502, retryable: false };
}

/**
 * One line for the dashboard's failure log: enough to act on, capped so a
 * provider that returns an essay cannot fill the table.
 */
export function describeAiError(err: unknown): string {
  const status = providerStatus(err);
  const message = messageOf(err).replace(/\s+/g, ' ').trim();
  // The Anthropic SDK already opens its message with the status, so prefixing
  // unconditionally produced "401 401 {...}".
  const needsStatus = status != null && !message.startsWith(String(status));
  return `${needsStatus ? `${status} ` : ''}${message}`.slice(0, 400);
}
