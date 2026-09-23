import { afterEach, describe, expect, it } from 'vitest';
import { availableOperations } from '../cognition/cognitive-operations.js';
import { applyThought } from '../cognition/mental-state-reducer.js';
import { createMentalState, type MentalState } from '../cognition/mental-state.js';
import { observationFromInput, observationFromTool } from '../cognition/observation-records.js';
import { assembleThought } from '../cognition/patch-admission.js';
import { thoughtPatchSchema, type ThoughtPatchInput } from '../cognition/thought-patch.js';
import type { Event } from '../types/events.js';
import { InMemoryDecisionClient, level } from './support/in-memory-decision-client.js';
import { json } from './support/scripted-llm-provider.js';
import { createTestSDK, scriptBuildOrBuy, type TestSDK } from './support/test-sdk.js';

const context = { maxHypotheses: 3, canSeekInformation: false };

function think(state: MentalState, operation: string, patch: ThoughtPatchInput) {
  return applyThought(state, operation, thoughtPatchSchema.parse(patch));
}

function critiqued(): MentalState {
  let state = createMentalState('Build or buy?');
  state = think(state, 'represent', { summary: 'r', addFacts: [{ statement: 'Budget is 10k', source: 'input' }] }).state;
  state = think(state, 'hypothesize', { summary: 'h', addHypotheses: [{ statement: 'Build' }, { statement: 'Buy' }] }).state;
  return think(state, 'critique', {
    summary: 'c',
    critiques: [
      { hypothesisId: 'H1', objection: 'No team', severity: 'major' },
      { hypothesisId: 'H2', objection: 'Lock-in', severity: 'minor' },
    ],
    hypothesisUpdates: [
      { hypothesisId: 'H1', support: 0.3 },
      { hypothesisId: 'H2', support: 0.8 },
    ],
  }).state;
}

function eventsOf(events: Event[], type: string): Event[] {
  return events.filter((event) => event.type === type);
}

describe('failed attempts', () => {
  it('offer an operation again once the evidence changed', () => {
    let state = critiqued();
    for (let attempt = 0; attempt < 2; attempt++) {
      state = think(state, 'compare', { summary: 'failed', failed: true, addFailures: [{ description: 'timeout' }] }).state;
    }
    expect(availableOperations(state, context)).not.toContain('compare');
    // A successful step that changes nothing in the evidence does not unlock it.
    state = think(state, 'simulate', { summary: 's', simulations: [{ hypothesisId: 'H1', steps: ['hire'], outcome: 'late' }] }).state;
    expect(availableOperations(state, context)).not.toContain('compare');
    // New evidence does.
    state = think(state, 'represent', { summary: 'new fact', addFacts: [{ statement: 'A vendor raised prices', source: 'input' }] }).state;
    expect(availableOperations(state, context)).toContain('compare');
  });

  it('never lets a refused proposal take the place of a valid one', () => {
    const state = think(critiqued(), 'critique', { summary: 'x', hypothesisUpdates: [{ hypothesisId: 'H1', reject: true, reason: 'no team' }] }).state;
    const patch = thoughtPatchSchema.parse({
      summary: 'two ideas',
      addHypotheses: [{ statement: 'build.' }, { statement: 'Rent a managed warehouse' }, { statement: 'rent a managed warehouse!' }],
    });
    // Two hypotheses in play out of three: room for one.
    const thought = assembleThought({ operation: 'hypothesize', outcome: { proposal: { contract: 'hypothesize', patch } }, state, maxHypotheses: 2, forced: false });
    expect(thought.patch.addHypotheses.map((proposal) => proposal.statement)).toEqual(['Rent a managed warehouse']);
    expect(thought.issues).toEqual([
      '"build." restates rejected hypothesis H1; propose a variant instead',
      '"rent a managed warehouse!" is proposed twice',
    ]);
  });

  it('keep a corroborating source on a fact that is already known', () => {
    let state = createMentalState('Is churn high?', undefined, { observations: [observationFromInput({ content: 'Churn report: 4%' }, 1)] });
    state = think(state, 'represent', { summary: 'r', addFacts: [{ statement: 'Churn is 4%', source: 'input', observationRefs: ['O1'] }] }).state;
    const revision = state.evidenceRevision;
    const { state: next, issues } = think(state, 'seek_information', {
      summary: 'measured',
      observations: [observationFromTool({ toolName: 'billing', parameters: {}, result: '4%', observedAt: 2 })],
      addFacts: [{ statement: 'churn is 4 %', source: 'tool' }],
    });
    expect(issues).toEqual(['fact already known as F1: churn is 4 %']);
    expect(next.facts).toHaveLength(1);
    expect(next.facts[0]?.observationRefs).toEqual(['O1', 'O2']);
    expect(next.evidenceRevision).toBe(revision + 1);
  });
});

