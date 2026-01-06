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
    let lastError: Error | null = null;
    let attemptedProviders: string[] = [];

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      const providerName = provider.getProviderName();
      attemptedProviders.push(providerName);

      try {
        // Resolve settings for this specific provider if providerSettings is provided
        const providerRequest = this.resolveProviderSettings(request, providerName);
        
        const response = await provider.generateCompletion(providerRequest);
        const wasFallback = i > 0; // i > 0 means we used a fallback provider
        
        return {
          response,
          usedProvider: providerName,
          wasFallback,
          attemptedProviders,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // If this is not the last provider, continue to next fallback
        if (i < this.providers.length - 1) {
          continue;
        }
        
        // This was the last provider, throw the error
        throw this.wrapError(lastError, attemptedProviders);
      }
    }

    // Should never reach here, but TypeScript needs this
    throw this.wrapError(
      lastError || new Error('All providers failed'),
      attemptedProviders
    );
  }

  /**
   * Resolves provider-specific settings from request.
   * Priority: provider-specific > default > direct temperature/maxTokens
   */
  private resolveProviderSettings(
    request: LLMRequest,
    providerName: string
  ): LLMRequest {
    if (!request.providerSettings) {
      return request; // No provider settings, use direct temperature/maxTokens
    }

    const defaultSettings = request.providerSettings.default || {};
    const providerSpecificSettings = providerName === 'openai'
      ? request.providerSettings.openai
      : providerName === 'anthropic'
      ? request.providerSettings.anthropic
      : undefined;

    // Merge settings: provider-specific > default > direct
    const temperature = providerSpecificSettings?.temperature
      ?? defaultSettings.temperature
      ?? request.temperature;
    
    const maxTokens = providerSpecificSettings?.maxTokens
      ?? defaultSettings.maxTokens
      ?? request.maxTokens;

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

  private wrapError(error: Error, attemptedProviders: string[]): LLMProviderError {
    const providerNames = attemptedProviders.join(' -> ');
    const message = `All providers failed (attempted: ${providerNames}): ${error.message}`;
    return new LLMProviderError(
      providerNames,
      new Error(message),
      true // retryable
    );
  }
}

