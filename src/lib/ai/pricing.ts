// Provider list prices in USD per million tokens. Update when prices change.
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

// An unknown (fallback) model is priced at the highest rate we know, so cost is never undercounted.
const FALLBACK_PRICE: ModelPrice = { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Cost in micro-dollars (1e-6 USD), rounded up. */
export function costMicros(model: string, usage: TokenUsage): number {
  const price = MODEL_PRICES[model] ?? FALLBACK_PRICE;
  const cacheReadTokens = usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;

  const totalPerMillion =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    cacheReadTokens * price.cacheRead +
    cacheWriteTokens * price.cacheWrite;
  const dollars = totalPerMillion / 1_000_000;
  return Math.ceil(dollars * 1_000_000);
}

/** Micro-dollars to dollars. */
export function usd(micros: number): number {
  return micros / 1_000_000;
}

/** Dollars to micro-dollars. */
export function toMicros(dollars: number): number {
  return Math.round(dollars * 1_000_000);
}
