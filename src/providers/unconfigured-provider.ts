import { LLMProviderError } from '../errors/index.js';
import type { LLMProvider, LLMResponse } from './llm-provider.js';

/**
 * Stand-in used when the SDK is created without any way to reach a language model. Tools,
 * MCP servers and event logs work normally; the first call that needs a model fails with a
 * clear message instead of the SDK refusing to start.
 */
export class UnconfiguredLLMProvider implements LLMProvider {
  async generateCompletion(): Promise<LLMResponse> {
    throw new LLMProviderError(
      'none',
      new Error(
        'no language model is configured: pass `apiKey` (or `llmProvider`) to createSDK to use agents'
      ),
      false
    );
  }

  supportsModel(): boolean {
    return true;
  }

  getProviderName(): string {
    return 'none';
  }
}
