import { z } from 'zod';
import type { OutcomeEvaluator, OutcomeReport } from '../../cognition/outcome-evaluator.js';
import { json, type ScriptedLLMProvider } from './scripted-llm-provider.js';

/** A physics bench and a scripted model that discover the rule of an inclined plane. */

export const PROBLEM =
  'Does the time a ball takes to roll down our 2 m, 30° plane depend on its mass?';

export const OBSERVATIONS = [
  {
    content: { material: 'steel', massKg: 0.1, seconds: 1.07 },
    summary: 'Steel ball, 100 g: 1.07 s',
    originGroup: 'bench',
  },
  {
    content: { material: 'steel', massKg: 0.4, seconds: 1.07 },
    summary: 'Steel ball, 400 g: 1.07 s',
    originGroup: 'bench',
  },
];

const benchTestSchema = z.object({
  material: z.string(),
  massKg: z.number(),
  expectedSeconds: z.number(),
});

/**
 * Deterministic physics bench: a solid ball rolling without slipping accelerates at
 * 5/7·g·sinθ whatever its mass; a soft ball also loses energy to rolling resistance.
 */
export class InclinedPlaneBench implements OutcomeEvaluator {
  readonly id = 'inclined-plane-bench';
  readonly version = '1.0.0';
  readonly tested: string[] = [];
  offline = false;

  async evaluate({
    prediction,
  }: Parameters<OutcomeEvaluator['evaluate']>[0]): Promise<OutcomeReport> {
    if (this.offline) throw new Error('bench offline');
    const test = benchTestSchema.safeParse(prediction.test);
    if (!test.success) {
      return { verdict: 'inconclusive', reason: 'the prediction does not say what to roll' };
    }
    const { material, massKg, expectedSeconds } = test.data;
    this.tested.push(prediction.id);
    const rollingResistance = material === 'rubber' ? 0.2 : 0;
    const angle = Math.PI / 6;
    const acceleration = (5 / 7) * 9.81 * (Math.sin(angle) - rollingResistance * Math.cos(angle));
    const seconds = Math.round(Math.sqrt((2 * 2) / acceleration) * 100) / 100;
    const deviation = Math.abs(seconds - expectedSeconds) / expectedSeconds;
    const refuted = deviation > 0.1;
    return {
      verdict: refuted ? 'refuted' : 'confirmed',
      observed: { material, massKg, seconds },
      summary: `${material} ball, ${massKg * 1000} g: ${seconds} s`,
      metrics: { seconds, deviation: Math.round(deviation * 100) / 100 },
      ...(refuted
        ? {
            reason: `${material} took ${seconds} s instead of ${expectedSeconds} s`,
            causeCandidates: ['material deforms', 'surface grip'],
          }
        : {}),
    };
  }
}

/** Replies of a run that induces a rule, sees it fail, restricts it and verifies the variant. */
export function scriptRuleDiscovery(provider: ScriptedLLMProvider): ScriptedLLMProvider {
  return provider
    .always(
      'represent',
      json({
        summary: 'Two steel balls of different mass took the same time',
        addFacts: [
          {
            statement: 'Steel balls of 100 g and 400 g both took 1.07 s',
            source: 'input',
            observationRefs: ['O1', 'O2'],
          },
        ],
        addConstraints: [{ statement: 'Only this plane and surface were measured' }],
      })
    )
    .always(
      'compare_observations',
      json({
        summary: 'Mass changed, time did not',
        comparisons: [
          {
            left: ['O1'],
            right: ['O2'],
            relation: 'similarity',
            aspect: 'rolling time',
            context: 'same plane, same material',
            rationale: 'four times the mass, same time',
          },
        ],
      })
    )
    .always(
      'hypothesize',
      json({
        summary: 'Mass does not matter',
        addHypotheses: [
          {
            statement: 'Rolling time on this plane does not depend on the ball',
            kind: 'rule',
            inference: 'induction',
            premiseRefs: ['O1', 'O2'],
            scope: 'balls on this plane',
            rationale: 'Two cases agree',
          },
        ],
      })
    )
    .enqueue(
      'simulate',
      json({
        summary: 'A rubber ball should take the same time',
        simulations: [
          { hypothesisId: 'H1', steps: ['roll a 100 g rubber ball'], outcome: 'about 1.07 s' },
        ],
        predictions: [
          {
            hypothesisId: 'H1',
            expected: 'A 100 g rubber ball takes 1.07 s',
            falsifier: 'It takes more than 10% longer',
            test: { material: 'rubber', massKg: 0.1, expectedSeconds: 1.07 },
          },
        ],
      }),
      json({
        summary: 'A heavy glass ball should take the same time',
        simulations: [
          { hypothesisId: 'H2', steps: ['roll a 400 g glass ball'], outcome: 'about 1.07 s' },
        ],
        predictions: [
          {
            hypothesisId: 'H2',
            expected: 'A 400 g glass ball takes 1.07 s',
            falsifier: 'It takes more than 10% longer',
            test: { material: 'glass', massKg: 0.4, expectedSeconds: 1.07 },
          },
        ],
      })
    )
    .always(
      'revise',
      json({
        summary: 'Restrict the rule to rigid balls',
        addHypotheses: [
          {
            statement: 'For rigid balls, rolling time on this plane does not depend on mass',
            kind: 'rule',
            inference: 'abduction',
            premiseRefs: ['O1', 'O2', 'O3'],
            scope: 'rigid balls on this plane',
            difference: 'Excludes deformable balls: the rubber ball lost energy while rolling',
          },
        ],
        addUnknowns: [{ question: 'Is the slowdown due to the material or to the surface grip?' }],
      })
    )
    .always(
      'critique',
      json({
        summary: 'Holds for rigid balls',
        critiques: [
          {
            hypothesisId: 'H2',
            objection: 'Only steel and glass were tested',
            severity: 'minor',
            rebuttal: 'Both rigid materials agree',
          },
        ],
        hypothesisUpdates: [{ hypothesisId: 'H2', support: 0.8 }],
      })
    )
    .always(
      'compare',
      json({
        summary: 'The restricted rule is well supported',
        hypothesisUpdates: [{ hypothesisId: 'H2', support: 0.82, basisRefs: ['O1', 'O2', 'O4'] }],
      })
    )
    .always(
      'decide',
      json({
        summary: 'Commit to the restricted rule',
        decision: {
          hypothesisId: 'H2',
          answer:
            'For rigid balls, mass does not change the rolling time on this plane; soft balls are slower.',
          rationale:
            'Two steel balls and a glass ball agree; a rubber ball refuted the unrestricted rule.',
          confidence: 0.9,
          nextActions: ['Roll the rubber ball on a harder surface to separate material from grip'],
        },
      })
    );
}
