/**
 * Prices used to turn recorded token usage into costs.
 *
 * Keys are exact model ids, or prefixes ending with `*` (`gpt-4o*`). The most specific
 * key wins. Only prices verified against the vendor's documentation ship as defaults;
 * add your own contract prices with `SDKConfig.pricing`.
 */
export interface ModelPrice {
  /** USD per million input tokens. */
  inputPerMillion: number;
  /** USD per million output tokens. */
  outputPerMillion: number;
}

export type PricingTable = Record<string, ModelPrice>;

/**
 * Jev bills input tokens only: $0.042 per million (docs.typesafe.ai/models, checked
 * 2026-09-23), the same through Vercel AI Gateway (`typesafe-ai/jev`). LLM prices change
 * often and depend on contracts, so they are left to the configuration.
 */
export const DEFAULT_PRICING: PricingTable = {
  'jev-*': { inputPerMillion: 0.042, outputPerMillion: 0 },
  'typesafe-ai/jev*': { inputPerMillion: 0.042, outputPerMillion: 0 },
};

/**
 * Finds the price of a model. Candidates are tried in order (typically the versioned id
 * returned by the provider, then the name that was requested): exact keys first, then the
 * longest matching `prefix*` key.
 */
export function findModelPrice(
  table: PricingTable,
  ...models: Array<string | undefined>
): ModelPrice | undefined {
  const candidates = models.filter((model): model is string => Boolean(model));
  for (const model of candidates) {
    const exact = table[model];
    if (exact) {
      return exact;
    }
  }
  for (const model of candidates) {
    let best: { length: number; price: ModelPrice } | undefined;
    for (const [key, price] of Object.entries(table)) {
      if (!key.endsWith('*')) continue;
      const prefix = key.slice(0, -1);
      if (model.startsWith(prefix) && (!best || prefix.length > best.length)) {
        best = { length: prefix.length, price };
      }
    }
    if (best) {
      return best.price;
    }
  }
  return undefined;
}

export function costOf(price: ModelPrice, inputTokens: number, outputTokens: number): number {
  return (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1_000_000;
}
