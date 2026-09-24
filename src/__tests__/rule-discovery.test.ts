import { afterEach, describe, expect, it } from 'vitest';
import type { OutcomeEvaluator } from '../cognition/outcome-evaluator.js';
import { ValidationError } from '../errors/index.js';
import type { Event } from '../types/events.js';
import { InclinedPlaneBench, OBSERVATIONS, PROBLEM, scriptRuleDiscovery } from './support/inclined-plane.js';
import { json } from './support/scripted-llm-provider.js';
import { createTestSDK, lookupMetricDefinition, scriptBuildOrBuy, type TestSDK } from './support/test-sdk.js';

function operations(events: Event[]): string[] {
  return events.filter((event) => event.type === 'cognition.operation_selected').map((event) => String(event.data.operation));
}

describe('observe → compare → deduce → verify → revise', () => {
  let env: TestSDK;
  afterEach(async () => {
    await env.dispose();
  });

  it('revises a refuted rule into a verified variant and keeps the whole history', async () => {
    env = createTestSDK();
    scriptRuleDiscovery(env.provider);
    const bench = new InclinedPlaneBench();
    const agent = env.sdk.createCognitiveAgent({ name: 'physicist', model: 'test-model', evaluator: bench });

    const result = await agent.think({ problem: PROBLEM, observations: OBSERVATIONS });

    expect(result.status).toBe('completed');
    expect(result.decision).toMatchObject({ hypothesisId: 'H2', status: 'committed', missing: [], confidence: 0.82 });
    const events = await env.sdk.getEvents(result.runId);
    expect(operations(events)).toEqual([
      'represent',
      'compare_observations',
      'hypothesize',
      'simulate',
      'test_prediction',
      'revise',
      'simulate',
      'test_prediction',
      'critique',
      'compare',
      'decide',
    ]);

    const { state } = result;
    expect(state.hypotheses[0]).toMatchObject({
      id: 'H1',
      status: 'rejected',
      counterEvidenceRefs: ['O3'],
      rejectionReason: 'prediction P1 refuted: rubber took 1.32 s instead of 1.07 s',
    });
    expect(state.hypotheses[1]).toMatchObject({ id: 'H2', parentId: 'H1', status: 'selected', evidenceRefs: ['O4'], scope: 'rigid balls on this plane' });
    expect(state.predictions.map((prediction) => [prediction.id, prediction.status])).toEqual([
      ['P1', 'refuted'],
      ['P2', 'confirmed'],
    ]);
    expect(state.predictions[0]?.evaluation).toMatchObject({ causeCandidates: ['material deforms', 'surface grip'], metrics: { seconds: 1.32 } });
    expect(state.comparisons[0]).toMatchObject({ relation: 'similarity', left: ['O1'], right: ['O2'] });
    // The refutation is kept as a resolved contradiction: what was expected, what was seen, what was done.
    expect(state.contradictions).toEqual([
      expect.objectContaining({ category: 'refuted_prediction', between: ['P1', 'H1', 'O3'], resolved: true, resolutionAction: 'retracted', resolutionBasis: ['O3'] }),
    ]);

    // Test results are observations whose provenance is the recorded evaluation.
    const evaluated = events.filter((event) => event.type === 'cognition.evaluated');
    expect(evaluated.map((event) => event.data.verdict)).toEqual(['refuted', 'confirmed']);
    expect(state.observations.map((observation) => [observation.id, observation.sourceKind, observation.sourceEventId])).toEqual([
      ['O1', 'input', undefined],
      ['O2', 'input', undefined],
      ['O3', 'evaluation', evaluated[0]?.id],
      ['O4', 'evaluation', evaluated[1]?.id],
    ]);
    // Tests are run by the bench, not by the language model.
    expect(bench.tested).toEqual(['P1', 'P2']);
    expect(env.provider.channels()).not.toContain('test_prediction');

    expect(await env.sdk.getMentalState(result.runId)).toEqual(state);
    const concluded = events.find((event) => event.type === 'cognition.concluded');
    expect(concluded?.data).toMatchObject({ status: 'committed', predictions: [{ id: 'P1', status: 'refuted' }, { id: 'P2', status: 'confirmed' }] });
  });

  it('concludes provisionally, saying what is missing, when the budget runs out', async () => {
    env = createTestSDK();
    scriptRuleDiscovery(env.provider).always('decide', json({
      summary: 'Best guess',
      decision: { hypothesisId: 'H1', answer: 'Mass does not matter.', rationale: 'Two cases agree.', confidence: 0.9 },
    }));
    const agent = env.sdk.createCognitiveAgent({ name: 'physicist', model: 'test-model', evaluator: new InclinedPlaneBench(), limits: { maxSteps: 5 } });

    const result = await agent.think({ problem: PROBLEM, observations: OBSERVATIONS });

    expect(result.status).toBe('completed');
    expect(result.decision).toMatchObject({ status: 'provisional', confidence: 0.5 });
    expect(result.decision?.missing).toEqual([
      'H1 has not been critiqued',
      'H1 was not reassessed since the evidence changed',
      'prediction P1 is untested: A 100 g rubber ball takes 1.07 s',
      'H1 has evidence support 0.5, below 0.75',
    ]);
    const selected = (await env.sdk.getEvents(result.runId)).filter((event) => event.type === 'cognition.operation_selected').at(-1);
    expect(selected?.data).toMatchObject({ operation: 'decide', controller: 'engine', forced: true });
  });

  it('records a failed measurement as inconclusive and keeps the rule in play', async () => {
    env = createTestSDK();
    scriptRuleDiscovery(env.provider);
    const bench = new InclinedPlaneBench();
    bench.offline = true;
    const agent = env.sdk.createCognitiveAgent({ name: 'physicist', model: 'test-model', evaluator: bench, limits: { maxSteps: 6 } });

    const result = await agent.think({ problem: PROBLEM, observations: OBSERVATIONS });

    expect(result.state.predictions[0]).toMatchObject({ status: 'inconclusive', evaluation: { reason: 'evaluator failed: bench offline' } });
    expect(result.state.hypotheses[0]?.status).not.toBe('rejected');
    expect(result.state.observations).toHaveLength(2);
  });

  it('does not let a refutation without an observation reject a rule', async () => {
    env = createTestSDK();
    scriptRuleDiscovery(env.provider);
    const silent: OutcomeEvaluator = { id: 'silent', version: '1', evaluate: async () => ({ verdict: 'refuted' }) };
    const agent = env.sdk.createCognitiveAgent({ name: 'physicist', model: 'test-model', evaluator: silent, limits: { maxSteps: 6 } });

    const result = await agent.think({ problem: PROBLEM, observations: OBSERVATIONS });

    expect(result.state.predictions[0]).toMatchObject({ status: 'inconclusive', evaluation: { reason: 'a refutation must report what was observed' } });
    expect(result.state.hypotheses[0]?.status).not.toBe('rejected');
  });

  it('refuses malformed observations before the run starts', async () => {
    env = createTestSDK();
    const agent = env.sdk.createCognitiveAgent({ name: 'physicist', model: 'test-model' });
    await expect(agent.think({ problem: PROBLEM, observations: [{ content: null }] })).rejects.toThrow(ValidationError);
    expect(env.provider.requests).toHaveLength(0);
  });
});

