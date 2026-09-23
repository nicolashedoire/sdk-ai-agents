/**
 * A cognitive agent that reasons before answering, with typed decisions when a TypeSafe
 * key is available, cost reporting and incident alerts in the console.
 *
 * Run: OPENAI_API_KEY=... [TYPESAFE_API_KEY=...] npm run example:cognitive
 */
import { z } from 'zod';
import { FileEventStore, createSDK, type IncidentNotifier } from '../src/index.js';

const consoleNotifier: IncidentNotifier = {
  name: 'console',
  notify: async (incident) => {
    console.error(`\n🚨 ${incident.severity.toUpperCase()} — ${incident.title}\n${incident.detail}`);
  },
};

const eventStore = new FileEventStore('./events');

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore,
  ...(process.env.TYPESAFE_API_KEY ? { jev: { apiKey: process.env.TYPESAFE_API_KEY } } : {}),
  // Illustrative prices: use your provider's current prices or your contract.
  pricing: { 'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 } },
  incidents: { notifiers: [consoleNotifier] },
});

const lookupMetric = sdk.defineTool({
  name: 'lookup_metric',
  description: 'Reads a business metric of the analytics team',
  schema: z.object({ metric: z.enum(['monthly_churn', 'active_customers', 'analytics_budget_eur']) }),
  retry: { maxRetries: 2 },
  handler: async ({ metric }) => {
    const values = { monthly_churn: '4.1%', active_customers: 1840, analytics_budget_eur: 10_000 };
    return { metric, value: values[metric] };
  },
});

const analyst = sdk.createCognitiveAgent({
  name: 'analyst',
  model: 'gpt-4o-mini',
  tools: [lookupMetric],
  profile: {
    id: 'pragmatic-builder',
    name: 'Pragmatic builder',
    reasoningSequence: [
      { id: 'capability', instruction: 'Establish what each option really enables' },
      { id: 'limits', instruction: 'Look for the limits of each option immediately' },
      { id: 'prototype', instruction: 'Prefer the option that can be tested with a small prototype' },
    ],
    priorities: ['Ship before Q4', 'Stay within budget', 'Avoid vendor lock-in'],
    rejectionCriteria: ['Cannot be tested before committing'],
  },
  limits: { maxSteps: 10 },
});

const result = await analyst.think({
  problem: 'Should we build or buy our analytics module?',
  context: { deadline: 'before Q4', team: 'two developers, already busy' },
});

console.log(`\nStatus: ${result.status}`);
console.log(`Answer: ${result.answer ?? result.error?.message}`);
for (const hypothesis of result.state.hypotheses) {
  console.log(`  ${hypothesis.id} [${hypothesis.status}] ${hypothesis.support.toFixed(2)} — ${hypothesis.statement}`);
}
console.log('\nTrail:', result.state.trail.map((entry) => entry.operation).join(' → '));
console.log('\nCost:', await sdk.getRunCost(result.runId));

// Write pending events and stop the store's flush timer so the process can exit.
await eventStore.destroy();
