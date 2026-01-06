import type { IEventStore } from '../stores/event-store.js';
import type { Event } from './events.js';
import type { Policy } from './policy.js';

export interface SDKConfig {
  apiKey: string;
  provider?: 'openai' | 'anthropic';
  providerConfig?: {
    openai?: { apiKey?: string; defaultModel?: string };
    anthropic?: { apiKey?: string; defaultModel?: string };
  };
  fallbackProviders?: Array<{
    provider: 'openai' | 'anthropic';
    config?: {
      apiKey?: string;
      defaultModel?: string;
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
