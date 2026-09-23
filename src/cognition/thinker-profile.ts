import { z } from 'zod';

/**
 * A thinker profile describes HOW someone reasons, not what they like: the order in which
 * they examine a problem, what they prioritize, the heuristics they apply, what makes them
 * reject an idea, plus calibration examples and corrections collected from their feedback.
 *
 * The profile is plain data. It is rendered into the prompts of every cognitive operation
 * and refined over time with `refineProfile`.
 */

const requiredText = z.string().trim().min(1);

export const MAX_PROFILE_EXAMPLES = 10;
export const MAX_PROFILE_CORRECTIONS = 20;

export const thinkerProfileSchema = z.object({
  id: requiredText,
  name: requiredText,
  version: requiredText.default('1.0.0'),
  summary: z.string().optional(),
  /** Ordered "moves" the thinker makes when facing a problem. */
  reasoningSequence: z.array(z.object({ id: requiredText, instruction: requiredText })).default([]),
  /** What matters most, most important first. */
  priorities: z.array(requiredText).default([]),
  heuristics: z.array(z.object({ when: requiredText, action: requiredText })).default([]),
  /** Conditions under which the thinker rejects a solution. */
  rejectionCriteria: z.array(requiredText).default([]),
  riskAppetite: z.enum(['low', 'medium', 'high']).default('medium'),
  /** Worked examples the thinker validated ("yes, that is how I would reason"). */
  examples: z
    .array(z.object({ topic: requiredText, reasoning: requiredText, conclusion: requiredText }))
    .default([]),
  /** Lessons from runs the thinker disagreed with. They take precedence over everything else. */
  corrections: z
    .array(
      z.object({
        topic: requiredText,
        modelConclusion: requiredText,
        expected: requiredText,
        lesson: requiredText,
        verdict: z.enum(['partial', 'mismatch']),
        runId: z.string().optional(),
      })
    )
    .default([]),
});

export type ThinkerProfileInput = z.input<typeof thinkerProfileSchema>;
export type ThinkerProfile = z.output<typeof thinkerProfileSchema>;

export const reasoningFeedbackSchema = z.discriminatedUnion('verdict', [
  z.object({ verdict: z.literal('match'), notes: z.string().optional() }),
  z.object({
    verdict: z.literal('partial'),
    expected: requiredText,
    lesson: z.string().optional(),
    notes: z.string().optional(),
  }),
  z.object({
    verdict: z.literal('mismatch'),
    expected: requiredText,
    lesson: z.string().optional(),
    notes: z.string().optional(),
  }),
]);

/** Feedback on a finished run: did it reason the way the thinker would have? */
export type ReasoningFeedback = z.infer<typeof reasoningFeedbackSchema>;

/** Validates a profile and fills defaults. */
export function defineThinkerProfile(input: ThinkerProfileInput): ThinkerProfile {
  return thinkerProfileSchema.parse(input);
}

/** Neutral profile used when none is provided. */
export const DEFAULT_THINKER_PROFILE: ThinkerProfile = defineThinkerProfile({
  id: 'balanced-analyst',
  name: 'Balanced analyst',
  summary: 'Evidence-first reasoning that states its uncertainty.',
  reasoningSequence: [
    { id: 'frame', instruction: 'Restate the problem and what a good answer must achieve.' },
    { id: 'evidence', instruction: 'Separate established facts from assumptions.' },
    { id: 'options', instruction: 'Consider more than one explanation or solution.' },
    { id: 'stress-test', instruction: 'Look for the strongest objection to each option.' },
    {
      id: 'commit',
      instruction: 'Commit to the best-supported option and say what would change your mind.',
    },
  ],
  priorities: ['Correctness', 'Evidence over intuition', 'Reversible decisions first'],
  rejectionCriteria: ['Its core claim rests on an unverified assumption'],
});

export interface RunForFeedback {
  runId: string;
  goal: string;
  conclusion: string;
  reasoningSummary: string;
}

/**
 * Returns a new profile that learns from feedback on a run:
 * - `match` keeps the run as a calibration example;
 * - `partial` / `mismatch` record a correction that future prompts must honor.
 * The patch version is bumped so traces show which profile version produced them.
 */
export function refineProfile(
  profile: ThinkerProfile,
  run: RunForFeedback,
  feedback: ReasoningFeedback
): ThinkerProfile {
  if (feedback.verdict === 'match') {
    return {
      ...profile,
      version: bumpPatchVersion(profile.version),
      examples: [
        ...profile.examples,
        { topic: run.goal, reasoning: run.reasoningSummary, conclusion: run.conclusion },
      ].slice(-MAX_PROFILE_EXAMPLES),
    };
  }

  return {
    ...profile,
    version: bumpPatchVersion(profile.version),
    corrections: [
      ...profile.corrections,
      {
        topic: run.goal,
        modelConclusion: run.conclusion,
        expected: feedback.expected,
        lesson: feedback.lesson?.trim() || feedback.expected,
        verdict: feedback.verdict,
        runId: run.runId,
      },
    ].slice(-MAX_PROFILE_CORRECTIONS),
  };
}

/** `1.2.3` → `1.2.4`; any other format gets a `.1` suffix. */
export function bumpPatchVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    return `${version}.1`;
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

/** Renders the profile as prompt text. Corrections come last so they weigh the most. */
export function renderProfile(profile: ThinkerProfile): string {
  const lines = [`Thinker: ${profile.name} (profile ${profile.id} v${profile.version})`];
  if (profile.summary) {
    lines.push(profile.summary);
  }
  lines.push(`Risk appetite: ${profile.riskAppetite}.`);
  if (profile.reasoningSequence.length > 0) {
    lines.push('', 'Order of attention (follow it):');
    profile.reasoningSequence.forEach((move, index) => {
      lines.push(`${index + 1}. [${move.id}] ${move.instruction}`);
    });
  }
  if (profile.priorities.length > 0) {
    lines.push('', 'Priorities (most important first):');
    for (const priority of profile.priorities) lines.push(`- ${priority}`);
  }
  if (profile.heuristics.length > 0) {
    lines.push('', 'Heuristics:');
    for (const heuristic of profile.heuristics)
      lines.push(`- When ${heuristic.when}, then ${heuristic.action}`);
  }
  if (profile.rejectionCriteria.length > 0) {
    lines.push('', 'Rejects a solution when:');
    for (const criterion of profile.rejectionCriteria) lines.push(`- ${criterion}`);
  }
  if (profile.examples.length > 0) {
    lines.push('', 'Validated examples of their reasoning:');
    for (const example of profile.examples) {
      lines.push(
        `- Topic: ${example.topic}`,
        `  Reasoning: ${example.reasoning}`,
        `  Conclusion: ${example.conclusion}`
      );
    }
  }
  if (profile.corrections.length > 0) {
    lines.push(
      '',
      'Corrections from past feedback (highest priority, do not repeat these mistakes):'
    );
    for (const correction of profile.corrections) {
      lines.push(
        `- Topic: ${correction.topic}`,
        `  You concluded: ${correction.modelConclusion}`,
        `  They expected: ${correction.expected}`,
        `  Lesson: ${correction.lesson}`
      );
    }
  }
  return lines.join('\n');
}
