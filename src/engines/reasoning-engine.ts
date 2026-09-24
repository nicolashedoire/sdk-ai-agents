import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { LLMProviderError } from '../errors/index.js';
import type { LLMMessage, LLMProvider, LLMResponse } from '../providers/llm-provider.js';
import { FallbackProvider } from '../providers/fallback-provider.js';
import type { ProviderSettings } from '../types/agent.js';
import type { IEventStore } from '../stores/event-store.js';
import type { Intention } from '../types/run.js';
import type { Tool } from '../types/tool.js';
import { DEFAULT_LLM_TEMPERATURE } from '../utils/constants.js';
import { generateEventId } from '../utils/id.js';
import { zodSchemaToJsonSchema } from '../utils/zod-to-json-schema.js';

export interface ReasoningContext {
  runId: string;
  agentId: string;
  /** The user's message for this step; empty when the step continues after tool results. */
  input: string;
  /** Earlier turns, tool calls and their results included (see LLMMessage). */
  conversationHistory: LLMMessage[];
  availableTools: Tool[];
  systemPrompt?: string;
  model?: string;
  temperature?: number; // Deprecated: use providerSettings instead
  maxTokens?: number; // Deprecated: use providerSettings instead
  providerSettings?: {
    openai?: ProviderSettings;
    anthropic?: ProviderSettings;
    default?: ProviderSettings;
  };
  abortSignal?: AbortSignal;
}

/** One model call of a run: what the model intends, and what the call cost. */
export interface ReasoningStep {
  intention: Intention;
  /** Tokens the call used, when the provider reports them. */
  usage?: LLMResponse['usage'];
  /**
   * For a tool call: the model's turn to add to the conversation before the tool's result,
   * with the call's id (the result refers to it).
   */
  assistantTurn?: Extract<LLMMessage, { role: 'assistant' }>;
}

export class ReasoningEngine {
  private provider: LLMProvider;
  private model: string;

  constructor(provider: LLMProvider, model = 'gpt-4') {
    this.provider = provider;
    this.model = model;
  }

  /**
   * Gets the provider name from the underlying LLMProvider.
   * Handles both regular providers and FallbackProvider.
   */
  getProviderName(): string {
    return this.provider.getProviderName();
  }

  /**
   * Gets the primary provider name (useful for FallbackProvider).
   * Returns the primary provider name without fallback info.
   */
  getPrimaryProviderName(): string {
    if (this.provider instanceof FallbackProvider) {
      return this.provider.getPrimaryProviderName();
    }
    return this.provider.getProviderName();
  }

  async generateIntention(
    context: ReasoningContext,
    eventStore: IEventStore,
    signal?: AbortSignal
  ): Promise<Intention> {
    return (await this.generateStep(context, eventStore, signal)).intention;
  }

  /** Calls the model once and returns its intention with the tokens the call used. */
  async generateStep(
    context: ReasoningContext,
    eventStore: IEventStore,
    signal?: AbortSignal
  ): Promise<ReasoningStep> {
    // Either way of passing the signal cancels the call.
    const abortSignal = signal ?? context.abortSignal;
    if (abortSignal?.aborted) {
      throw new Error('Run cancelled');
    }

    try {
      const messages = this.buildMessages(context);
      const tools = this.buildToolsSchema(context.availableTools);
      const model = context.model || this.model;

      // Check if provider is a FallbackProvider
      let response: LLMResponse;
      // What was actually asked, and of whom: a fallback may use its own default model.
      let requestedModel: string | undefined = model;
      let answeredBy = this.provider.getProviderName();
      let fallbackInfo: {
        usedProvider: string;
        wasFallback: boolean;
        attemptedProviders: string[];
      } | null = null;

      // Resolve temperature and maxTokens for regular providers
      // For FallbackProvider, pass providerSettings and let it resolve per provider
      let temperature: number | undefined;
      let maxTokens: number | undefined;
      let providerSettings: ReasoningContext['providerSettings'] | undefined;

      if (this.provider instanceof FallbackProvider) {
        // For FallbackProvider, pass providerSettings so it can resolve per provider
        providerSettings = context.providerSettings;
        // Also pass direct temperature/maxTokens as fallback
        temperature = context.temperature;
        maxTokens = context.maxTokens;

        const result = await this.provider.generateCompletionWithFallback({
          runId: context.runId,
          model,
          messages,
          tools,
          temperature,
          maxTokens,
          providerSettings,
          abortSignal,
        });
        response = result.response;
        requestedModel = result.requestedModel;
        answeredBy = result.usedProvider;
        fallbackInfo = {
          usedProvider: result.usedProvider,
          wasFallback: result.wasFallback,
          attemptedProviders: result.attemptedProviders,
        };

        // Log fallback event if fallback was used
        if (result.wasFallback) {
          await this.logFallbackEvent(context, eventStore, fallbackInfo);
        }
      } else {
        // For regular provider, resolve settings now
        const providerName = this.provider.getProviderName();
        const resolvedSettings = this.resolveProviderSettings(
          providerName,
          context.providerSettings
        );
        temperature =
          resolvedSettings.temperature ?? context.temperature ?? DEFAULT_LLM_TEMPERATURE;
        maxTokens = resolvedSettings.maxTokens ?? context.maxTokens;

        response = await this.provider.generateCompletion({
          runId: context.runId,
          model,
          messages,
          tools,
          temperature,
          maxTokens,
          abortSignal,
        });
      }

      await this.logIntentionGenerated(
        context,
        eventStore,
        { ...response, requestedModel },
        answeredBy
      );

      const intention = this.parseIntention(response);
      const call = response.toolCalls?.[0];
      const assistantTurn =
        intention.type === 'tool_call' && call
          ? {
              role: 'assistant' as const,
              content: response.content ?? '',
              // Only the call the SDK runs: each call of a turn needs its result.
              toolCalls: [{ ...call, id: call.id ?? `call_${randomUUID().replaceAll('-', '')}` }],
              ...(response.vendorContent ? { vendorContent: response.vendorContent } : {}),
            }
          : undefined;
      return { intention, usage: response.usage, ...(assistantTurn ? { assistantTurn } : {}) };
    } catch (error) {
      if (abortSignal?.aborted) {
        throw new Error('Run cancelled');
      }
      if (error instanceof LLMProviderError) {
        throw error;
      }
      throw new LLMProviderError(
        this.provider.getProviderName(),
        error instanceof Error ? error : new Error(String(error)),
        true
      );
    }
  }

