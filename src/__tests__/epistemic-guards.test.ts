import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { availableOperations } from '../cognition/cognitive-operations.js';
import { assessReadiness } from '../cognition/decision-readiness.js';
import { LLMThoughtGenerator } from '../cognition/llm-thought-generator.js';
import { buildControllerDataset, rebuildMentalState } from '../cognition/mental-state-replay.js';
import { applyThought } from '../cognition/mental-state-reducer.js';
import { createMentalState, type MentalState } from '../cognition/mental-state.js';
import { observationFromInput } from '../cognition/observation-records.js';
import { admitProposal, assembleThought } from '../cognition/patch-admission.js';
import { DEFAULT_THINKER_PROFILE } from '../cognition/thinker-profile.js';
import { thoughtPatchSchema, type ThoughtPatchInput } from '../cognition/thought-patch.js';
import type { Event } from '../types/events.js';
import { json, ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, scriptBuildOrBuy, type TestSDK } from './support/test-sdk.js';

const context = { maxHypotheses: 3, canSeekInformation: false };

function think(state: MentalState, operation: string, patch: ThoughtPatchInput) {
  return applyThought(state, operation, thoughtPatchSchema.parse(patch));
}

/** Two critiqued proposals, both assessed: H1 at 0.3, H2 at 0.8. */
function examined(): MentalState {
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

describe('legacy runs', () => {
  const isObject = (value: unknown) => typeof value === 'object' && value !== null;
  const fixture = z
    .object({
      runs: z.record(
        z.object({
          events: z.array(z.custom<Event>((value) => isObject(value) && 'type' in value && 'runId' in value)),
          state: z.custom<MentalState>((value) => isObject(value) && 'goal' in value && 'trail' in value),
        })
      ),
    })
    .parse(JSON.parse(readFileSync(new URL('./fixtures/v1-cognitive-runs.json', import.meta.url), 'utf8')));

  it.each(Object.entries(fixture.runs))('rebuilds the %s run recorded before schemaVersion exactly as it was', (_name, run) => {
    const rebuilt = rebuildMentalState(run.events);
    expect(rebuilt.schemaVersion).toBe(1);
    // Every field the old version produced is identical; new collections are only added.
    expect(rebuilt).toMatchObject(run.state);
    expect(rebuilt.observations).toEqual([]);
    expect(buildControllerDataset('legacy', run.events).length).toBeGreaterThan(0);
  });

  it('keeps the old rule for a decision on a rejected hypothesis', () => {
    const run = fixture.runs.rejectedDecision;
    if (!run) throw new Error('fixture missing');
    const rebuilt = rebuildMentalState(run.events);
    expect(rebuilt.decision).toMatchObject({ answer: 'Build it', confidence: 0.7 });
    expect(rebuilt.decision?.hypothesisId).toBeUndefined();
    expect(rebuilt.decision?.status).toBeUndefined();
  });
});

describe('patch admission', () => {
  it('strips engine-only data and fields the operation may not write', () => {
    const forged = thoughtPatchSchema.parse({
      summary: 'forged',
      addFacts: [{ statement: 'Churn is 4%', source: 'tool' }],
      observations: [observationFromInput({ content: 'made up' }, 1)],
      evaluations: [{ predictionId: 'P1', verdict: 'confirmed', evaluatorId: 'me', evaluatorVersion: '1' }],
      investigatedUnknownId: 'U1',
      failed: true,
      addFailures: [{ description: 'x' }],
      confidence: 1,
      decision: { answer: 'a', rationale: 'r', confidence: 1, status: 'committed', missing: [] },
    });
    const represented = admitProposal({ contract: 'represent', patch: forged });
    expect(represented).toMatchObject({ ok: true });
    if (!represented.ok) return;
    expect(represented.patch).toMatchObject({ observations: [], evaluations: [], addFailures: [], addFacts: [{ statement: 'Churn is 4%' }] });
    expect(represented.patch.failed).toBeUndefined();
    expect(represented.patch.decision).toBeUndefined();
    expect([...represented.ignoredFields].sort()).toEqual(['addFailures', 'confidence', 'decision', 'evaluations', 'failed', 'investigatedUnknownId', 'observations']);

    const decided = admitProposal({ contract: 'decide', patch: forged });
    expect(decided.ok && decided.patch.decision).toEqual({ answer: 'a', rationale: 'r', confidence: 1, nextActions: [] });
    expect(decided.ok && decided.ignoredFields).toContain('decision.status');
  });

  it('turns an invalid proposal into a readable failure instead of crashing the run', () => {
    const patch = { ...thoughtPatchSchema.parse({ summary: 'bad' }), hypothesisUpdates: [{ hypothesisId: 'H2', support: 5, basisRefs: [] }] };
    const thought = assembleThought({ operation: 'compare', outcome: { proposal: { contract: 'compare', patch } }, state: examined(), maxHypotheses: 3, forced: false });
    expect(thought).toMatchObject({ failed: true, failureMessage: 'invalid thought: hypothesisUpdates.0.support: Number must be less than or equal to 1' });
  });

  it('refuses a comparison that skips a hypothesis in play', () => {
    const patch = thoughtPatchSchema.parse({ summary: 'partial', hypothesisUpdates: [{ hypothesisId: 'H2', support: 0.9 }] });
    const thought = assembleThought({ operation: 'compare', outcome: { proposal: { contract: 'compare', patch } }, state: examined(), maxHypotheses: 3, forced: false });
    expect(thought).toMatchObject({ failed: true, failureMessage: 'the comparison did not reassess H1' });
  });

  it('counts a deferred decision as a failed attempt, and abstains when a forced one cannot be produced', () => {
    const state = examined();
    const unready = thoughtPatchSchema.parse({ summary: 'd', decision: { hypothesisId: 'H1', answer: 'Build', rationale: 'r', confidence: 0.9 } });
    const deferred = assembleThought({ operation: 'decide', outcome: { proposal: { contract: 'decide', patch: unready } }, state, maxHypotheses: 3, forced: false });
    expect(deferred).toMatchObject({ failed: true, failureMessage: expect.stringContaining('decision on H1 deferred') });

    const broken = assembleThought({ operation: 'decide', outcome: { failure: new Error('model down') }, state, maxHypotheses: 3, forced: true });
    expect(broken.failed).toBe(false);
    expect(broken.patch.decision).toMatchObject({ status: 'abstain', confidence: 0, answer: 'No answer can be committed yet: the decision could not be produced (model down).' });
    expect(broken.patch.addFailures).toEqual([{ description: 'model down' }]);
  });
});

describe('the loop does not waste its budget', () => {
  it('stops offering an operation that keeps failing or being refused', () => {
    let state = examined();
    expect(availableOperations(state, context)).toContain('compare');
    for (let attempt = 0; attempt < 2; attempt++) {
      state = think(state, 'compare', { summary: 'failed', failed: true, addFailures: [{ description: 'timeout' }] }).state;
    }
    expect(availableOperations(state, context)).not.toContain('compare');

    // Proposals that are all refused (a restated rejected idea) count as a failed attempt.
    state = think(state, 'critique', { summary: 'x', hypothesisUpdates: [{ hypothesisId: 'H1', reject: true, reason: 'no team' }] }).state;
    const refused = think(state, 'hypothesize', { summary: 'again', addHypotheses: [{ statement: 'build' }] });
    expect(refused.issues).toContain('hypothesize added no hypothesis');
    expect(refused.state.trail.at(-1)?.failed).toBe(true);
    state = think(refused.state, 'hypothesize', { summary: 'again', addHypotheses: [{ statement: 'BUILD!' }] }).state;
    expect(availableOperations(state, context)).not.toContain('hypothesize');
  });

  it('keeps a hypothesis stale when a comparison did not reassess it', () => {
    let state = examined();
    state = think(state, 'compare', { summary: 'both', hypothesisUpdates: [{ hypothesisId: 'H1', support: 0.3 }, { hypothesisId: 'H2', support: 0.8 }] }).state;
    state = think(state, 'seek_information', {
      summary: 'incident',
      observations: [observationFromInput({ content: 'The SaaS vendor had a week-long outage' }, 1)],
    }).state;
    state = think(state, 'compare', { summary: 'only H1', hypothesisUpdates: [{ hypothesisId: 'H1', support: 0.35 }] }).state;
    expect(assessReadiness(state, 'H2').blockers).toEqual([{ kind: 'stale_assessment', hypothesisId: 'H2' }]);
    expect(availableOperations(state, context)).toContain('compare');
  });

  it('asks the model to repair a comparison that skips a hypothesis', async () => {
    const provider = new ScriptedLLMProvider()
      .enqueue('compare', json({ summary: 'partial', hypothesisUpdates: [{ hypothesisId: 'H2', support: 0.8 }] }))
      .enqueue('compare:repair', json({ summary: 'complete', hypothesisUpdates: [{ hypothesisId: 'H1', support: 0.3 }, { hypothesisId: 'H2', support: 0.8 }] }));
    const generated = await new LLMThoughtGenerator(provider, { model: 'm' }).generate({ operation: 'compare', state: examined(), profile: DEFAULT_THINKER_PROFILE });
    expect(generated.patch.hypothesisUpdates.map((update) => update.hypothesisId)).toEqual(['H1', 'H2']);
    expect(provider.requests[1]?.messages.at(-1)?.content).toContain('missing: H1');
  });
});

describe('contradiction resolutions', () => {
  it('require observations or facts, and happen once', () => {
    let state = think(examined(), 'represent', {
      summary: 'conflict',
      addUnknowns: [{ question: 'Is the budget firm?' }],
      addContradictions: [{ description: 'Budget vs scope', between: ['F1', 'H2'] }],
    }).state;
    const byQuestion = think(state, 'represent', { summary: 'r', resolveContradictions: [{ contradictionId: 'C1', resolution: 'maybe', basisRefs: ['U1', 'H2'] }] });
    expect(byQuestion.issues).toEqual([
      'resolution of C1 cites U1, which is not an observation or a fact',
      'resolution of C1 cites H2, which is not an observation or a fact',
      'cannot resolve contradiction C1: cite the observations or facts that resolve it',
    ]);
    state = think(state, 'represent', { summary: 'r', resolveContradictions: [{ contradictionId: 'C1', resolution: 'Budget raised', action: 'replaced', basisRefs: ['F1'] }] }).state;
    const again = think(state, 'represent', { summary: 'r', resolveContradictions: [{ contradictionId: 'C1', resolution: 'other story', basisRefs: ['F1'] }] });
    expect(again.issues).toEqual(['contradiction C1 is already resolved']);
    expect(again.state.contradictions[0]).toMatchObject({ resolution: 'Budget raised', resolutionAction: 'replaced' });
  });
});

describe('cognitive agent guards', () => {
  let env: TestSDK;
  afterEach(async () => {
    await env.dispose();
  });

  it('defers a decision that selects no hypothesis, then abstains without confidence', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider).always('decide', json({ summary: 'vague', decision: { answer: 'Buy it', rationale: 'cheaper', confidence: 0.9 } }));
    const agent = env.sdk.createCognitiveAgent({ name: 'a', model: 'test-model', limits: { maxSteps: 7 } });

    const result = await agent.think({ problem: 'Build or buy?' });

    expect(result.status).toBe('completed');
    expect(result.decision).toMatchObject({ status: 'abstain', confidence: 0, missing: ['no hypothesis was selected (H2 could be)'] });
    const failures = (await env.sdk.getEvents(result.runId)).filter((event) => event.type === 'cognition.operation_failed');
    expect(failures.map((event) => event.data.error)).toEqual(['decision deferred: it selects no hypothesis (H2 is ready to commit)']);
  });

  it('abstains instead of failing when the forced decision cannot be produced', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider).always('decide', { error: new Error('model down') });
    const agent = env.sdk.createCognitiveAgent({ name: 'a', model: 'test-model', limits: { maxSteps: 3 } });

    const result = await agent.think({ problem: 'Build or buy?' });

    expect(result.status).toBe('completed');
    expect(result.decision).toMatchObject({ status: 'abstain', confidence: 0 });
    expect(result.decision?.missing).toContain('H1 has not been critiqued');
    expect(result.state.failures.map((failure) => failure.description)).toEqual(['model down']);
  });

  it('survives a custom assessor that returns an invalid thought', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider);
    const agent = env.sdk.createCognitiveAgent({
      name: 'a',
      model: 'test-model',
      limits: { maxSteps: 7 },
      assessment: {
        name: 'broken',
        assess: async () => ({
          patch: { ...thoughtPatchSchema.parse({ summary: 'x' }), hypothesisUpdates: [{ hypothesisId: 'H2', support: 5, basisRefs: [] }] },
          evaluations: [],
        }),
      },
    });

    const result = await agent.think({ problem: 'Build or buy?' });

    expect(result.status).toBe('completed');
    expect(result.decision?.status).toBe('provisional');
    const errors = (await env.sdk.getEvents(result.runId)).filter((event) => event.type === 'cognition.operation_failed').map((event) => event.data.error);
    expect(errors).toEqual([expect.stringContaining('invalid thought: hypothesisUpdates.0.support'), expect.stringContaining('invalid thought')]);
  });

  it('never lets a custom generator write provenance or a decision status', async () => {
    env = createTestSDK();
    const agent = env.sdk.createCognitiveAgent({
      name: 'a',
      model: 'test-model',
      limits: { maxSteps: 2 },
      generator: {
        generate: async (request) => ({
          ignoredFields: [],
          patch: thoughtPatchSchema.parse({
            summary: request.operation,
            addFacts: [{ statement: 'Budget is 10k', source: 'input' }],
            observations: [observationFromInput({ content: 'invented measurement' }, 1)],
            decision: { answer: 'Buy', rationale: 'r', confidence: 1, status: 'committed', missing: [] },
          }),
        }),
      },
    });

    const result = await agent.think({ problem: 'Build or buy?' });

    expect(result.state.observations).toEqual([]);
    expect(result.decision).toMatchObject({ status: 'abstain', confidence: 0 });
    const thought = (await env.sdk.getEvents(result.runId)).find((event) => event.type === 'cognition.thought');
    expect(thought?.data.ignoredFields).toEqual(['observations', 'decision']);
  });
});
