import { z } from 'zod';
import { ThoughtGenerationError, ValidationError } from '../errors/index.js';
import type { LLMProvider, LLMRequest } from '../providers/llm-provider.js';
import { extractJsonObject } from './llm-thought-generator.js';
import { thinkerProfileSchema, type ThinkerProfile } from './thinker-profile.js';

/** A topic explained by the person, in their own words, as messy as it came to them. */
export const thinkingSampleSchema = z.object({
  topic: z.string().trim().min(1),
  /** How they approached it: what they looked at first, what they checked, why. */
  reasoning: z.string().trim().min(1),
  conclusion: z.string().trim().min(1).optional(),
});

export type ThinkingSample = z.infer<typeof thinkingSampleSchema>;

export interface DistillProfileInput {
  id: string;
  name: string;
  samples: ThinkingSample[];
  model: string;
  temperature?: number;
  abortSignal?: AbortSignal;
}

const distilledSchema = thinkerProfileSchema.pick({
  summary: true,
  reasoningSequence: true,
  priorities: true,
  heuristics: true,
  rejectionCriteria: true,
  riskAppetite: true,
});

const SYSTEM_PROMPT = [
  'You are a cognitive analyst. From several topics a person explained in their own words, you extract HOW they think: the recurring operations of their reasoning, not their opinions.',
  'Look for regularities across samples: what they examine first, the questions they ask, how they connect ideas, how far they push an idea, what makes them reject a solution, their relation to risk, cost, novelty and simplicity, and how they reach a decision.',
  'Only keep patterns supported by at least one sample; prefer patterns seen in several samples. Phrase every instruction as an action the reasoner can perform.',
  'Reply with exactly one JSON object and nothing else:',
  '{ "summary": string, "reasoningSequence": [{ "id": "kebab-case", "instruction": string }], "priorities": [string], "heuristics": [{ "when": string, "action": string }], "rejectionCriteria": [string], "riskAppetite": "low" | "medium" | "high" }',
].join('\n');

/**
 * Builds a thinker profile from worked samples. The samples themselves are kept as
 * calibration examples, so the profile carries both the extracted algorithm and the
 * evidence it came from. Refine it later with feedback on real runs.
 */
export async function distillThinkerProfile(
  provider: LLMProvider,
  input: DistillProfileInput
): Promise<ThinkerProfile> {
  const validated = z.array(thinkingSampleSchema).min(1).safeParse(input.samples);
  if (!validated.success) {
    throw new ValidationError(
      'samples',
      'at least one sample with a topic and a reasoning is required'
    );
  }
  const samples = validated.data;

  const messages: LLMRequest['messages'] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: samples
        .map(
          (sample, index) =>
            `Sample ${index + 1}\nTopic: ${sample.topic}\nHow they reasoned: ${sample.reasoning}${sample.conclusion ? `\nConclusion: ${sample.conclusion}` : ''}`
        )
        .join('\n\n'),
    },
  ];

  let lastError = 'no reply';
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await provider.generateCompletion({
      model: input.model,
      messages: [...messages],
      temperature: input.temperature ?? 0.2,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
    const content = response.content ?? '';
    const parsed = distilledSchema.safeParse(extractJsonObject(content));
    if (parsed.success && parsed.data.reasoningSequence.length > 0) {
      return thinkerProfileSchema.parse({
        ...parsed.data,
        id: input.id,
        name: input.name,
        examples: samples
          .filter((sample) => sample.conclusion)
          .map((sample) => ({
            topic: sample.topic,
            reasoning: sample.reasoning,
            conclusion: sample.conclusion,
          })),
      });
    }
    lastError = parsed.success
      ? 'reasoningSequence must not be empty'
      : `${parsed.error.issues[0]?.path.join('.') || 'reply'}: ${parsed.error.issues[0]?.message ?? 'invalid'}`;
    messages.push(
      { role: 'assistant', content },
      {
        role: 'user',
        content: `Your reply could not be used: ${lastError}. Reply again with only the JSON object.`,
      }
    );
  }
  throw new ThoughtGenerationError('distill_profile', lastError, { model: input.model });
}
