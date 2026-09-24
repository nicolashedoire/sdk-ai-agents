import { ValidationError } from '../errors/index.js';
import type { RetryPolicy } from '../resilience/retry.js';
import { RetryingLLMProvider, type ProviderRetryInfo } from '../resilience/retrying-provider.js';
import type { SDKConfig } from '../types/sdk.js';
import { FallbackProvider } from './fallback-provider.js';
import type { LLMProvider } from './llm-provider.js';
import { ProviderFactory } from './provider-factory.js';
import { UnconfiguredLLMProvider } from './unconfigured-provider.js';

const DEFAULT_MODELS = { openai: 'gpt-4', anthropic: 'claude-3-5-sonnet-20241022' } as const;

export interface ProviderSetup {
  /** When set, each vendor provider retries with this policy and its own client retries are disabled. */
  retryPolicy?: RetryPolicy;
  onRetry?: (info: ProviderRetryInfo) => void | Promise<void>;
}

/**
 * Builds the SDK's LLM provider: the primary vendor, optional fallbacks, and a retry policy
 * applied to each vendor individually so a provider is retried before failing over.
 */
export function createLLMProvider(config: SDKConfig, setup: ProviderSetup = {}): LLMProvider {
  const canFailOver = (config.fallbackProviders?.length ?? 0) > 0;
  // With a fallback available, do not wait on a long retry-after: fail over instead.
  const retryPolicy =
    setup.retryPolicy && canFailOver && setup.retryPolicy.maxRetryAfterMs === undefined
      ? { ...setup.retryPolicy, maxRetryAfterMs: setup.retryPolicy.maxDelayMs }
      : setup.retryPolicy;

  const build = (
    provider: 'openai' | 'anthropic',
    apiKey: string | undefined,
    defaultModel?: string,
    baseURL?: string
  ) => {
    const vendor = ProviderFactory.createProvider({
      provider,
      apiKey: apiKey || '',
      defaultModel: defaultModel || DEFAULT_MODELS[provider],
      ...(retryPolicy ? { clientMaxRetries: 0 } : {}),
      ...(baseURL ? { baseURL } : {}),
    });
    return retryPolicy ? new RetryingLLMProvider(vendor, retryPolicy, setup.onRetry) : vendor;
  };

  const primaryName = config.provider ?? 'openai';
  const primaryConfig = config.providerConfig?.[primaryName];
  const primaryKey = primaryConfig?.apiKey || config.apiKey;
  if (!primaryKey && !canFailOver) {
    // No model at all: tool-only uses (MCP servers, governed tool calls) still work.
    return new UnconfiguredLLMProvider();
  }
  const primary = build(
    primaryName,
    primaryKey,
    primaryConfig?.defaultModel,
    primaryConfig?.baseURL
  );

  if (!config.fallbackProviders || config.fallbackProviders.length === 0) {
    return primary;
  }
  const fallbacks = config.fallbackProviders.map((fallback, index) => {
    // A fallback's own config first, then the settings of its vendor in providerConfig.
    const vendorConfig = config.providerConfig?.[fallback.provider];
    // The primary's key only goes to a fallback of the same vendor: an OpenAI key must never
    // be sent to Anthropic (or to the address configured for it), nor the other way round.
    const apiKey =
      fallback.config?.apiKey ||
      vendorConfig?.apiKey ||
      (fallback.provider === primaryName ? primaryKey : undefined);
    if (!apiKey) {
      throw new ValidationError(
        `fallbackProviders[${index}]`,
        `no API key for "${fallback.provider}": set fallbackProviders[${index}].config.apiKey or providerConfig.${fallback.provider}.apiKey`
      );
    }
    return build(
      fallback.provider,
      apiKey,
      fallback.config?.defaultModel || vendorConfig?.defaultModel,
      fallback.config?.baseURL || vendorConfig?.baseURL
    );
  });
  return new FallbackProvider(primary, fallbacks);
}
