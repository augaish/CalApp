import { classifyAiError, describeAiError } from './ai-failure.js';
import type { AiProvider } from './billing.js';
import { deepseekConfigured } from './deepseek.js';

export interface FallbackDeps {
  /** Whether a provider can be called at all (its key is set). */
  available: (p: AiProvider) => boolean;
  /** Where a fallback is written down, so the broken side gets noticed. */
  record: (f: { route: string; code: string; detail: string }) => Promise<void>;
}

const defaultDeps = async (): Promise<FallbackDeps> => {
  const { recordAiFailure } = await import('./db.js');
  return {
    available: (p) => (p === 'deepseek' ? deepseekConfigured() : !!process.env.ANTHROPIC_API_KEY),
    record: (f) => recordAiFailure(f),
  };
};

/**
 * Run one generation on the tier's AI, and when that fails — an error, or an
 * answer we cannot use — once more on the other AI before giving up.
 *
 * The recipe and programme routes went down for everyone on one tier when
 * DeepSeek started refusing their request shape, although Claude could have
 * answered all along. A person asking for a recipe does not care which
 * model writes it; they care that a working one did. Each fallback is still
 * recorded in the AI failures log so the broken side gets noticed and fixed.
 *
 * Returns null when every AI that answered gave something unusable; rethrows
 * the last error when none answered at all.
 */
export async function withProviderFallback<T>(
  route: string,
  primary: AiProvider,
  run: Record<AiProvider, () => Promise<T | null | undefined>>,
  deps?: FallbackDeps,
): Promise<T | null> {
  const { available, record } = deps ?? (await defaultDeps());
  const other: AiProvider = primary === 'deepseek' ? 'claude' : 'deepseek';
  const order = [primary, ...(available(other) ? [other] : [])];
  let lastErr: unknown = null;
  let answered = false;
  for (const provider of order) {
    try {
      const result = await run[provider]();
      if (result) return result;
      answered = true;
      if (provider !== order[order.length - 1]) {
        void record({ route, code: 'analysis_failed', detail: `${provider} gave an unusable answer; trying ${other}` }).catch(() => {});
      }
    } catch (err) {
      lastErr = err;
      if (provider !== order[order.length - 1]) {
        const code = classifyAiError(err).code || 'unknown';
        console.warn(`${route}: ${provider} failed [${code}], falling back:`, describeAiError(err));
        void record({ route, code, detail: `${provider} (fell back): ${describeAiError(err)}` }).catch(() => {});
      }
    }
  }
  if (answered) return null;
  throw lastErr;
}