  /**
   * Resolves provider settings for a specific provider name.
   * Priority: provider-specific > default
   */
  private resolveProviderSettings(
    providerName: string,
    providerSettings?: ReasoningContext['providerSettings']
  ): { temperature?: number; maxTokens?: number } {
    if (!providerSettings) {
      return {};
    }

    const defaultSettings = providerSettings.default || {};
    const providerSpecificSettings =
      providerName === 'openai'
        ? providerSettings.openai
        : providerName === 'anthropic'
          ? providerSettings.anthropic
          : undefined;

    return {
      temperature: providerSpecificSettings?.temperature ?? defaultSettings.temperature,
      maxTokens: providerSpecificSettings?.maxTokens ?? defaultSettings.maxTokens,
    };
  }

  private async logFallbackEvent(
    context: ReasoningContext,
    eventStore: IEventStore,
    fallbackInfo: { usedProvider: string; wasFallback: boolean; attemptedProviders: string[] }
  ): Promise<void> {
    await eventStore.append(context.runId, {
      id: generateEventId(),
      runId: context.runId,
      type: 'provider.fallback',
      timestamp: Date.now(),
      data: {
        primaryProvider: fallbackInfo.attemptedProviders[0],
        usedProvider: fallbackInfo.usedProvider,
        attemptedProviders: fallbackInfo.attemptedProviders,
      },
      metadata: {
        agentId: context.agentId,
      },
    });
  }

  private async logIntentionGenerated(
    context: ReasoningContext,
    eventStore: IEventStore,
    response: {
      content: string | null;
      toolCalls?: Array<{ function: { name: string; arguments: string } }>;
      model?: string;
      requestedModel?: string;
      usage?: LLMResponse['usage'];
    },
    provider: string
  ): Promise<void> {
    await eventStore.append(context.runId, {
      id: generateEventId(),
      runId: context.runId,
      type: 'intention.generated',
      timestamp: Date.now(),
      data: {
        message: response.content,
        toolCalls: response.toolCalls?.map((tc) => ({
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
        ...(response.model ? { model: response.model } : {}),
        ...(response.requestedModel ? { requestedModel: response.requestedModel } : {}),
        ...(response.usage ? { usage: response.usage } : {}),
      },
      metadata: {
        agentId: context.agentId,
        provider,
      },
    });
  }

  private parseIntention(response: {
    content: string | null;
    toolCalls?: Array<{ function: { name: string; arguments: string } }>;
  }): Intention {
    if (response.toolCalls && response.toolCalls.length > 0) {
      return this.parseToolCallIntention(response);
    }

    if (response.content) {
      return {
        type: 'final_answer',
        reasoning: response.content,
      };
    }

    return {
      type: 'continue',
    };
  }

  private parseToolCallIntention(response: {
    content: string | null;
    toolCalls?: Array<{ function: { name: string; arguments: string } }>;
  }): Intention {
    const toolCall = response.toolCalls?.[0];
    if (!toolCall) {
      throw new Error('Tool call is missing');
    }

    return {
      type: 'tool_call',
      toolName: toolCall.function.name,
      parameters: JSON.parse(toolCall.function.arguments || '{}'),
      reasoning: response.content || undefined,
    };
  }

  private buildMessages(context: ReasoningContext): LLMMessage[] {
    const messages: LLMMessage[] = [];
    if (context.systemPrompt) {
      messages.push({ role: 'system', content: context.systemPrompt });
    }
    messages.push(
      ...(this.provider.nativeToolMessages === true
        ? context.conversationHistory
        : asPlainText(context.conversationHistory))
    );
    if (context.input) {
      messages.push({ role: 'user', content: context.input });
    }
    return messages;
  }

  private buildToolsSchema(tools: Tool[]): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputJsonSchema ?? this.zodSchemaToJsonSchema(tool.schema),
      },
    }));
  }

  private zodSchemaToJsonSchema(schema: unknown): Record<string, unknown> {
    return zodSchemaToJsonSchema(schema as z.ZodSchema);
  }
}

/**
 * The conversation as providers without native tool messages have always received it: a tool
 * call and its result become an assistant line saying the tool ran and a user line with the
 * result. Assistant turns that only call a tool are described by those lines.
 */
function asPlainText(history: LLMMessage[]): LLMMessage[] {
  return history.flatMap((message): LLMMessage[] => {
    if (message.role === 'tool') {
      return [
        {
          role: 'assistant',
          content: `Tool ${message.toolName} executed with result: ${message.content}`,
        },
        { role: 'user', content: `Previous tool result: ${message.content}. Continue.` },
      ];
    }
    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      return [];
    }
    return [message];
  });
}