describe('attempts that unlock themselves', () => {
  function withTwoObservations(): MentalState {
    const state = createMentalState('Why do the times differ?', undefined, {
      observations: [observationFromInput({ content: 'Ball A: 1.07 s' }, 1), observationFromInput({ content: 'Ball B: 1.32 s' }, 1)],
    });
    return think(state, 'represent', { summary: 'r', addFacts: [{ statement: 'Two balls were timed', source: 'input' }] }).state;
  }
  const uselessComparison = (description: string): ThoughtPatchInput => ({
    summary: 'nothing comparable',
    comparisons: [{ left: ['O9'], right: ['O1'], relation: 'difference', aspect: 'time', rationale: 'r' }],
    addContradictions: [{ description, between: ['O1', 'O2'] }],
  });

  it('stay locked when the only new evidence came from the failing attempts', () => {
    let state = withTwoObservations();
    state = think(state, 'compare_observations', uselessComparison('Times disagree')).state;
    state = think(state, 'compare_observations', uselessComparison('Materials differ')).state;
    expect(state.evidenceRevision).toBe(3);
    expect(availableOperations(state, context)).not.toContain('compare_observations');
  });

  it('do not record the same model contradiction twice, nor count it as new evidence', () => {
    let state = think(withTwoObservations(), 'compare_observations', uselessComparison('Times disagree')).state;
    const revision = state.evidenceRevision;
    const repeated = think(state, 'represent', { summary: 'r', addContradictions: [{ description: 'times disagree!', between: ['O2', 'O1'] }] });
    expect(repeated.issues).toEqual(['contradiction already recorded as C1']);
    state = repeated.state;
    expect(state.contradictions).toHaveLength(1);
    expect(state.evidenceRevision).toBe(revision);
  });

  it('do not unlock each other when two operations keep failing', () => {
    let state = critiqued();
    const brokenSimulation = (index: number): ThoughtPatchInput => ({
      summary: 's',
      simulations: [{ hypothesisId: 'H9', steps: ['x'], outcome: 'y' }],
      addContradictions: [{ description: `Simulation doubt ${index}`, between: ['H1'] }],
    });
    const brokenCritique = (index: number): ThoughtPatchInput => ({
      summary: 'c',
      critiques: [{ hypothesisId: 'H9', objection: 'x', severity: 'minor' }],
      addContradictions: [{ description: `Critique doubt ${index}`, between: ['H2'] }],
    });
    state = think(state, 'simulate', brokenSimulation(1)).state;
    state = think(state, 'critique', brokenCritique(1)).state;
    state = think(state, 'simulate', brokenSimulation(2)).state;
    state = think(state, 'critique', brokenCritique(2)).state;
    expect(availableOperations(state, context)).not.toContain('simulate');
    expect(availableOperations(state, context)).not.toContain('critique');
  });

  it('stop seeking information when no tool can answer, until new evidence arrives', () => {
    let state = think(critiqued(), 'represent', { summary: 'r', addUnknowns: [{ question: 'What would buying cost?' }, { question: 'Which features?' }] }).state;
    const seeking = { maxHypotheses: 3, canSeekInformation: true };
    expect(availableOperations(state, seeking)).toContain('seek_information');
    for (const unknownId of ['U1', 'U2']) {
      const attempt = think(state, 'seek_information', {
        summary: `No tool can answer ${unknownId}`,
        investigatedUnknownId: unknownId,
        addFailures: [{ description: `No tool selected for ${unknownId}` }],
      });
      expect(attempt.noEffect).toBe('seek_information brought no observation and settled no unknown');
      state = attempt.state;
    }
    expect(availableOperations(state, seeking)).not.toContain('seek_information');
    state = think(state, 'represent', { summary: 'new fact', addFacts: [{ statement: 'A quote arrived: 8k EUR', source: 'input' }] }).state;
    expect(availableOperations(state, seeking)).toContain('seek_information');
  });

  it('are unlocked by a tool result the engine recorded, even in a failed step', () => {
    let state = critiqued();
    for (let attempt = 0; attempt < 2; attempt++) {
      state = think(state, 'compare', { summary: 'failed', failed: true, addFailures: [{ description: 'timeout' }] }).state;
    }
    state = think(state, 'seek_information', {
      summary: 'integration failed',
      failed: true,
      addFailures: [{ description: 'invalid reply' }],
      observations: [observationFromTool({ toolName: 'billing', parameters: {}, result: 'churn 4%', observedAt: 3 })],
    }).state;
    expect(availableOperations(state, context)).toContain('compare');
  });

  it('lock simulate after two steps that simulated nothing new, and count a rejection as a critique', () => {
    let state = critiqued();
    for (let attempt = 0; attempt < 2; attempt++) {
      state = think(state, 'simulate', { summary: 's', simulations: [{ hypothesisId: 'H9', steps: ['x'], outcome: 'y' }] }).state;
    }
    expect(availableOperations(state, context)).not.toContain('simulate');

    let fresh = createMentalState('goal');
    fresh = think(fresh, 'represent', { summary: 'r', addFacts: [{ statement: 'f', source: 'input' }] }).state;
    fresh = think(fresh, 'hypothesize', { summary: 'h', addHypotheses: [{ statement: 'A' }, { statement: 'B' }] }).state;
    const rejecting = think(fresh, 'critique', { summary: 'no', hypothesisUpdates: [{ hypothesisId: 'H1', reject: true, reason: 'illegal' }] });
    expect(rejecting.noEffect).toBeUndefined();
    expect(rejecting.state.trail.at(-1)?.failed).toBeUndefined();
  });

  it('treat an identical tool result read again as the same evidence', () => {
    const lookup = observationFromTool({ toolName: 'billing', parameters: { metric: 'churn' }, result: '4%', observedAt: 1 });
    let state = think(critiqued(), 'seek_information', { summary: 'read', observations: [lookup], addFacts: [{ statement: 'Churn is 4%', source: 'tool' }] }).state;
    state = think(state, 'compare', { summary: 'c', hypothesisUpdates: [{ hypothesisId: 'H1', support: 0.3 }, { hypothesisId: 'H2', support: 0.8 }] }).state;
    const revision = state.evidenceRevision;

    const again = think(state, 'seek_information', {
      summary: 'read again',
      observations: [{ ...lookup, observedAt: 2 }],
      addFacts: [{ statement: 'Churn is 4%', source: 'tool' }],
    }).state;
    expect(again.observations[1]?.duplicateOf).toBe('O1');
    expect(again.facts.find((fact) => fact.statement === 'Churn is 4%')?.observationRefs).toEqual(['O1']);
    expect(again.evidenceRevision).toBe(revision);
  });
});

