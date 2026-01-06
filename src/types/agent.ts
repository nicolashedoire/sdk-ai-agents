import type { Policy } from './policy.js';
import type { Tool } from './tool.js';

export interface ProviderSettings {
  temperature?: number;
  maxTokens?: number;
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
    openai?: ProviderSettings;
    anthropic?: ProviderSettings;
    default?: ProviderSettings; // Settings par défaut pour tous les providers
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
