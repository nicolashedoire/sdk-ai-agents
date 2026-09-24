import { z } from 'zod';
import type { Event } from '../types/events.js';
import { uniqueById } from '../utils/unique-events.js';
import { costOf, findModelPrice, type PricingTable } from './pricing.js';

export type UsageSource = 'llm' | 'decision';

/**
 * Name given to the model of a call that recorded none. Parentheses keep it apart from real
 * model ids, which never contain them; such a call is never priced.
 */
export const UNKNOWN_MODEL = '(unknown)';

export interface ModelCostLine {
  /** Model id returned by the provider (`(unknown)` when the call recorded no model name). */
  model: string;
  /** Model name that was requested, when it differs (used to find the price too). */
  requestedModel?: string;
  source: UsageSource;
  calls: number;
  /**
   * Calls among `calls` that reported no input/output token counts: their tokens are not in
   * `inputTokens`/`outputTokens` and their cost is unknown. Present when there are any.
   */
  unmeteredCalls?: number;
  inputTokens: number;
  outputTokens: number;
  /**
   * Cost of the calls that reported their tokens. Undefined when the model has no configured
   * price, or when none of the line's calls reported token counts (nothing is known of it).
   */
  costUsd?: number;
}

export interface RunCostReport {
  runId: string;
  currency: 'USD';
  /**
   * Cost of the calls whose cost is known. When `complete` is false, the calls counted in
   * `unpricedCalls` and `unmeteredCalls` are missing from it: it is only a lower bound.
   */
  totalUsd: number;
  /** False when the cost of some calls is unknown (`unpricedCalls` or `unmeteredCalls`). */
  complete: boolean;
  lines: ModelCostLine[];
  /** Models without a configured price. */
  unpricedModels: string[];
  /** Calls of those models that reported their tokens: counted, but their cost is unknown. */
  unpricedCalls: number;
  /** Calls that reported no input/output token counts: their cost is unknown. */
  unmeteredCalls: number;
  /** Models of those calls. */
  unmeteredModels: string[];
}

const llmUsageSchema = z
  .object({
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    calls: z.number().int().positive().optional(),
    unmeteredCalls: z.number().int().nonnegative().optional(),
  })
  .optional();

const decisionUsageSchema = z
  .object({ inputTokens: z.number().optional(), outputTokens: z.number().optional() })
  .optional();

const modelCallSchema = z.object({
  model: z.string().optional(),
  requestedModel: z.string().optional(),
});

