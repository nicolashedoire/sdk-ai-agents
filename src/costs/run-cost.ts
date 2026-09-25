import type { Event } from '../types/events.js';
import { uniqueById } from '../utils/unique-events.js';
import { tokenCount, tokensOfCall } from '../utils/usage-tokens.js';
import { type PricingTable, costOf, findModelPrice } from './pricing.js';

export type UsageSource = 'llm' | 'decision';

/**
 * Name given to the model of a call that recorded none. Parentheses keep it apart from real
 * model ids, which never contain them; such a call is never priced.
 */
export const UNKNOWN_MODEL = '(unknown)';

export interface ModelCostLine {
  /** Model id returned by the provider (`(unknown)` when the call recorded no model name). */
  model: string;
  /**
   * Model name that was requested, when it differs (used to find the price too). Every call of
   * the line asked for it: calls of the same model asked under another name, or under none,
   * have a line of their own, priced on their own names.
   */
  requestedModel?: string;
  source: UsageSource;
  calls: number;
  /**
   * Calls among `calls` that did not report both their input and output token counts: their
   * tokens are not in `inputTokens`/`outputTokens` and their cost is unknown. Present when
   * there are any.
   */
  unmeteredCalls?: number;
  inputTokens: number;
  outputTokens: number;
  /**
   * Tokens of the unmetered calls: for each, the largest of the total and the input or output
   * tokens it reported. Counted, but their cost is unknown. Present when there are any.
   */
  unmeteredTokens?: number;
  /**
   * Cost of the metered calls. Undefined when the model has no configured price, or when none
   * of the line's calls is metered (nothing is known of it).
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
  /** Metered calls of those models: their tokens are counted, but their cost is unknown. */
  unpricedCalls: number;
  /** Calls that did not report both input and output token counts: their cost is unknown. */
  unmeteredCalls: number;
  /** Models of those calls. */
  unmeteredModels: string[];
}

/** A count of calls a usage recorded: a whole number above 0 (`min` 0 for `unmeteredCalls`). */
function callCount(value: unknown, min: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min ? value : undefined;
}

/** The names a model call recorded; a name that is not a string is no name. */
function namesOf(data: Record<string, unknown>): { model?: string; requestedModel?: string } {
  const { model, requestedModel } = data;
  return {
    ...(typeof model === 'string' ? { model } : {}),
    ...(typeof requestedModel === 'string' ? { requestedModel } : {}),
  };
}

/** The model calls one event records, as run costs (and budgets per period) count them. */
export interface UsageRecord {
  model: string;
  requestedModel?: string;
  source: UsageSource;
  calls: number;
  /** Calls among `calls` without both input and output token counts (cost unknown). */
  unmeteredCalls: number;
  inputTokens: number;
  outputTokens: number;
  /** Tokens of the unmetered calls (see `tokensOfCall`). */
  unmeteredTokens: number;
}

/**
 * Reads the model calls recorded in a run, with their token usage: LLM calls (native
 * reasoning and tool selection, answers discarded after the vendor billed them, cognitive
 * thoughts and operations interrupted after billed attempts, a study's calls) and typed decisions, rejected
 * answers included. A call recorded without both input and output token counts is counted
 * as unmetered: its cost is unknown, never taken as zero (see `tokensOfCall`).
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
    case 'study.model_called':
      // A study's call and its repair, as a thought and its repairs are.
      return llmRecord(data);
    case 'decision.evaluated':
      return decisionRecord(data);
    default:
      return undefined;
  }
}

/** Tokens of the calls a record holds, as `getRunCost` counts them (see `tokensOfUsage`). */
export function tokensOfRecord(record: UsageRecord): number {
  return record.inputTokens + record.outputTokens + record.unmeteredTokens;
}

function llmRecord(data: Record<string, unknown>): UsageRecord {
  // Each field is read on its own: a malformed one (a null total, a negative count) is left
  // out, as budgets leave it out, and never hides the others or the call itself.
  const usage =
    data.usage && typeof data.usage === 'object' ? (data.usage as Record<string, unknown>) : {};
  const calls = callCount(usage.calls, 1) ?? 1;
  const tokens = tokensOfCall(usage);
  return {
    ...modelOf(namesOf(data)),
    source: 'llm',
    calls,
    unmeteredCalls: tokens.metered
      ? Math.min(calls, callCount(usage.unmeteredCalls, 0) ?? 0)
      : calls,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    // A thought's usage adds the tokens of its calls whose cost is unknown.
    unmeteredTokens: tokens.unmeteredTokens + (tokenCount(usage.unmeteredTokens) ?? 0),
  };
}

function decisionRecord(data: Record<string, unknown>): UsageRecord {
  const tokens = tokensOfCall(data.usage);
  return {
    ...modelOf({ model: namesOf(data).model }),
    source: 'decision',
    calls: 1,
    unmeteredCalls: tokens.metered ? 0 : 1,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    unmeteredTokens: tokens.unmeteredTokens,
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
 * its model has no price (`unpricedCalls`) or it is unmetered (`unmeteredCalls`, see `tokensOfCall`):
 * the report is then not `complete`, and `totalUsd` only covers the calls whose cost is known.
 */
export function computeRunCost(
  runId: string,
  events: Event[],
  pricing: PricingTable
): RunCostReport {
  const lines = new Map<string, ModelCostLine>();
  for (const record of collectUsage(events)) {
    // A line per model asked for, too: each call is priced on its own names, as budgets do.
    const key = JSON.stringify([record.source, record.model, record.requestedModel ?? null]);
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
    if (record.unmeteredTokens > 0) {
      line.unmeteredTokens = (line.unmeteredTokens ?? 0) + record.unmeteredTokens;
    }
    line.inputTokens += record.inputTokens;
    line.outputTokens += record.outputTokens;
    lines.set(key, line);
  }

  const unpricedModels = new Set<string>();
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
      unpricedModels.add(line.model);
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
    unpricedModels: [...unpricedModels],
    unpricedCalls,
    unmeteredCalls,
    unmeteredModels: [...unmeteredModels],
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}
