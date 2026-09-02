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
