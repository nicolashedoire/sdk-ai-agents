import { ThoughtGenerationError, type ModelUsage } from '../errors/index.js';
import type { ThoughtPatch } from './mental-state.js';

/** Result of performing one cognitive operation, before it is applied to the state. */
export interface OperationOutcome {
  patch?: ThoughtPatch;
  failure?: Error;
  /** Unknown investigated by the operation, counted even when it failed. */
  investigatedUnknownId?: string;
  /** True when a tool was actually executed (counts against the tool-call budget). */
  toolCalled?: boolean;
  ignoredFields?: string[];
  model?: string;
  requestedModel?: string;
  usage?: ModelUsage;
}

const MAX_MESSAGE_LENGTH = 500;

export function truncate(text: string, max: number = MAX_MESSAGE_LENGTH): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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
      ...(error.model ? { model: error.model } : {}),
      ...(error.requestedModel ? { requestedModel: error.requestedModel } : {}),
    };
  }
  return { failure: toError(error) };
}
