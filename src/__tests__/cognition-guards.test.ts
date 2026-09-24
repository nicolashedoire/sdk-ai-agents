import { inspect } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { CognitiveController } from '../cognition/cognitive-controller.js';
import { JevClient } from '../decisions/jev-client.js';
import { choice, parseAnswers } from '../decisions/typed-decisions.js';
import { ValidationError } from '../errors/index.js';
import type { Event } from '../types/events.js';
import { InMemoryDecisionClient, pick } from './support/in-memory-decision-client.js';
import { json, ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, scriptBuildOrBuy, type TestSDK } from './support/test-sdk.js';

const PROBLEM = 'Should we build or buy the analytics module?';

const selections = (events: Event[]) =>
  events.filter((event) => event.type === 'cognition.operation_selected').map((event) => event.data);

describe('cognitive guards', () => {
  let env: TestSDK;
  afterEach(async () => {
    await env.dispose();
  });

  it('keeps at most maxHypotheses in play, whatever the model proposes', async () => {
    const provider = scriptBuildOrBuy(new ScriptedLLMProvider()).always(
      'hypothesize',
      json({
        summary: 'Too many ideas',
        addHypotheses: ['A', 'B', 'C', 'D', 'E'].map((statement) => ({ statement })),
      })
    );
    env = createTestSDK({}, provider);
    const agent = env.sdk.createCognitiveAgent({ name: 'a', model: 'm', limits: { maxHypotheses: 2 } });

    const result = await agent.think({ problem: PROBLEM });

    expect(result.state.hypotheses.map((hypothesis) => hypothesis.statement).slice(0, 2)).toEqual(['A', 'B']);
    expect(result.state.hypotheses.filter((hypothesis) => hypothesis.status !== 'rejected').length).toBeLessThanOrEqual(2);
    const thought = (await env.sdk.getEvents(result.runId)).find(
      (event) => event.type === 'cognition.thought' && event.data.operation === 'hypothesize'
    );
    expect(thought?.data.issues).toContain('3 hypothesis proposal(s) dropped: at most 2 in play');
  });

  it('does not count a failed representation as done', async () => {
    const provider = scriptBuildOrBuy(new ScriptedLLMProvider());
    provider.enqueue('represent', { error: new Error('model unavailable') });
    env = createTestSDK({}, provider);
    const agent = env.sdk.createCognitiveAgent({ name: 'a', model: 'm' });

    const result = await agent.think({ problem: PROBLEM });

    const chosen = selections(await env.sdk.getEvents(result.runId));
    expect(chosen.slice(0, 2).map((selection) => selection.operation)).toEqual(['represent', 'represent']);
    expect(result.state.trail[0]).toMatchObject({ operation: 'represent', failed: true });
    expect(result.status).toBe('completed');
  });

  it('falls back to the heuristic when a custom controller throws', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider);
    const broken: CognitiveController = {
      name: 'broken',
      selectNext: async () => {
        throw new Error('model file missing');
      },
    };
    const agent = env.sdk.createCognitiveAgent({ name: 'a', model: 'm', controller: broken });

    const result = await agent.think({ problem: PROBLEM });

    expect(result.status).toBe('completed');
    const fallback = selections(await env.sdk.getEvents(result.runId)).find((selection) => selection.fallbackFrom);
    expect(fallback).toMatchObject({
      controller: 'heuristic',
      fallbackFrom: { controller: 'broken', reason: 'controller failed: model file missing' },
    });
  });

  it('lets sdk.stopRun stop a cognitive run', async () => {
    env = createTestSDK({}, scriptBuildOrBuy(new ScriptedLLMProvider({ delayMs: 30 })));
    const agent = env.sdk.createCognitiveAgent({ name: 'a', model: 'm' });

    const pending = agent.think({ problem: PROBLEM });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const [runId] = await env.store.getRunIds();
    expect(runId).toBeDefined();
    await env.sdk.stopRun(runId ?? '');

    expect((await pending).status).toBe('cancelled');
  });

  it('rejects limits that would disable a safeguard', () => {
    env = createTestSDK();
    expect(() => env.sdk.createCognitiveAgent({ name: 'a', model: 'm', limits: { maxSteps: 0 } })).toThrow(ValidationError);
    expect(() => env.sdk.createCognitiveAgent({ name: 'a', model: 'm', limits: { timeoutMs: 3_000_000_000 } })).toThrow(
      ValidationError
    );
    // A proposal floor above the decision threshold would make preferences a handicap.
    expect(() => env.sdk.createCognitiveAgent({ name: 'a', model: 'm', limits: { minProposalSupport: 0.8 } })).toThrow(
      'limits.minProposalSupport'
    );
    // Lowering only the threshold lowers the default floor with it.
    expect(() => env.sdk.createCognitiveAgent({ name: 'a', model: 'm', limits: { decisionThreshold: 0.3 } })).not.toThrow();
  });

  it('snapshots the profile for the whole run', async () => {
    env = createTestSDK({}, scriptBuildOrBuy(new ScriptedLLMProvider({ delayMs: 5 })));
    const agent = env.sdk.createCognitiveAgent({ name: 'a', model: 'm', profile: { id: 'p', name: 'First' } });

    const pending = agent.think({ problem: PROBLEM });
    await new Promise((resolve) => setTimeout(resolve, 8));
    agent.setProfile({ id: 'p2', name: 'Second' });
    const result = await pending;

    const events = await env.sdk.getEvents(result.runId);
    expect(new Set(events.map((event) => event.metadata?.profileId))).toEqual(new Set(['p']));
    const prompts = env.provider.requests.map((request) => request.messages[0]?.content ?? '');
    expect(prompts.every((prompt) => prompt.includes('Thinker: First'))).toBe(true);
  });
});

describe('typed decision contract', () => {
  it('types choice answers with the offered options', async () => {
    const client = new InMemoryDecisionClient((_, question) => pick(question, 'billing'));
    const response = await client.evaluate({
      state: 'ticket',
      questions: { team: choice('Which team?', { billing: null, technical: null }) },
    });
    const team: 'billing' | 'technical' = response.answers.team.choice;
    expect(team).toBe('billing');
  });

  it('rejects inherited property names as options', () => {
    const questions = { team: choice('Which team?', { billing: null, technical: null }) };
    expect(() =>
      parseAnswers(questions, {
        team: { type: 'choice', choice: 'constructor', probabilities: { billing: 0.5 }, confidence: 0.5 },
      })
    ).toThrow('"constructor" is not one of the options');
  });

  it('never exposes the API key when the client is inspected', () => {
    const client = new JevClient({ apiKey: 'ts-secret-key' });
    expect(inspect(client, { depth: 5 })).not.toContain('ts-secret-key');
    expect(JSON.stringify(client)).not.toContain('ts-secret-key');
  });
});
