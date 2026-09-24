import type { LLMProvider, LLMRequest, LLMResponse } from '../providers/llm-provider.js';
import { StreamedTextRelay } from '../providers/streamed-text.js';
import { withRetry, type RetryAttemptInfo, type RetryPolicy } from './retry.js';

export interface ProviderRetryInfo extends RetryAttemptInfo {
  provider: string;
  model: string;
  runId?: string;
}

/**
 * Decorates any LLM provider with a retry policy. `onRetry` receives the run id carried by
 * the request, which lets the SDK record each retry in the run's event log. When the request
 * streams its text, an attempt that had streamed some before failing is followed by
 * `onTextRestart`: the retry writes the answer again.
 */
export class RetryingLLMProvider implements LLMProvider {
  constructor(
    private readonly inner: LLMProvider,
    private readonly policy: RetryPolicy,
    private readonly onRetry?: (info: ProviderRetryInfo) => void | Promise<void>
  ) {}

  generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    const text = new StreamedTextRelay(request);
    return withRetry(() => this.inner.generateCompletion(text.begin()), this.policy, {
      ...(request.abortSignal ? { signal: request.abortSignal } : {}),
      onRetry: (info) => {
        text.restart();
        return this.onRetry?.({
          ...info,
          provider: this.inner.getProviderName(),
          model: request.model,
          ...(request.runId ? { runId: request.runId } : {}),
        });
      },
    });
  }

  supportsModel(model: string): boolean {
    return this.inner.supportsModel(model);
  }

  getProviderName(): string {
    return this.inner.getProviderName();
  }

  get nativeToolMessages(): boolean {
    return this.inner.nativeToolMessages === true;
  }

  /** The decorated provider (useful to reach provider-specific features). */
  unwrap(): LLMProvider {
    return this.inner;
  }
}
