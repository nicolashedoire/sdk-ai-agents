import type { LLMProvider } from './llm-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { OpenAIProvider } from './openai-provider.js';

export interface ProviderConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  defaultModel?: string;
  /** Retries performed by the vendor client itself (vendor default when omitted). */
  clientMaxRetries?: number;
}

export class ProviderFactory {
  static createProvider(config: ProviderConfig): LLMProvider {
    switch (config.provider) {
      case 'openai':
        return new OpenAIProvider(config.apiKey, config.defaultModel, clientOptions(config));
      case 'anthropic':
        return new AnthropicProvider(config.apiKey, config.defaultModel, clientOptions(config));
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  static createProviderFromModel(
    model: string,
    apiKey: string,
    defaultModel?: string
  ): LLMProvider {
    if (model.startsWith('claude-')) {
      return new AnthropicProvider(apiKey, defaultModel);
    }
    if (model.startsWith('gpt-') || model.startsWith('o1-')) {
      return new OpenAIProvider(apiKey, defaultModel);
    }
    throw new Error(
      `Cannot determine provider for model: ${model}. ` +
        `Supported models: Claude (claude-*), OpenAI (gpt-*, o1-*). ` +
        `Please specify the provider explicitly or use a recognized model name.`
    );
  }
}

function clientOptions(config: ProviderConfig): { maxRetries?: number } {
  return config.clientMaxRetries !== undefined ? { maxRetries: config.clientMaxRetries } : {};
}
