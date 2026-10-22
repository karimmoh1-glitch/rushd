// Provider list prices in USD per million tokens, used to turn the
// provider-reported token usage into a cost. Update when prices change.
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

// Used when a fallback model answers and isn't in the table: price it at the
// most expensive rate we know rather than undercount.
const FALLBACK_PRICE: ModelPrice = { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Cost in micro-dollars (1e-6 USD), rounded up. */
export function costMicros(model: string, usage: TokenUsage): number {
  const p = MODEL_PRICES[model] ?? FALLBACK_PRICE;
  const usd =
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      (usage.cacheReadTokens ?? 0) * p.cacheRead +
      (usage.cacheWriteTokens ?? 0) * p.cacheWrite) /
    1_000_000;
  return Math.ceil(usd * 1_000_000);
}

export const usd = (micros: number) => micros / 1_000_000;
export const toMicros = (dollars: number) => Math.round(dollars * 1_000_000);
