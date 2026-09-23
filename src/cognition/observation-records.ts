import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ObservationRecord } from './thought-patch.js';

/**
 * Builds observation records. Provenance is written by the engine from what it actually
 * received (the problem, a tool result, a test result), never by the model.
 */

const MAX_SUMMARY_LENGTH = 500;

/** Observation given with the problem, e.g. measurements the thinker already made. */
export const observationInputSchema = z.object({
  content: z.unknown().refine((value) => value !== undefined && value !== null, {
    message: 'an observation needs content',
  }),
  /** Short text shown to the model; derived from the content when omitted. */
  summary: z.string().trim().min(1).optional(),
  context: z.string().optional(),
  /**
   * Observations sharing an origin (the same experiment, the same source) are not counted
   * as independent confirmations. Defaults to "input".
   */
  originGroup: z.string().trim().min(1).optional(),
  observedAt: z.number().optional(),
});

export type ObservationInput = z.input<typeof observationInputSchema>;

export function observationFromInput(input: ObservationInput, now: number): ObservationRecord {
  const parsed = observationInputSchema.parse(input);
  return {
    sourceKind: 'input',
    observedAt: parsed.observedAt ?? now,
    ...(parsed.context ? { context: parsed.context } : {}),
    summary: parsed.summary ?? summarize(parsed.content),
    fingerprint: fingerprint(parsed.content),
    originGroup: parsed.originGroup ?? 'input',
  };
}

export function observationFromTool(input: {
  toolName: string;
  parameters: Record<string, unknown>;
  result: unknown;
  sourceEventId?: string;
  observedAt: number;
  context?: string;
}): ObservationRecord {
  const content = { tool: input.toolName, parameters: input.parameters, result: input.result };
  return {
    sourceKind: 'tool',
    source: input.toolName,
    ...(input.sourceEventId ? { sourceEventId: input.sourceEventId } : {}),
    observedAt: input.observedAt,
    ...(input.context ? { context: input.context } : {}),
    summary: summarize(input.result),
    fingerprint: fingerprint(content),
    originGroup: `tool:${input.toolName}`,
  };
}

export function observationFromTest(input: {
  evaluatorId: string;
  observed: unknown;
  summary?: string;
  sourceEventId: string;
  observedAt: number;
  context?: string;
}): ObservationRecord {
  return {
    sourceKind: 'evaluation',
    source: input.evaluatorId,
    sourceEventId: input.sourceEventId,
    observedAt: input.observedAt,
    ...(input.context ? { context: input.context } : {}),
    summary: input.summary ?? summarize(input.observed),
    fingerprint: fingerprint({ evaluator: input.evaluatorId, observed: input.observed }),
    originGroup: `evaluator:${input.evaluatorId}`,
  };
}

/** Stable hash of a JSON value: the same content always gets the same fingerprint. */
export function fingerprint(content: unknown): string {
  return createHash('sha256').update(stableStringify(content)).digest('hex').slice(0, 16);
}

function summarize(content: unknown): string {
  const text = typeof content === 'string' ? content : stableStringify(content);
  const trimmed = text.trim() || '(empty)';
  return trimmed.length > MAX_SUMMARY_LENGTH
    ? `${trimmed.slice(0, MAX_SUMMARY_LENGTH - 1)}…`
    : trimmed;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value)) ?? String(value);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortKeys(entry)])
    );
  }
  return value;
}
