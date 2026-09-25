import type { WebClient } from './guarded-http.js';
import type { SearchHit, SearchProvider, SearchRequest } from './search-provider.js';
import { SearchThrottledError, SearchUnavailableError, WebHttpError } from './web-errors.js';

/** A provider that did not answer a search, and why. */
export interface ProviderFailure {
  provider: string;
  message: string;
}

export interface CircuitBreakerOptions {
  /** How long a provider is left alone once its breaker opens. Default 120 000 ms. */
  cooldownMs?: number;
  /**
   * Consecutive failures that open the breaker. Default 3. A throttled provider (429, captcha)
   * opens it at once.
   */
  failureThreshold?: number;
}

interface Breaker {
  failures: number;
  openUntil: number;
  lastError: string;
}

/**
 * Providers tried in order, each behind a circuit breaker: a provider that fails or is
 * throttled hands over to the next one, and once its breaker is open it is skipped until its
 * cooldown ends; then it gets one more try.
 */
export class SearchChain {
  private readonly breakers = new Map<SearchProvider, Breaker>();
  private readonly cooldownMs: number;
  private readonly failureThreshold: number;

  constructor(
    private readonly providers: SearchProvider[],
    options: CircuitBreakerOptions = {}
  ) {
    if (providers.length === 0) throw new Error('web_search needs at least one search provider');
    this.cooldownMs = options.cooldownMs ?? 120_000;
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 3);
    for (const provider of providers) {
      this.breakers.set(provider, { failures: 0, openUntil: 0, lastError: '' });
    }
  }

  get names(): string[] {
    return this.providers.map((provider) => provider.name);
  }

  /** `clientFor` gives each provider its HTTP client (with its `configuredOrigin`, if any). */
  async search(
    request: SearchRequest,
    clientFor: (provider: SearchProvider) => WebClient
  ): Promise<{ provider: string; hits: SearchHit[]; errors: ProviderFailure[] }> {
    const errors: ProviderFailure[] = [];
    for (const provider of this.providers) {
      const breaker = this.breakers.get(provider) as Breaker;
      const now = Date.now();
      if (breaker.openUntil > now) {
        errors.push({
          provider: provider.name,
          message: `skipped until ${new Date(breaker.openUntil).toISOString()} after: ${breaker.lastError}`,
        });
        continue;
      }
      try {
        const hits = await provider.search(request, clientFor(provider));
        breaker.failures = 0;
        breaker.openUntil = 0;
        return { provider: provider.name, hits, errors };
      } catch (error) {
        // A cancelled call says nothing about the provider.
        if (request.signal?.aborted) throw error;
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ provider: provider.name, message });
        breaker.failures++;
        breaker.lastError = message;
        const throttled =
          error instanceof SearchThrottledError ||
          (error instanceof WebHttpError && error.status === 429);
        if (throttled || breaker.failures >= this.failureThreshold) {
          breaker.openUntil = Date.now() + this.cooldownMs;
        }
      }
    }
    throw new SearchUnavailableError(
      `no search provider answered: ${errors.map((failure) => `${failure.provider}: ${failure.message}`).join('; ')}`,
      errors
    );
  }
}
