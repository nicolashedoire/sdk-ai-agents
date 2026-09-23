import { z } from 'zod';
import type { Event } from '../types/events.js';
import { uniqueById } from '../utils/unique-events.js';
import { costOf, findModelPrice, type PricingTable } from './pricing.js';

export type UsageSource = 'llm' | 'decision';

export interface ModelCostLine {
  /** Model id returned by the provider. */
  model: string;
  /** Model name that was requested, when it differs (used to find the price too). */
  requestedModel?: string;
  source: UsageSource;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Undefined when the model has no configured price. */
  costUsd?: number;
}

export interface RunCostReport {
  runId: string;
  currency: 'USD';
  /** Sum of the priced lines. */
  totalUsd: number;
  /** False when some usage could not be priced (see `unpricedModels`). */
  complete: boolean;
  lines: ModelCostLine[];
  unpricedModels: string[];
}

const llmUsageSchema = z.object({
  model: z.string(),
  requestedModel: z.string().optional(),
  usage: z.object({
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    calls: z.number().int().positive().optional(),
  }),
});

const decisionUsageSchema = z.object({
  model: z.string(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
});

interface UsageRecord {
  model: string;
  requestedModel?: string;
  source: UsageSource;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

/** Reads the token usage recorded by LLM calls and typed decisions in a run. */
export function collectUsage(events: Event[]): UsageRecord[] {
  const records: UsageRecord[] = [];
  for (const event of uniqueById(events)) {
    if (event.type === 'intention.generated' || event.type === 'cognition.thought') {
      const parsed = llmUsageSchema.safeParse(event.data);
      if (parsed.success) {
        records.push({
          model: parsed.data.model,
          ...(parsed.data.requestedModel && parsed.data.requestedModel !== parsed.data.model
            ? { requestedModel: parsed.data.requestedModel }
            : {}),
          source: 'llm',
          calls: parsed.data.usage.calls ?? 1,
          inputTokens: parsed.data.usage.promptTokens ?? 0,
          outputTokens: parsed.data.usage.completionTokens ?? 0,
        });
      }
    }
    if (event.type === 'decision.evaluated') {
      const parsed = decisionUsageSchema.safeParse(event.data);
      if (parsed.success) {
        records.push({
          model: parsed.data.model,
          source: 'decision',
          calls: 1,
          inputTokens: parsed.data.usage.inputTokens,
          outputTokens: parsed.data.usage.outputTokens,
        });
      }
    }
  }
  return records;
}

/** Aggregates the usage of a run per model and prices it. */
export function computeRunCost(
  runId: string,
  events: Event[],
  pricing: PricingTable
): RunCostReport {
  const lines = new Map<string, ModelCostLine>();
  for (const record of collectUsage(events)) {
    const key = `${record.source}:${record.model}`;
    const line = lines.get(key) ?? {
      model: record.model,
      ...(record.requestedModel ? { requestedModel: record.requestedModel } : {}),
      source: record.source,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    line.calls += record.calls;
    // Any record of the line can tell which name was requested (a failed first call too).
    if (!line.requestedModel && record.requestedModel) {
      line.requestedModel = record.requestedModel;
    }
    line.inputTokens += record.inputTokens;
    line.outputTokens += record.outputTokens;
    lines.set(key, line);
  }

  const unpricedModels: string[] = [];
  let totalUsd = 0;
  for (const line of lines.values()) {
    const price = findModelPrice(pricing, line.model, line.requestedModel);
    if (!price) {
      unpricedModels.push(line.model);
      continue;
    }
    line.costUsd = roundUsd(costOf(price, line.inputTokens, line.outputTokens));
    totalUsd += line.costUsd;
  }

  return {
    runId,
    currency: 'USD',
    totalUsd: roundUsd(totalUsd),
    complete: unpricedModels.length === 0,
    lines: [...lines.values()],
    unpricedModels,
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}
