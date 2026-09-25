import type { WebClient } from './guarded-http.js';
import type { SearchHit, SearchProvider, SearchRequest } from './search-provider.js';
import { isThrottle, retryOnceIfThrottled, THROTTLE_WAIT_MS } from './throttle.js';
import { SearchThrottledError, SearchUnavailableError } from './web-errors.js';

/** A provider that did not answer a search, and why. */
export interface ProviderFailure {
  provider: string;
  message: string;
}

export interface CircuitBreakerOptions {
  /** How long a provider is left alone once its breaker opens. Default 120 000 ms. */
  cooldownMs?: number;
  /**
   * Consecutive failures that open the breaker. Default 3. A provider still throttled after
   * its second try (429, captcha, empty page) opens it at once.
   */
  failureThreshold?: number;
}

interface Breaker {
  failures: number;
  openUntil: number;
  lastError: string;
  /** It opened because the provider was throttled. */
  throttled: boolean;
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
  private readonly throttleWaitMs: number;

  /**
   * @param throttleWaitMs how long to wait before a throttled provider's second try, when it
   *   does not say (`Retry-After`)
   */
  constructor(
    private readonly providers: SearchProvider[],
    options: CircuitBreakerOptions = {},
    throttleWaitMs = THROTTLE_WAIT_MS
  ) {
    if (providers.length === 0) throw new Error('web_search needs at least one search provider');
    this.cooldownMs = options.cooldownMs ?? 120_000;
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 3);
    this.throttleWaitMs = throttleWaitMs;
    for (const provider of providers) {
      this.breakers.set(provider, { failures: 0, openUntil: 0, lastError: '', throttled: false });
    }
  }

  get names(): string[] {
    return this.providers.map((provider) => provider.name);
  }

  /**
   * `clientFor` gives each provider its HTTP client (with its `configuredOrigin`, if any). A
   * throttled provider gets a second try after a wait, when `deadline` leaves room.
   */
  async search(
    request: SearchRequest,
    clientFor: (provider: SearchProvider) => WebClient,
    deadline?: number
  ): Promise<{ provider: string; hits: SearchHit[]; errors: ProviderFailure[] }> {
    const errors: ProviderFailure[] = [];
    let allThrottled = true;
    let retryAt: number | undefined;
    for (const provider of this.providers) {
      const breaker = this.breakers.get(provider) as Breaker;
      const now = Date.now();
      if (breaker.openUntil > now) {
        errors.push({
          provider: provider.name,
          message: `skipped until ${new Date(breaker.openUntil).toISOString()} after: ${breaker.lastError}`,
        });
        allThrottled &&= breaker.throttled;
        retryAt = Math.min(retryAt ?? breaker.openUntil, breaker.openUntil);
        continue;
      }
      try {
        const hits = await retryOnceIfThrottled(
          () => provider.search(request, clientFor(provider)),
          {
            waitMs: this.throttleWaitMs,
            ...(deadline !== undefined ? { deadline } : {}),
            ...(request.signal ? { signal: request.signal } : {}),
          }
        );
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
        const throttled = isThrottle(error);
        allThrottled &&= throttled;
        if (throttled || breaker.failures >= this.failureThreshold) {
          // A provider that asked for a longer wait than the cooldown gets it.
          const asked = error instanceof SearchThrottledError ? (error.retryAfterMs ?? 0) : 0;
          breaker.openUntil = Date.now() + Math.max(this.cooldownMs, asked);
          breaker.throttled = throttled;
          retryAt = Math.min(retryAt ?? breaker.openUntil, breaker.openUntil);
        }
      }
    }
    throw new SearchUnavailableError(
      `no search provider answered: ${errors.map((failure) => `${failure.provider}: ${failure.message}`).join('; ')}`,
      errors,
      allThrottled,
      retryAt === undefined ? undefined : Math.max(0, retryAt - Date.now())
    );
  }
}