describe('tool observations and thinker feedback', () => {
  let env: TestSDK;
  afterEach(async () => {
    await env.dispose();
  });

  it('links tool facts to the recorded tool call', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider);
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model', tools: [env.sdk.defineTool(lookupMetricDefinition)] });

    const result = await agent.think({ problem: 'Should we build or buy the analytics module?' });

    expect(result.decision?.status).toBe('committed');
    const executed = (await env.sdk.getEvents(result.runId)).find((event) => event.type === 'action.executed');
    expect(result.state.observations).toEqual([
      expect.objectContaining({ id: 'O1', sourceKind: 'tool', source: 'lookup_metric', sourceEventId: executed?.id, originGroup: 'tool:lookup_metric', context: 'U1: What is the current monthly churn?' }),
    ]);
    expect(result.state.facts.find((fact) => fact.source === 'tool')?.observationRefs).toEqual(['O1']);
  });

  it('keeps how much the thinker agreed and where the reasoning went wrong', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider);
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model', tools: [env.sdk.defineTool(lookupMetricDefinition)] });
    const result = await agent.think({ problem: 'Should we build or buy the analytics module?' });

    const profile = await agent.learnFromFeedback(result.runId, {
      verdict: 'partial',
      agreement: 0.5,
      expected: 'Try the open-source option before paying',
      wrongAbout: ['ignored the free option'],
    });

    expect(profile.corrections[0]).toMatchObject({ agreement: 0.5, wrongAbout: ['ignored the free option'] });
    const dataset = (await env.sdk.exportControllerDataset([result.runId])).split('\n').map((line) => JSON.parse(line));
    expect(dataset[0]).toMatchObject({ feedback: 'partial', agreement: 0.5 });
  });
});
