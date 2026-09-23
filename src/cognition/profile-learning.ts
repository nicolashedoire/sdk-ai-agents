import { ValidationError } from '../errors/index.js';
import type { Event } from '../types/events.js';
import { rebuildMentalState } from './mental-state-replay.js';
import type { MentalState } from './mental-state.js';
import { truncate } from './operation-outcome.js';
import {
  reasoningFeedbackSchema,
  refineProfile,
  type ReasoningFeedback,
  type ThinkerProfile,
} from './thinker-profile.js';

export interface ProfileLesson {
  profile: ThinkerProfile;
  /** Data of the `cognition.feedback` event to append to the run. */
  event: Record<string, unknown>;
}

/**
 * Refines a profile from the thinker's verdict on a finished run, read from its events.
 * @throws ValidationError when the run is not a cognitive run with a decision.
 */
export function learnFromRun(
  profile: ThinkerProfile,
  runId: string,
  events: Event[],
  feedback: ReasoningFeedback
): ProfileLesson {
  const parsed = reasoningFeedbackSchema.parse(feedback);
  const state = rebuildMentalState(events);
  if (!state.decision) {
    throw new ValidationError('runId', 'this run has no decision to give feedback on');
  }
  const refined = refineProfile(
    profile,
    {
      runId,
      goal: state.goal,
      conclusion: state.decision.answer,
      reasoningSummary: summarizeReasoning(state),
    },
    parsed
  );
  return {
    profile: refined,
    event: {
      feedback: parsed,
      profileId: refined.id,
      profileVersionBefore: profile.version,
      profileVersionAfter: refined.version,
    },
  };
}

/** Short narrative of the reasoning, used as a calibration example. */
export function summarizeReasoning(state: MentalState): string {
  return truncate(
    state.trail.map((entry) => `${entry.operation}: ${entry.summary}`).join(' → '),
    1200
  );
}
