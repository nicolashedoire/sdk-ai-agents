import { ValidationError } from '../errors/index.js';
import type { RetryPolicy } from '../resilience/retry.js';
import { RetryingLLMProvider, type ProviderRetryInfo } from '../resilience/retrying-provider.js';
import type { SDKConfig } from '../types/sdk.js';
import { DEFAULT_ANTHROPIC_MODEL } from './anthropic-provider.js';
import { FallbackProvider } from './fallback-provider.js';
import type { LLMProvider } from './llm-provider.js';
import { ProviderFactory } from './provider-factory.js';
import { UnconfiguredLLMProvider } from './unconfigured-provider.js';

const DEFAULT_MODELS = { openai: 'gpt-4', anthropic: DEFAULT_ANTHROPIC_MODEL } as const;

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
    const sameVendor = fallback.provider === primaryName;
    // A fallback's own config first. A fallback of another vendor then takes its vendor's
    // entry in providerConfig; one of the primary's vendor does not, since that entry is the
    // primary's (its address is often the one that is failing, and its key is meant for it).
    const vendorConfig = sameVendor ? undefined : config.providerConfig?.[fallback.provider];
    // The SDK-wide key is the primary vendor's: it never goes to another vendor.
    const apiKey =
      fallback.config?.apiKey || vendorConfig?.apiKey || (sameVendor ? config.apiKey : undefined);
    if (!apiKey) {
      const elsewhere = sameVendor ? 'apiKey' : `providerConfig.${fallback.provider}.apiKey`;
      throw new ValidationError(
        `fallbackProviders[${index}]`,
        `no API key for "${fallback.provider}": set fallbackProviders[${index}].config.apiKey or ${elsewhere}`
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
