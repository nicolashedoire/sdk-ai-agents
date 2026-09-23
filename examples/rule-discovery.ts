/**
 * A cognitive agent that induces a rule from measurements, predicts, tests its predictions
 * on a (simulated) physics bench and revises the rule when a test refutes it.
 *
 * Run: OPENAI_API_KEY=... npm run example:rules
 */
import { z } from 'zod';
import { FileEventStore, createSDK, type OutcomeEvaluator } from '../src/index.js';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new FileEventStore('./events'),
  // Illustrative prices: use your provider's current prices or your contract.
  pricing: { 'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 } },
});

const benchTest = z.object({
  material: z.enum(['steel', 'glass', 'wood', 'rubber']),
  massKg: z.number().positive(),
  expectedSeconds: z.number().positive(),
});

/**
 * Stands in for a real measurement: a ball rolling without slipping down a 2 m, 30° plane.
 * Mass does not matter; a soft ball loses energy to rolling resistance.
 */
const bench: OutcomeEvaluator = {
  id: 'inclined-plane-bench',
  version: '1.0.0',
  async evaluate({ prediction }) {
    const test = benchTest.safeParse(prediction.test);
    if (!test.success) {
      return { verdict: 'inconclusive', reason: 'the prediction does not say which ball to roll' };
    }
    const { material, massKg, expectedSeconds } = test.data;
    const rollingResistance = { steel: 0, glass: 0, wood: 0.02, rubber: 0.2 }[material];
    const angle = Math.PI / 6;
    const acceleration = (5 / 7) * 9.81 * (Math.sin(angle) - rollingResistance * Math.cos(angle));
    const seconds = Math.round(Math.sqrt(4 / acceleration) * 100) / 100;
    const refuted = Math.abs(seconds - expectedSeconds) / expectedSeconds > 0.1;
    return {
      verdict: refuted ? 'refuted' : 'confirmed',
      observed: { material, massKg, seconds },
      summary: `${material} ball, ${massKg * 1000} g: ${seconds} s`,
      metrics: { seconds },
    };
  },
};

const physicist = sdk.createCognitiveAgent({
  name: 'physicist',
  model: 'gpt-4o-mini',
  evaluator: bench,
  systemPrompt:
    'When you predict the result of rolling a ball, put { "material", "massKg", "expectedSeconds" } in the prediction "test". Materials: steel, glass, wood, rubber.',
  limits: { maxSteps: 14, maxPredictionTests: 4 },
});

const result = await physicist.think({
  problem: 'Does the time a ball takes to roll down our 2 m, 30° plane depend on the ball?',
  observations: [
    { content: { material: 'steel', massKg: 0.1, seconds: 1.07 }, summary: 'Steel ball, 100 g: 1.07 s', originGroup: 'bench' },
    { content: { material: 'steel', massKg: 0.4, seconds: 1.07 }, summary: 'Steel ball, 400 g: 1.07 s', originGroup: 'bench' },
  ],
});

console.log(`\n${result.decision?.status ?? result.status}: ${result.answer ?? result.error?.message}`);
for (const missing of result.decision?.missing ?? []) console.log(`  missing: ${missing}`);
console.log('\nHypotheses:');
for (const hypothesis of result.state.hypotheses) {
  const origin = hypothesis.parentId ? ` (revises ${hypothesis.parentId})` : '';
  console.log(`  ${hypothesis.id} [${hypothesis.kind}, ${hypothesis.status}]${origin} ${hypothesis.statement}`);
}
console.log('\nPredictions:');
for (const prediction of result.state.predictions) {
  console.log(`  ${prediction.id} of ${prediction.hypothesisId}: ${prediction.status} — ${prediction.expected}`);
}
console.log(`\nRun ${result.runId}: ${(await sdk.getRunCost(result.runId)).totalUsd.toFixed(4)} USD`);
