import { ThoughtGenerationError, type ModelUsage } from '../errors/index.js';
import type { DiscardedAnswer } from '../providers/llm-provider.js';
import type { GeneratedOperation } from './thought-fields.js';
import type { EvaluationRecord, ObservationRecord, ThoughtPatch } from './thought-patch.js';

/** A thought proposed by a generator or an assessor, under the contract of one operation. */
export interface ProposedThought {
  contract: GeneratedOperation;
  patch: ThoughtPatch;
}

/** What only the engine may write into a thought. */
export interface EngineRecord {
  /** Summary of a thought the engine wrote alone (no proposal). */
  summary?: string;
  observations?: ObservationRecord[];
  evaluations?: EvaluationRecord[];
  /** Unknown investigated by the operation, counted even when it failed. */
  investigatedUnknownId?: string;
  failures?: string[];
  /** Unknowns the engine established cannot be investigated (no tool can answer them). */
  dropUnknowns?: Array<{ unknownId: string; reason: string }>;
}

/** Result of performing one cognitive operation, before it is applied to the state. */
export interface OperationOutcome {
  proposal?: ProposedThought;
  engine?: EngineRecord;
  failure?: Error;
  /** True when a tool was actually executed (counts against the tool-call budget). */
  toolCalled?: boolean;
  /** Fields the generator dropped from the model reply. */
  ignoredFields?: string[];
  model?: string;
  requestedModel?: string;
  usage?: ModelUsage;
  /** Answers a provider discarded after the vendor billed them, recorded on their own. */
  discarded?: DiscardedAnswer[];
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** A failure keeps the usage of the attempts that failed, so they are still priced. */
export function failureOutcome(error: unknown): OperationOutcome {
  if (error instanceof ThoughtGenerationError) {
    return {
      failure: error,
      ...(error.usage ? { usage: error.usage } : {}),
      ...(error.discarded ? { discarded: error.discarded } : {}),
      ...(error.model ? { model: error.model } : {}),
      ...(error.requestedModel ? { requestedModel: error.requestedModel } : {}),
    };
  }
  return { failure: toError(error) };
}
