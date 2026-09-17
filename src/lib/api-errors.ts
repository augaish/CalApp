/**
 * The failure types every AI call can raise, and the rule for what to say
 * about each one.
 *
 * Kept in its own leaf module — no React Native imports, no network code — so
 * the decision below can be exercised directly in a test. That matters more
 * than it sounds: `Alert.alert` is a no-op on react-native-web (`static
 * alert() {}`), so a browser test cannot see a single one of these messages.
 * Whether the right thing is said has to be provable somewhere, and this is
 * that somewhere.
 */

/** Raised when the caller has used up the month's AI allowance. */
export class QuotaError extends Error {
  constructor(
    public plan: string,
    public used: number,
    public limit: number,
  ) {
    super('quota_exceeded');
    this.name = 'QuotaError';
  }
}

/** Raised when the caller's plan does not include the feature at all. */
export class FeatureLockedError extends Error {
  constructor(public plan: string) {
    super('feature_locked');
    this.name = 'FeatureLockedError';
  }
}

/** Raised when the server answered, and answered with a refusal. */
export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'ApiError';
  }
}

/**
 * Codes that mean the AI service failed, not the request. The server names
 * these from the provider's own status; see server/src/ai-failure.ts.
 */
const AI_SERVICE_CODES = [
  'ai_unauthorized',
  'ai_model_unavailable',
  'ai_rate_limited',
  'ai_overloaded',
  'ai_timeout',
  'ai_bad_request',
  'ai_provider_error',
];

/** The subset worth waiting out rather than reporting. */
const RETRYABLE_CODES = ['ai_rate_limited', 'ai_overloaded', 'ai_timeout'];

export type AiFailureAction =
  /** Nothing to explain in a dialog: the upgrade screen states the case. */
  | { kind: 'upgrade'; reason: 'quota' | 'coach' }
  | { kind: 'alert'; titleKey: string; bodyKey: string; values?: Record<string, string> };

/**
 * What to do about a failed AI call.
 *
 * The distinctions are the whole point. "Something went wrong, please try
 * again" is not merely vague — it is false for three of these five cases,
 * because retrying cannot refill a spent allowance, cannot unlock a feature
 * the plan excludes, and cannot put credit into an empty AI account. A person
 * given that message taps the button repeatedly and concludes the app is
 * broken, which is a fair conclusion from the evidence they were handed.
 *
 * `unusable` is passed in because each feature words its own "the model
 * returned something we can't use" differently — a recipe suggests a shorter
 * request, a meal scan suggests a clearer photo.
 */
export function aiFailureAction(
  err: unknown,
  unusable: { titleKey: string; bodyKey: string },
): AiFailureAction {
  if (err instanceof QuotaError) return { kind: 'upgrade', reason: 'quota' };
  if (err instanceof FeatureLockedError) return { kind: 'upgrade', reason: 'coach' };

  // Not an ApiError means the request never got an answer at all: fetch()
  // rejects rather than resolving when there is no route to the server.
  if (!(err instanceof ApiError)) {
    return { kind: 'alert', titleKey: 'common.offlineTitle', bodyKey: 'common.offlineBody' };
  }

  if (err.code === 'ai_credits_exhausted') {
    return {
      kind: 'alert',
      titleKey: 'common.aiCreditsExhaustedTitle',
      bodyKey: 'common.aiCreditsExhausted',
    };
  }

  // The service itself is down or misconfigured: a dead key, a model that is
  // no longer available, a rate limit, a timeout, a request the provider
  // rejected. None of these are caused by what the person typed, and telling
  // them to reword it — as this screen did — sends them chasing a fault that
  // is not theirs. A tester typed the simplest dish name there is, twice.
  if (AI_SERVICE_CODES.includes(err.code)) {
    return {
      kind: 'alert',
      titleKey: 'common.aiDownTitle',
      bodyKey: RETRYABLE_CODES.includes(err.code) ? 'common.aiDownBusy' : 'common.aiDownBody',
    };
  }

  // Only here did the model actually answer with something we could not use,
  // which is the one case where suggesting a simpler request is honest. The
  // server releases the reservation on this path, so the copy may also promise
  // the allowance is intact.
  if (err.code === 'analysis_failed') {
    return { kind: 'alert', titleKey: unusable.titleKey, bodyKey: unusable.bodyKey };
  }

  // Anything left is a server fault. Carry the code: "http_500" is not
  // friendly, but it is reportable, and a bug nobody can describe is a bug
  // nobody can fix.
  return {
    kind: 'alert',
    titleKey: 'common.error',
    bodyKey: 'common.errorCode',
    values: { code: err.code },
  };
}
