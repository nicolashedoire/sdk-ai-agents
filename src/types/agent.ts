import type { OpenAIReasoningEffort } from '../providers/llm-provider.js';
import type { Policy } from './policy.js';
import type { Tool } from './tool.js';

export interface ProviderSettings {
  temperature?: number;
  maxTokens?: number;
}

/** OpenAI settings: those of every provider, and the reasoning effort of reasoning models. */
export interface OpenAIProviderSettings extends ProviderSettings {
  /**
   * Sent to reasoning models only (o-series, GPT-5 and later); overrides the provider's. On
   * GPT-5.4 and later, a request with tools needs `none`: OpenAI refuses tools with any other
   * effort on Chat Completions (see `OpenAIRequestOptions.reasoningEffort`).
   */
  reasoningEffort?: OpenAIReasoningEffort;
}

export interface AgentConfig {
  name: string;
  model: string;
  systemPrompt?: string;
  maxSteps?: number;
  timeout?: number;
  tools?: Tool[];
  policies?: Policy[];
  capabilities?: string[];
  version?: string;
  providerSettings?: {
    openai?: OpenAIProviderSettings;
    anthropic?: ProviderSettings;
    default?: ProviderSettings; // Default settings for every provider
  };
}

export interface Agent {
  id: string;
  name: string;
  model: string;
  tools: Tool[];
  policies: Policy[];
  config: AgentConfig;
  version: string;
  capabilities?: string[];
  createdAt: number;
  updatedAt: number;
  configHash?: string;
}
