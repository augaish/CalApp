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

  // The model answered but the answer was unusable. The server releases the
  // reservation on this path, so the copy may promise the allowance is intact.
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
