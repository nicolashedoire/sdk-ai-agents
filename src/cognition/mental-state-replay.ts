import { z } from 'zod';
import { ValidationError } from '../errors/index.js';
import type { Event } from '../types/events.js';
import { deriveRunStatus } from '../utils/run-status.js';
import { uniqueById } from '../utils/unique-events.js';
import { applyThought } from './mental-state-reducer.js';
import { describeMentalState } from './mental-state-view.js';
import { createMentalState, type MentalState } from './mental-state.js';
import {
  observationRecordSchema,
  recalledKnowledgeSchema,
  thoughtPatchSchema,
} from './thought-patch.js';

/** Runs recorded before `schemaVersion` existed are version 1 and keep their original rules. */
const startedDataSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]).default(1),
  goal: z.string(),
  context: z.record(z.unknown()).optional(),
  observations: z.array(observationRecordSchema).default([]),
  commitRules: z
    .object({
      decisionThreshold: z.number().min(0).max(1),
      maxPredictionTests: z.number().int().min(0),
      preferenceWeight: z.number().min(0).max(1),
      minProposalSupport: z.number().min(0).max(1),
    })
    .partial()
    .optional(),
  /** Knowledge recalled from earlier runs, recorded so a rebuild never reads the store. */
  knowledge: z
    .object({
      scope: z.string(),
      items: z.array(recalledKnowledgeSchema).default([]),
      error: z.string().optional(),
    })
    .optional(),
});

const thoughtDataSchema = z.object({
  step: z.number().int().positive(),
  operation: z.string(),
  patch: thoughtPatchSchema,
});

const selectionDataSchema = z.object({
  step: z.number().int().positive(),
  operation: z.string(),
  controller: z.string(),
  available: z.array(z.string()).default([]),
  confidence: z.number().optional(),
  fallbackFrom: z.object({ controller: z.string(), reason: z.string() }).optional(),
});

const feedbackDataSchema = z.object({
  feedback: z.object({
    verdict: z.enum(['match', 'partial', 'mismatch']),
    agreement: z.number().min(0).max(1).optional(),
  }),
});

/**
 * Rebuilds the mental state of a cognitive run from its event log. Thoughts are applied in
 * step order, so the result does not depend on how a store orders equal timestamps.
 */
export function rebuildMentalState(events: Event[]): MentalState {
  return rebuildWithHistory(events).final;
}

interface RebuiltRun {
  /** `before[step]` is the state the controller saw when it chose that step's operation. */
  before: Map<number, MentalState>;
  final: MentalState;
}

function rebuildWithHistory(events: Event[]): RebuiltRun {
  const started = events.find((event) => event.type === 'cognition.started');
  if (!started) {
    throw new ValidationError('events', 'not a cognitive run: no cognition.started event');
  }
  const startedData = startedDataSchema.safeParse(started.data);
  if (!startedData.success) {
    throw new ValidationError('events', 'cognition.started event is malformed');
  }

  const seenSteps = new Set<number>();
  const thoughts = uniqueById(events)
    .filter((event) => event.type === 'cognition.thought')
    .map((event) => {
      const parsed = thoughtDataSchema.safeParse(event.data);
      if (!parsed.success) {
        throw new ValidationError('events', `cognition.thought event ${event.id} is malformed`);
      }
      return parsed.data;
    })
    .sort((left, right) => left.step - right.step)
    .filter((thought) => {
      // A step is applied once, even if a store returned it twice.
      if (seenSteps.has(thought.step)) return false;
      seenSteps.add(thought.step);
      return true;
    });

  const { goal, context, schemaVersion, observations, commitRules, knowledge } = startedData.data;
  let state = createMentalState(goal, context, {
    schemaVersion,
    observations,
    ...(commitRules ? { commitRules } : {}),
    ...(knowledge ? { knowledge: knowledge.items } : {}),
  });
  const before = new Map<number, MentalState>();
  for (const thought of thoughts) {
    before.set(thought.step, state);
    state = applyThought(state, thought.operation, thought.patch).state;
  }
  return { before, final: state };
}

export interface ControllerTrainingExample {
  runId: string;
  step: number;
  /** State the controller saw, in the same compact form used by prompts. */
  state: Record<string, unknown>;
  available: string[];
  /** Label: the operation that was chosen. */
  operation: string;
  controller: string;
  confidence?: number;
  usedFallback: boolean;
  runStatus: string;
  /** Verdict given by the thinker on the run, when feedback was recorded. */
  feedback?: 'match' | 'partial' | 'mismatch';
  /** How much of the run the thinker agreed with, in [0, 1], when given. */
  agreement?: number;
}

/**
 * Turns a cognitive run into supervised examples (state → chosen operation). Runs the
 * thinker marked as `match` are the natural training set for a local controller that
 * could replace a paid decision model.
 */
export function buildControllerDataset(
  runId: string,
  events: Event[]
): ControllerTrainingExample[] {
  const { before } = rebuildWithHistory(events);
  const runStatus = deriveRunStatus(events);
  const feedbackEvent = [...events].reverse().find((event) => event.type === 'cognition.feedback');
  const feedback = feedbackEvent ? feedbackDataSchema.safeParse(feedbackEvent.data) : undefined;
  const verdict = feedback?.success ? feedback.data.feedback.verdict : undefined;
  const agreement = feedback?.success ? feedback.data.feedback.agreement : undefined;

  const examples: ControllerTrainingExample[] = [];
  const seenSteps = new Set<number>();
  for (const event of uniqueById(events)) {
    if (event.type !== 'cognition.operation_selected') continue;
    const selection = selectionDataSchema.safeParse(event.data);
    if (!selection.success) continue;
    const state = before.get(selection.data.step);
    if (!state || seenSteps.has(selection.data.step)) continue;
    seenSteps.add(selection.data.step);
    examples.push({
      runId,
      step: selection.data.step,
      state: describeMentalState(state),
      available: selection.data.available,
      operation: selection.data.operation,
      controller: selection.data.controller,
      ...(selection.data.confidence !== undefined ? { confidence: selection.data.confidence } : {}),
      usedFallback: selection.data.fallbackFrom !== undefined,
      runStatus,
      ...(verdict ? { feedback: verdict } : {}),
      ...(agreement !== undefined ? { agreement } : {}),
    });
  }
  return examples.sort((left, right) => left.step - right.step);
}

/** Serializes examples as JSON Lines (one example per line). */
export function toJsonLines(examples: ControllerTrainingExample[]): string {
  return examples.map((example) => JSON.stringify(example)).join('\n');
}
