import type { z } from 'zod';
import { LLMProviderError } from '../errors/index.js';
import type { LLMProvider } from '../providers/llm-provider.js';
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
  input: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
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
    abortSignal?: AbortSignal
  ): Promise<Intention> {
    if (abortSignal?.aborted) {
      throw new Error('Run cancelled');
    }

    try {
      const messages = this.buildMessages(context);
      const tools = this.buildToolsSchema(context.availableTools);
      const model = context.model || this.model;
      
      // Check if provider is a FallbackProvider
      let response;
      let fallbackInfo: { usedProvider: string; wasFallback: boolean; attemptedProviders: string[] } | null = null;
      
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
          model,
          messages,
          tools,
          temperature,
          maxTokens,
          providerSettings,
          abortSignal,
        });
        response = result.response;
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
        temperature = resolvedSettings.temperature ?? context.temperature ?? DEFAULT_LLM_TEMPERATURE;
        maxTokens = resolvedSettings.maxTokens ?? context.maxTokens;
        
        response = await this.provider.generateCompletion({
          model,
          messages,
          tools,
          temperature,
          maxTokens,
          abortSignal,
        });
      }

      await this.logIntentionGenerated(context, eventStore, response);

      return this.parseIntention(response);
    } catch (error) {
      if (abortSignal?.aborted) {
        throw new Error('Run cancelled');
      }
      if (error instanceof LLMProviderError) {
        throw error;
      }
      throw new LLMProviderError(this.provider.getProviderName(), error instanceof Error ? error : new Error(String(error)), true);
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
    const providerSpecificSettings = providerName === 'openai'
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
    response: { content: string | null; toolCalls?: Array<{ function: { name: string; arguments: string } }> }
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
      },
      metadata: {
        agentId: context.agentId,
        provider: this.provider.getProviderName(),
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

  private buildMessages(context: ReasoningContext): Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }> {
    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [];

    if (context.systemPrompt) {
      messages.push({
        role: 'system',
        content: context.systemPrompt,
      });
    }

    for (const entry of context.conversationHistory) {
      messages.push({
        role: entry.role,
        content: entry.content,
      });
    }

    messages.push({
      role: 'user',
      content: context.input,
    });

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
        parameters: this.zodSchemaToJsonSchema(tool.schema),
      },
    }));
  }

  private zodSchemaToJsonSchema(schema: unknown): Record<string, unknown> {
    return zodSchemaToJsonSchema(schema as z.ZodSchema);
  }
}