describe('runs reach a conclusion', () => {
  let env: TestSDK;
  afterEach(async () => {
    await env.dispose();
  });

  it('does not abort because decisions were deferred after model failures', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider)
      .always('critique', json({
        summary: 'critiqued',
        critiques: [
          { hypothesisId: 'H1', objection: 'No team', severity: 'major' },
          { hypothesisId: 'H2', objection: 'Lock-in', severity: 'minor' },
        ],
        hypothesisUpdates: [{ hypothesisId: 'H1', support: 0.3 }, { hypothesisId: 'H2', support: 0.8 }],
      }))
      // Every comparison skips H1, even after repair: two model failures in a row.
      .always('compare', json({ summary: 'partial', hypothesisUpdates: [{ hypothesisId: 'H2', support: 0.8 }] }))
      .always('compare:repair', json({ summary: 'partial', hypothesisUpdates: [{ hypothesisId: 'H2', support: 0.8 }] }))
      // The model then insists on the weaker hypothesis: the engine defers.
      .always('decide', json({ summary: 'd', decision: { hypothesisId: 'H1', answer: 'Build it', rationale: 'control', confidence: 0.9 } }));
    const agent = env.sdk.createCognitiveAgent({ name: 'a', model: 'test-model', limits: { maxSteps: 9 } });

    const result = await agent.think({ problem: 'Build or buy?' });

    expect(result.status).toBe('completed');
    expect(result.decision).toMatchObject({ hypothesisId: 'H1', status: 'provisional' });
    const errors = eventsOf(await env.sdk.getEvents(result.runId), 'cognition.operation_failed').map((event) => String(event.data.error));
    expect(errors.filter((error) => error.includes('deferred'))).toHaveLength(2);
  });

  it('accepts a context the engine cannot clone', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider);
    const agent = env.sdk.createCognitiveAgent({ name: 'a', model: 'test-model' });

    const result = await agent.think({ problem: 'Build or buy?', context: { customer: { id: 'c-42', score: () => 3 } } });

    expect(result.status).toBe('completed');
  });

  it('records a step that changed nothing as a failed operation in the event log', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider).always('critique', json({ summary: 'wrong ids', critiques: [{ hypothesisId: 'H9', objection: 'x', severity: 'minor' }] }));
    const agent = env.sdk.createCognitiveAgent({ name: 'a', model: 'test-model', limits: { maxSteps: 6 } });

    const result = await agent.think({ problem: 'Build or buy?' });

    expect(result.status).toBe('completed');
    const events = await env.sdk.getEvents(result.runId);
    const critiques = eventsOf(events, 'cognition.thought').filter((event) => event.data.operation === 'critique');
    expect(critiques.map((event) => event.data.failed)).toEqual([true, true]);
    expect(eventsOf(events, 'cognition.operation_failed').map((event) => event.data.error)).toEqual([
      'critique examined no hypothesis that lacked a critique',
      'critique examined no hypothesis that lacked a critique',
    ]);
    // Trail and events agree.
    expect(result.state.trail.filter((entry) => entry.operation === 'critique').map((entry) => entry.failed)).toEqual([true, true]);
  });

  it('keeps the typed-decision calls made before an assessment failed', async () => {
    const client = new InMemoryDecisionClient((id, question) => {
      if (id.startsWith('fit_')) throw new Error('fit service down');
      return level(question, 3);
    });
    env = createTestSDK({ decisionClient: client });
    scriptBuildOrBuy(env.provider);
    const agent = env.sdk.createCognitiveAgent({ name: 'a', model: 'test-model', controller: 'heuristic', assessment: 'typed', limits: { maxSteps: 7 } });

    const result = await agent.think({ problem: 'Build or buy?' });

    const events = await env.sdk.getEvents(result.runId);
    expect(eventsOf(events, 'decision.evaluated').map((event) => event.data.purpose)).toEqual(['hypothesis_assessment']);
    expect(eventsOf(events, 'cognition.operation_failed')[0]?.data).toMatchObject({
      operation: 'compare',
      error: 'fit request failed: fit service down',
      recovery: 'falling back to the LLM comparison',
    });
    const cost = await env.sdk.getRunCost(result.runId);
    expect(cost.lines.find((line) => line.source === 'decision')).toMatchObject({ calls: 1 });
  });
});
