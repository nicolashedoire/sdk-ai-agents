import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { createSDK, type SDK } from '../../sdk.js';
import { FileEventStore } from '../../stores/file-event-store.js';
import type { SDKConfig } from '../../types/sdk.js';
import { json, ScriptedLLMProvider } from './scripted-llm-provider.js';

export interface TestSDK {
  sdk: SDK;
  store: FileEventStore;
  provider: ScriptedLLMProvider;
  dispose(): Promise<void>;
}

/** SDK wired to a scripted provider and a file event store in a throwaway directory. */
export function createTestSDK(
  overrides: Partial<SDKConfig> = {},
  provider = new ScriptedLLMProvider()
): TestSDK {
  const directory = mkdtempSync(join(tmpdir(), 'sdk-ai-agents-'));
  const store = new FileEventStore(join(directory, 'events'));
  const sdk = createSDK({
    llmProvider: provider,
    eventStore: store,
    goldenTracesDir: join(directory, 'golden'),
    regressionTestSuitesDir: join(directory, 'suites'),
    assertionsDir: join(directory, 'assertions'),
    impactAnalysesDir: join(directory, 'impact'),
    ...overrides,
  });
  return {
    sdk,
    store,
    provider,
    dispose: async () => {
      await store.destroy();
      // Let directory creations started in constructors settle before deleting the folder.
      await new Promise((resolve) => setTimeout(resolve, 20));
      rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
    },
  };
}

/** Replies for a complete reasoning loop about build vs buy. */
export function scriptBuildOrBuy(provider: ScriptedLLMProvider): ScriptedLLMProvider {
  return provider
    .always(
      'represent',
      json({
        summary: 'Framed the build-or-buy question',
        addFacts: [{ statement: 'Budget is 10k EUR', source: 'input', confidence: 0.9 }],
        addConstraints: [{ statement: 'Must ship before Q4' }],
        addUnknowns: [{ question: 'What is the current monthly churn?' }],
      })
    )
    .always(
      'hypothesize',
      json({
        summary: 'Two options',
        addHypotheses: [
          { statement: 'Build the module in-house', rationale: 'Full control' },
          { statement: 'Buy a SaaS analytics tool', rationale: 'Fast to ship' },
        ],
      })
    )
    .always(
      'simulate',
      json({
        summary: 'Projected both options',
        simulations: [
          { hypothesisId: 'H1', steps: ['Hire', 'Build for 6 months'], outcome: 'Misses Q4' },
          {
            hypothesisId: 'H2',
            steps: ['Pilot for 2 weeks', 'Roll out'],
            outcome: 'Ships in Q3',
            sideEffects: ['Vendor dependency'],
          },
        ],
      })
    )
    .always(
      'critique',
      json({
        summary: 'Stress-tested both',
        critiques: [
          { hypothesisId: 'H1', objection: 'No team available before Q4', severity: 'major' },
          {
            hypothesisId: 'H2',
            objection: 'Vendor lock-in',
            severity: 'minor',
            rebuttal: 'Data export API exists',
          },
        ],
        hypothesisUpdates: [
          { hypothesisId: 'H1', support: 0.3 },
          { hypothesisId: 'H2', support: 0.7 },
        ],
      })
    )
    .always('tool-selection', {
      toolCall: { name: 'lookup_metric', arguments: { metric: 'churn' } },
    })
    .always(
      'integrate',
      json({
        summary: 'Churn measured',
        addFacts: [{ statement: 'Monthly churn is 4%', source: 'tool', confidence: 0.95 }],
        resolveUnknowns: [{ unknownId: 'U1', resolution: '4% monthly' }],
      })
    )
    .always(
      'compare',
      json({
        summary: 'Buying wins',
        hypothesisUpdates: [
          { hypothesisId: 'H1', support: 0.25 },
          { hypothesisId: 'H2', support: 0.8 },
        ],
        confidence: 0.8,
      })
    )
    .always(
      'decide',
      json({
        summary: 'Commit to buying',
        decision: {
          hypothesisId: 'H2',
          answer: 'Buy a SaaS analytics tool and run a two-week pilot.',
          rationale: 'Only option that ships before Q4 within budget.',
          confidence: 0.8,
          nextActions: ['Run a two-week pilot'],
        },
      })
    );
}

const lookupMetricSchema = z.object({ metric: z.string() });

export const lookupMetricDefinition = {
  name: 'lookup_metric',
  description: 'Reads a business metric',
  schema: lookupMetricSchema,
  handler: async (params: unknown) => ({
    metric: lookupMetricSchema.parse(params).metric,
    value: '4%',
  }),
};
