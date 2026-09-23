import type { ThinkerProfile } from './thinker-profile.js';

/**
 * Compact description of the thinker sent as part of a typed-decision `state`.
 * Typed-decision models read literally, so the profile is reduced to short lists they can
 * reference by name (`thinker.priorities`, `thinker.rejects`).
 */
export function describeThinker(profile: ThinkerProfile): Record<string, unknown> {
  return {
    name: profile.name,
    orderOfAttention: profile.reasoningSequence.map((move) => move.instruction),
    priorities: profile.priorities,
    rejects: profile.rejectionCriteria,
    riskAppetite: profile.riskAppetite,
    lessons: profile.corrections.slice(-5).map((correction) => correction.lesson),
  };
}