/** The model calls one event records, as run costs (and budgets per period) count them. */
export interface UsageRecord {
  model: string;
  requestedModel?: string;
  source: UsageSource;
  calls: number;
  /** Calls among `calls` without input/output token counts (their tokens are unknown). */
  unmeteredCalls: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Reads the model calls recorded in a run, with their token usage: LLM calls (native
 * reasoning and tool selection, answers discarded after the vendor billed them, cognitive
 * thoughts and operations interrupted after billed attempts) and typed decisions, rejected
 * answers included. A call recorded without input/output token counts is counted as
 * unmetered: its cost is unknown, never taken as zero.
 */
export function collectUsage(events: Event[]): UsageRecord[] {
  const records: UsageRecord[] = [];
  for (const event of uniqueById(events)) {
    const record = modelCallsOf(event);
    if (record) records.push(record);
  }
  return records;
}

/**
 * The model calls an event records, if it records any (see `collectUsage`). Budgets per
 * period count a cognitive run's calls with it, so that they count what `getRunCost` prices.
 */
export function modelCallsOf(event: Pick<Event, 'type' | 'data'>): UsageRecord | undefined {
  const { data } = event;
  switch (event.type) {
    case 'intention.generated':
      // The final answer of a cognitive run is recorded as an intention, not a model call.
      return data.source === 'cognition' ? undefined : llmRecord(data);
    case 'provider.answer_discarded':
      return llmRecord(data);
    case 'cognition.thought':
    case 'cognition.operation_failed':
      // A thought made by the engine alone (a tool result, a test) called no model.
      return data.model !== undefined || data.usage !== undefined ? llmRecord(data) : undefined;
    case 'decision.evaluated':
      return decisionRecord(data);
    default:
      return undefined;
  }
}

function llmRecord(data: Record<string, unknown>): UsageRecord {
  // A malformed name or usage does not hide the call: its model or its cost is then unknown.
  const names = modelCallSchema.safeParse(data);
  const parsed = llmUsageSchema.safeParse(data.usage);
  const usage = parsed.success ? parsed.data : undefined;
  const calls = usage?.calls ?? 1;
  const metered = usage?.promptTokens !== undefined || usage?.completionTokens !== undefined;
  return {
    ...modelOf(names.success ? names.data : {}),
    source: 'llm',
    calls,
    unmeteredCalls: metered ? Math.min(calls, usage?.unmeteredCalls ?? 0) : calls,
    inputTokens: usage?.promptTokens ?? 0,
    outputTokens: usage?.completionTokens ?? 0,
  };
}

function decisionRecord(data: Record<string, unknown>): UsageRecord {
  const names = modelCallSchema.safeParse(data);
  const parsed = decisionUsageSchema.safeParse(data.usage);
  const usage = parsed.success ? parsed.data : undefined;
  const metered = usage?.inputTokens !== undefined || usage?.outputTokens !== undefined;
  return {
    ...modelOf({ model: names.success ? names.data.model : undefined }),
    source: 'decision',
    calls: 1,
    unmeteredCalls: metered ? 0 : 1,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  };
}

/** The model that answered, else the one requested, else `(unknown)`. */
function modelOf(names: { model?: string; requestedModel?: string }): {
  model: string;
  requestedModel?: string;
} {
  const model = names.model || names.requestedModel || UNKNOWN_MODEL;
  return names.requestedModel && names.requestedModel !== model
    ? { model, requestedModel: names.requestedModel }
    : { model };
}

/**
 * Aggregates the usage of a run per model and prices it. The cost of a call is unknown when
 * its model has no price (`unpricedCalls`) or it reported no token counts (`unmeteredCalls`):
 * the report is then not `complete`, and `totalUsd` only covers the calls whose cost is known.
 */
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
    if (record.unmeteredCalls > 0) {
      line.unmeteredCalls = (line.unmeteredCalls ?? 0) + record.unmeteredCalls;
    }
    // Any record of the line can tell which name was requested (a failed first call too).
    if (!line.requestedModel && record.requestedModel) {
      line.requestedModel = record.requestedModel;
    }
    line.inputTokens += record.inputTokens;
    line.outputTokens += record.outputTokens;
    lines.set(key, line);
  }

  const unpricedModels: string[] = [];
  const unmeteredModels = new Set<string>();
  let unpricedCalls = 0;
  let unmeteredCalls = 0;
  let totalUsd = 0;
  for (const line of lines.values()) {
    const unmetered = line.unmeteredCalls ?? 0;
    if (unmetered > 0) {
      unmeteredCalls += unmetered;
      unmeteredModels.add(line.model);
    }
    // A model named by no call cannot have a price, even under a catch-all `*` key.
    const price =
      line.model === UNKNOWN_MODEL
        ? undefined
        : findModelPrice(pricing, line.model, line.requestedModel);
    if (!price) {
      unpricedModels.push(line.model);
      // As budgets count them: a call without token counts is unmetered, whatever its model.
      unpricedCalls += line.calls - unmetered;
      continue;
    }
    // A line whose calls all lack token counts has no known cost, not a cost of $0.
    if (unmetered === line.calls) continue;
    line.costUsd = roundUsd(costOf(price, line.inputTokens, line.outputTokens));
    totalUsd += line.costUsd;
  }

  return {
    runId,
    currency: 'USD',
    totalUsd: roundUsd(totalUsd),
    complete: unpricedCalls + unmeteredCalls === 0,
    lines: [...lines.values()],
    unpricedModels,
    unpricedCalls,
    unmeteredCalls,
    unmeteredModels: [...unmeteredModels],
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}
