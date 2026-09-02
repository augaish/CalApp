/**
 * Per-1M-token USD list pricing, used only to estimate AI cost for the admin
 * dashboard — never for billing decisions. Matched by substring since model
 * ids carry date suffixes (e.g. claude-haiku-4-5-20251001) that would drift
 * out of an exact lookup as new dated snapshots roll out.
 */
const PRICING: { match: RegExp; inputPer1M: number; outputPer1M: number }[] = [
  { match: /opus/i, inputPer1M: 5, outputPer1M: 25 },
  { match: /sonnet/i, inputPer1M: 3, outputPer1M: 15 },
  { match: /haiku/i, inputPer1M: 1, outputPer1M: 5 },
];

// An unrecognized model id (e.g. ANTHROPIC_MODEL overridden to something new)
// falls back to Haiku-tier pricing — this app's own default model — rather
// than guessing high.
const FALLBACK = { inputPer1M: 1, outputPer1M: 5 };

/** Approximate USD cost of one model call from its token counts. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING.find((row) => row.match.test(model)) ?? FALLBACK;
  return (inputTokens / 1_000_000) * p.inputPer1M + (outputTokens / 1_000_000) * p.outputPer1M;
}

/**
 * Rough blended USD cost per counted action, by usage-counter `kind` — used
 * ONLY for the admin dashboard's "Historical" column, covering usage from
 * before real per-request token tracking existed. A single flat rate badly
 * undercounts this app's real spend because the kinds are not alike:
 *  - coach: carries the full recent conversation (up to 12 messages) plus a
 *    system prompt embedding the user's own data context — routinely several
 *    thousand input tokens, not a couple hundred.
 *  - equipment: can be TWO model calls (identify the machine, then generate
 *    its details) behind one counted action — a flat per-action rate silently
 *    halves this one whenever it's a cache miss.
 *  - describe (analyze-text/refine-meal): uses the web-search tool, which
 *    carries its own per-search fee entirely separate from token pricing,
 *    plus the extra tokens of ingesting search results.
 *  - meal/bodyReading/exercise/program: single call, sized more like the
 *    flat guess actually assumed.
 * Each figure is a rough estimate of that kind's typical size at Haiku-tier
 * pricing — not a measurement, and not meant to reconcile exactly against a
 * real Anthropic Console bill.
 */
export const HISTORICAL_COST_PER_ACTION_USD: Record<string, number> = {
  meal: 0.004,
  bodyReading: 0.005,
  equipment: 0.006,
  exercise: 0.0015,
  describe: 0.012,
  coach: 0.012,
  program: 0.012,
};

/** Kind not in the table above (should not happen, but never let a lookup miss undercount to 0). */
export const HISTORICAL_COST_FALLBACK_USD = 0.004;
