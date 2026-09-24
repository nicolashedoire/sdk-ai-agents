/**
 * A cognitive agent that induces a rule from measurements, predicts, tests its predictions
 * on a (simulated) physics bench and revises the rule when a test refutes it. What the bench
 * confirmed or refuted is kept in ./knowledge: run it twice, and the second run starts with
 * what the first one established.
 *
 * Run: OPENAI_API_KEY=... npm run example:rules
 */
import { z } from 'zod';
import { FileEventStore, FileKnowledgeStore, createSDK, type OutcomeEvaluator } from '../src/index.js';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new FileEventStore('./events'),
  // Illustrative prices: use your provider's current prices or your contract.
  pricing: {
    'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  },
});

const ball = z.object({
  material: z.enum(['steel', 'glass', 'wood', 'rubber']),
  massKg: z.number().positive(),
});

/** A prediction compares two balls: do they take the same time or not? */
const benchTest = z.object({
  roll: ball,
  against: ball,
  expect: z.enum(['same time', 'different time']),
});

/** Stands in for a measurement: a ball rolling without slipping down a 2 m, 30° plane. */
function rollingTime(material: z.infer<typeof ball>['material']): number {
  const rollingResistance = { steel: 0, glass: 0, wood: 0.02, rubber: 0.2 }[material];
  const angle = Math.PI / 6;
  const acceleration = (5 / 7) * 9.81 * (Math.sin(angle) - rollingResistance * Math.cos(angle));
  return Math.round(Math.sqrt(4 / acceleration) * 100) / 100;
}

/** Rolls both balls; times within 5% of each other count as the same. */
const bench: OutcomeEvaluator = {
  id: 'inclined-plane-bench',
  version: '2.0.0',
  async evaluate({ prediction }) {
    const test = benchTest.safeParse(prediction.test);
    if (!test.success) {
      return { verdict: 'inconclusive', reason: 'the prediction does not say which two balls to roll' };
    }
    const { roll, against, expect } = test.data;
    const [first, second] = [rollingTime(roll.material), rollingTime(against.material)];
    const same = Math.abs(first - second) / Math.max(first, second) <= 0.05;
    const describe = (b: z.infer<typeof ball>, seconds: number) =>
      `${b.material} ${b.massKg * 1000} g: ${seconds} s`;
    return {
      verdict: same === (expect === 'same time') ? 'confirmed' : 'refuted',
      observed: { roll: { ...roll, seconds: first }, against: { ...against, seconds: second } },
      summary: `${describe(roll, first)} vs ${describe(against, second)}`,
      metrics: { rollSeconds: first, againstSeconds: second },
    };
  },
};

const physicist = sdk.createCognitiveAgent({
  name: 'physicist',
  model: process.env.MODEL ?? 'gpt-4o-mini',
  evaluator: bench,
  knowledge: { store: new FileKnowledgeStore('./knowledge'), scope: 'inclined-plane' },
  systemPrompt: [
    'Predictions are tested on a bench that rolls two balls down the plane and times them.',
    'Put in each prediction "test": { "roll": { "material", "massKg" }, "against": { "material", "massKg" }, "expect": "same time" | "different time" }.',
    'Materials: steel, glass, wood, rubber.',
  ].join('\n'),
  limits: { maxSteps: 18, maxPredictionTests: 5 },
});

const result = await physicist.think({
  problem: 'Does the time a ball takes to roll down our 2 m, 30° plane depend on the ball?',
  observations: [
    { content: { material: 'steel', massKg: 0.1, seconds: 1.07 }, summary: 'Steel ball, 100 g: 1.07 s', originGroup: 'bench' },
    { content: { material: 'steel', massKg: 0.4, seconds: 1.07 }, summary: 'Steel ball, 400 g: 1.07 s', originGroup: 'bench' },
  ],
});

if (result.state.knowledge.length > 0) {
  console.log('\nRecalled from earlier runs:');
  for (const item of result.state.knowledge) {
    console.log(`  ${item.id} [${item.status}, ${item.confirmations} confirmed, ${item.refutations} refuted] ${item.statement}`);
  }
}
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
