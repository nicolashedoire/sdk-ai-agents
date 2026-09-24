import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { KnowledgeEntry, KnowledgeFinding, KnowledgeItem } from '../cognition/knowledge-records.js';
import { InMemoryKnowledgeStore, type KnowledgeStore } from '../cognition/knowledge-store.js';
import { ValidationError } from '../errors/index.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { Event } from '../types/events.js';
import { InclinedPlaneBench, OBSERVATIONS, PROBLEM, scriptRuleDiscovery } from './support/inclined-plane.js';
import { json, type ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

const SCOPE = 'inclined-plane';
const FREE_RULE = 'Rolling time on this plane does not depend on the ball';
const RIGID_RULE = 'For rigid balls, rolling time on this plane does not depend on mass';

function finding(statement: string, runId: string, verdict: 'confirmed' | 'refuted', predictionId = 'P1'): KnowledgeFinding {
  return {
    statement,
    kind: 'rule',
    scope: 'balls on this plane',
    evidence: [
      { runId, predictionId, verdict, expected: 'about 1.07 s', observed: `${verdict} on the bench`, evaluatorId: 'bench', evaluatorVersion: '1' },
    ],
  };
}

function entry(runId: string, recordedAt: number, findings: KnowledgeFinding[]): KnowledgeEntry {
  return { scope: SCOPE, runId, recordedAt, findings };
}

/** A store that is down: every call fails. */
class UnavailableKnowledgeStore implements KnowledgeStore {
  async recall(): Promise<KnowledgeItem[]> {
    throw new Error('knowledge database unreachable');
  }
  async record(): Promise<void> {
    throw new Error('knowledge database unreachable');
  }
  async list(): Promise<KnowledgeItem[]> {
    throw new Error('knowledge database unreachable');
  }
}

/** A store that never answers. */
class SilentKnowledgeStore implements KnowledgeStore {
  recall(): Promise<KnowledgeItem[]> {
    return new Promise(() => undefined);
  }
  record(): Promise<void> {
    return new Promise(() => undefined);
  }
  list(): Promise<KnowledgeItem[]> {
    return new Promise(() => undefined);
  }
}

/** An event log that cannot write the knowledge event. */
class KnowledgeBlindEventStore extends FileEventStore {
  override async append(runId: string, event: Event): Promise<void> {
    if (event.type === 'cognition.knowledge_recorded') throw new Error('event store down');
    return super.append(runId, event);
  }
}

/** A second run on the same bench: it restates both rules the first run tested. */
function scriptSecondRun(provider: ScriptedLLMProvider): ScriptedLLMProvider {
  return provider
    .always('represent', json({ summary: 'A glass ball on the same plane', addFacts: [{ statement: 'The new ball is 250 g of glass', source: 'input' }] }))
    .always('hypothesize', json({
      summary: 'Reuse what the bench showed',
      addHypotheses: [
        { statement: FREE_RULE, kind: 'rule', scope: 'balls on this plane' },
        { statement: RIGID_RULE, kind: 'rule', scope: 'rigid balls on this plane' },
      ],
    }))
    .always('simulate', json({ summary: 'Same as steel', simulations: [{ hypothesisId: 'H1', steps: ['roll the glass ball'], outcome: 'about 1.07 s' }] }))
    .always('critique', json({
      summary: 'Glass is rigid',
      critiques: [{ hypothesisId: 'H1', objection: 'Glass could chip', severity: 'minor', rebuttal: 'It stays rigid' }],
      hypothesisUpdates: [{ hypothesisId: 'H1', support: 0.85 }],
    }))
    .always('compare', json({ summary: 'Backed by earlier tests', hypothesisUpdates: [{ hypothesisId: 'H1', support: 0.85, basisRefs: ['M2'] }] }))
    .always('decide', json({
      summary: 'Same time as steel',
      decision: { hypothesisId: 'H1', answer: 'About 1.07 s, like the steel balls.', rationale: 'M2 was confirmed on the bench.', confidence: 0.8 },
    }));
}

const SECOND_PROBLEM = 'Will a 250 g glass ball take the same time as the steel balls on our plane?';

describe('memory across runs', () => {
  const environments: TestSDK[] = [];
  afterEach(async () => {
    for (const env of environments.splice(0)) await env.dispose();
  });
  function environment(overrides: Parameters<typeof createTestSDK>[0] = {}): TestSDK {
    const env = createTestSDK(overrides);
    environments.push(env);
    return env;
  }

  it('records what the tests established, then reuses it in the next run', async () => {
    const store = new InMemoryKnowledgeStore();
    const knowledge = { store, scope: SCOPE };

    const first = environment();
    scriptRuleDiscovery(first.provider);
    const physicist = first.sdk.createCognitiveAgent({ name: 'physicist', model: 'test-model', evaluator: new InclinedPlaneBench(), knowledge });
    const run1 = await physicist.think({ problem: PROBLEM, observations: OBSERVATIONS });

    // Only what the bench answered is remembered: the refuted rule and its verified variant.
    const recorded = (await first.sdk.getEvents(run1.runId)).find((event) => event.type === 'cognition.knowledge_recorded');
    expect(recorded?.data).toMatchObject({ scope: SCOPE, findings: [{ statement: FREE_RULE }, { statement: RIGID_RULE }] });
    expect(await store.list(SCOPE)).toEqual([
      expect.objectContaining({ statement: FREE_RULE, status: 'refuted', refutations: 1, runIds: [run1.runId] }),
      expect.objectContaining({ statement: RIGID_RULE, status: 'verified', confirmations: 1, revises: FREE_RULE }),
    ]);

    const second = environment();
    scriptSecondRun(second.provider);
    const agent = second.sdk.createCognitiveAgent({ name: 'physicist', model: 'test-model', knowledge });
    const run2 = await agent.think({ problem: SECOND_PROBLEM });

    // The recalled knowledge is part of the run's record, shown to the model with its tests.
    expect(run2.state.knowledge.map((item) => [item.id, item.status, item.statement])).toEqual([
      ['M1', 'refuted', FREE_RULE],
      ['M2', 'verified', RIGID_RULE],
    ]);
    const hypothesizePrompt = second.provider.requests.find((request) => request.messages.some((message) => message.content?.includes('Operation: hypothesize')));
    const prompt = hypothesizePrompt?.messages.map((message) => message.content ?? '').join('\n') ?? '';
    expect(prompt).toContain('"knowledge"');
    expect(prompt).toContain('never propose a refuted one again as it was');

    // The refuted rule cannot come back as it was; the verified one rests on its earlier tests.
    const thoughts = (await second.sdk.getEvents(run2.runId)).filter((event) => event.type === 'cognition.thought');
    expect(thoughts.find((event) => event.data.operation === 'hypothesize')?.data.issues).toEqual([
      `"${FREE_RULE}" restates M1, refuted in earlier runs; propose a variant that cites M1 in premiseRefs and explains the refutation`,
    ]);
    expect(run2.state.hypotheses).toEqual([expect.objectContaining({ id: 'H1', statement: RIGID_RULE, premiseRefs: ['M2'] })]);
    expect(run2.decision).toMatchObject({ hypothesisId: 'H1', status: 'committed' });

    // A run that tested nothing records nothing, and its rebuild never reads the store.
    expect((await second.sdk.getEvents(run2.runId)).some((event) => event.type === 'cognition.knowledge_recorded')).toBe(false);
    expect(await store.list(SCOPE)).toHaveLength(2);
    expect(await second.sdk.getMentalState(run2.runId)).toEqual(run2.state);
  });

  it('keeps reasoning, and says why, when the knowledge store is down', async () => {
    const env = environment();
    scriptRuleDiscovery(env.provider);
    const agent = env.sdk.createCognitiveAgent({
      name: 'physicist',
      model: 'test-model',
      evaluator: new InclinedPlaneBench(),
      knowledge: { store: new UnavailableKnowledgeStore(), scope: SCOPE },
    });

    const result = await agent.think({ problem: PROBLEM, observations: OBSERVATIONS });

    expect(result.decision?.status).toBe('committed');
    const events = await env.sdk.getEvents(result.runId);
    expect(events.find((event) => event.type === 'cognition.started')?.data.knowledge).toEqual({
      scope: SCOPE,
      items: [],
      error: 'knowledge database unreachable',
    });
    expect(events.find((event) => event.type === 'cognition.knowledge_recorded')?.data).toMatchObject({
      scope: SCOPE,
      error: 'knowledge database unreachable',
    });
  });

  it('records the tests of a run that failed afterwards', async () => {
    const env = environment();
    const store = new InMemoryKnowledgeStore();
    scriptRuleDiscovery(env.provider).always('revise', { error: new Error('model down') });
    const agent = env.sdk.createCognitiveAgent({
      name: 'physicist',
      model: 'test-model',
      evaluator: new InclinedPlaneBench(),
      knowledge: { store, scope: SCOPE },
      limits: { maxConsecutiveFailures: 1 },
    });

    const result = await agent.think({ problem: PROBLEM, observations: OBSERVATIONS });

    expect(result.status).toBe('failed');
    const types = (await env.sdk.getEvents(result.runId)).map((event) => event.type);
    expect(types.indexOf('cognition.knowledge_recorded')).toBeGreaterThan(types.indexOf('run.failed'));
    expect(await store.list(SCOPE)).toEqual([expect.objectContaining({ statement: FREE_RULE, status: 'refuted' })]);
  });

  it('never loses the result of a run because its memory could not be written', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'blind-events-'));
    const eventStore = new KnowledgeBlindEventStore(directory);
    try {
      const env = environment({ eventStore });
      scriptRuleDiscovery(env.provider);
      const store = new InMemoryKnowledgeStore();
      const agent = env.sdk.createCognitiveAgent({ name: 'physicist', model: 'test-model', evaluator: new InclinedPlaneBench(), knowledge: { store, scope: SCOPE } });

      const result = await agent.think({ problem: PROBLEM, observations: OBSERVATIONS });

      expect(result).toMatchObject({ status: 'completed', decision: { status: 'committed' } });
      expect(await store.list(SCOPE)).toHaveLength(2);
    } finally {
      await eventStore.destroy();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not wait forever for a store that never answers', async () => {
    const env = environment();
    scriptRuleDiscovery(env.provider);
    const agent = env.sdk.createCognitiveAgent({
      name: 'physicist',
      model: 'test-model',
      evaluator: new InclinedPlaneBench(),
      knowledge: { store: new SilentKnowledgeStore(), scope: SCOPE },
      limits: { timeoutMs: 400 },
    });

    const result = await agent.think({ problem: PROBLEM, observations: OBSERVATIONS });

    expect(result.decision?.status).toBe('committed');
    const events = await env.sdk.getEvents(result.runId);
    expect(events.find((event) => event.type === 'cognition.started')?.data.knowledge).toMatchObject({
      error: 'the knowledge store did not recall within 400 ms',
    });
    expect(events.find((event) => event.type === 'cognition.knowledge_recorded')?.data).toMatchObject({
      error: 'the knowledge store did not record within 400 ms',
    });
  });

  it('can record without recalling, and refuses invalid settings', async () => {
    const env = environment();
    const store = new InMemoryKnowledgeStore();
    await store.record(entry('run-0', 0, [finding(FREE_RULE, 'run-0', 'refuted')]));
    scriptRuleDiscovery(env.provider);
    const agent = env.sdk.createCognitiveAgent({
      name: 'physicist',
      model: 'test-model',
      evaluator: new InclinedPlaneBench(),
      knowledge: { store, scope: SCOPE, recallLimit: 0 },
    });

    const result = await agent.think({ problem: PROBLEM, observations: OBSERVATIONS });

    expect(result.state.knowledge).toEqual([]);
    expect(await store.list(SCOPE)).toEqual([
      expect.objectContaining({ statement: FREE_RULE, refutations: 2 }),
      expect.objectContaining({ statement: RIGID_RULE, confirmations: 1 }),
    ]);
    expect(() => env.sdk.createCognitiveAgent({ name: 'a', model: 'm', knowledge: { store, scope: 'no spaces' } })).toThrow(ValidationError);
    expect(() => env.sdk.createCognitiveAgent({ name: 'a', model: 'm', knowledge: { store, scope: 'Acme' } })).toThrow(ValidationError);
    expect(() => env.sdk.createCognitiveAgent({ name: 'a', model: 'm', knowledge: { store, scope: SCOPE, recallLimit: 51 } })).toThrow(ValidationError);
  });
});
