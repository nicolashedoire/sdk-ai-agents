import type { PricingTable } from '../costs/pricing.js';
import type { JevClientConfig } from '../decisions/jev-client.js';
import type { TypedDecisionClient } from '../decisions/typed-decisions.js';
import type { IncidentMonitorOptions } from '../incidents/monitored-event-store.js';
import type { LLMProvider } from '../providers/llm-provider.js';
import type { RetryPolicy } from '../resilience/retry.js';
import type { IEventStore } from '../stores/event-store.js';
import type { Event } from './events.js';
import type { Policy } from './policy.js';

export interface SDKConfig {
  /** API key of the primary provider. Not needed when `llmProvider` is given. */
  apiKey?: string;
  /** Use your own LLM provider (local model, gateway, test double) instead of the built-in ones. */
  llmProvider?: LLMProvider;
  /** Enables TypeSafe Jev (or a compatible clone) for typed decisions. */
  jev?: JevClientConfig;
  /** Any typed-decision backend; takes precedence over `jev`. */
  decisionClient?: TypedDecisionClient;
  /** Model prices (USD per million tokens) merged over the defaults. */
  pricing?: PricingTable;
  /**
   * Retry policy for LLM calls, applied per built-in provider before any fallback. Defaults
   * to 2 retries with exponential backoff on transient errors, honoring `retry-after`;
   * `false` keeps the vendor clients' own retries. An injected `llmProvider` is only wrapped
   * when this option is set explicitly, and never when it is a `FallbackProvider`.
   */
  retry?: Partial<RetryPolicy> | false;
  /** Turns matching events into incidents delivered by email, webhook or your own notifier. */
  incidents?: IncidentMonitorOptions;
  provider?: 'openai' | 'anthropic';
  /** Per-provider settings; `baseURL` points a provider at a compatible endpoint or a proxy. */
  providerConfig?: {
    openai?: { apiKey?: string; defaultModel?: string; baseURL?: string };
    anthropic?: { apiKey?: string; defaultModel?: string; baseURL?: string };
  };
  fallbackProviders?: Array<{
    provider: 'openai' | 'anthropic';
    config?: {
      apiKey?: string;
      defaultModel?: string;
      baseURL?: string;
    };
  }>;
  eventStore?: IEventStore;
  defaultPolicies?: Policy[];
  goldenTracesDir?: string;
  regressionTestSuitesDir?: string;
  assertionsDir?: string;
  impactAnalysesDir?: string;
}

export interface TimelineEntry {
  timestamp: number;
  type: string;
  description: string;
}

export interface TraceSummary {
  totalEvents: number;
  duration: number;
  intentionsGenerated: number;
  actionsExecuted: number;
  policiesChecked: number;
  toolsCalled: number;
}

export interface Trace {
  runId: string;
  agentId: string;
  status: string;
  events: Event[];
  timeline: TimelineEntry[];
  summary: TraceSummary;
}
