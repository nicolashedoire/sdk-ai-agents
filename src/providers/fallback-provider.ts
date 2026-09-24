import { LLMProviderError } from '../errors/index.js';
import type { LLMProvider, LLMRequest, LLMResponse } from './llm-provider.js';

/**
 * Provider wrapper that implements fallback logic between multiple providers.
 *
 * When a request fails with the primary provider, it automatically tries
 * the fallback providers in order until one succeeds or all fail.
 */
export interface FallbackResult {
  response: LLMResponse;
  usedProvider: string;
  wasFallback: boolean;
  attemptedProviders: string[];
  /** Model sent to the provider that answered; absent when it used its default model. */
  requestedModel?: string;
}

export class FallbackProvider implements LLMProvider {
  private providers: LLMProvider[];
  private fallbackProviders: LLMProvider[];

  /**
   * Creates a FallbackProvider with a primary provider and optional fallback providers.
   *
   * @param primaryProvider - The primary provider to use
   * @param fallbackProviders - Array of fallback providers to try if primary fails
   */
  constructor(primaryProvider: LLMProvider, fallbackProviders: LLMProvider[] = []) {
    if (!primaryProvider) {
      throw new Error('Primary provider is required');
    }
    this.providers = [primaryProvider, ...fallbackProviders];
    this.fallbackProviders = fallbackProviders;
  }

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    const result = await this.generateCompletionWithFallback(request);
    return result.response;
  }

  /**
   * Generates completion with fallback and returns metadata about which provider was used.
   */
  async generateCompletionWithFallback(request: LLMRequest): Promise<FallbackResult> {
    const attemptedProviders: string[] = [];
    const failures: Array<{ provider: string; error: Error }> = [];

    for (const [index, provider] of this.providers.entries()) {
      const providerName = provider.getProviderName();
      attemptedProviders.push(providerName);
      const providerRequest = this.requestFor(provider, index, request);

      try {
        const response = await provider.generateCompletion(providerRequest);
        return {
          response,
          usedProvider: providerName,
          wasFallback: index > 0,
          attemptedProviders,
          ...(providerRequest.model ? { requestedModel: providerRequest.model } : {}),
        };
      } catch (error) {
        failures.push({
          provider: providerName,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    throw this.wrapError(failures, attemptedProviders);
  }

  /**
   * The request for one provider: its own settings and a model it serves. The primary gets the
   * requested model; a fallback gets it only if it supports it, and its own default model
   * otherwise (Anthropic refuses an OpenAI model name, and the other way round).
   */
  private requestFor(provider: LLMProvider, index: number, request: LLMRequest): LLMRequest {
    const resolved = this.resolveProviderSettings(request, provider.getProviderName());
    if (index === 0 || !request.model || provider.supportsModel(request.model)) {
      return resolved;
    }
    return { ...resolved, model: '' };
  }

  /**
   * Resolves provider-specific settings from request.
   * Priority: provider-specific > default > direct temperature/maxTokens
   */
  private resolveProviderSettings(request: LLMRequest, providerName: string): LLMRequest {
    if (!request.providerSettings) {
      return request; // No provider settings, use direct temperature/maxTokens
    }

    const defaultSettings = request.providerSettings.default || {};
    const providerSpecificSettings =
      providerName === 'openai'
        ? request.providerSettings.openai
        : providerName === 'anthropic'
          ? request.providerSettings.anthropic
          : undefined;

    // Merge settings: provider-specific > default > direct
    const temperature =
      providerSpecificSettings?.temperature ?? defaultSettings.temperature ?? request.temperature;

    const maxTokens =
      providerSpecificSettings?.maxTokens ?? defaultSettings.maxTokens ?? request.maxTokens;

    // Return new request with resolved settings
    return {
      ...request,
      temperature,
      maxTokens,
      // Remove providerSettings to avoid double resolution
      providerSettings: undefined,
    };
  }

  supportsModel(model: string): boolean {
    // Return true if any provider supports the model
    return this.providers.some((provider) => provider.supportsModel(model));
  }

  getProviderName(): string {
    // Return primary provider name with fallback indicator
    const primaryName = this.providers[0].getProviderName();
    if (this.fallbackProviders.length > 0) {
      const fallbackNames = this.fallbackProviders.map((p) => p.getProviderName()).join(', ');
      return `${primaryName} (fallback: ${fallbackNames})`;
    }
    return primaryName;
  }

  /**
   * Gets the primary provider name (without fallback info)
   */
  getPrimaryProviderName(): string {
    return this.providers[0].getProviderName();
  }

  /**
   * Gets all fallback provider names
   */
  getFallbackProviderNames(): string[] {
    return this.fallbackProviders.map((p) => p.getProviderName());
  }

  /**
   * Checks if a fallback occurred (i.e., if we have fallback providers configured)
   */
  hasFallbackProviders(): boolean {
    return this.fallbackProviders.length > 0;
  }

  /**
   * One error for the whole chain: its message names every attempt with its own error, and
   * its `cause` is the last vendor error, whose status and headers stay available.
   */
  private wrapError(
    failures: Array<{ provider: string; error: Error }>,
    attemptedProviders: string[]
  ): LLMProviderError {
    const attempts = failures
      .map(({ provider, error }) => `${provider}: ${vendorMessage(error)}`)
      .join('; ');
    const last = failures.at(-1)?.error;
    const cause = last instanceof LLMProviderError ? last.originalError : last;
    return new LLMProviderError(
      attemptedProviders.join(' -> '),
      new Error(`All providers failed: ${attempts}`, { cause }),
      true
    );
  }
}

/** The vendor's own message, without the "LLM provider error: <name>:" prefix of the wrapper. */
function vendorMessage(error: Error): string {
  return error instanceof LLMProviderError ? error.originalError.message : error.message;
}
