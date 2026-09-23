import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { rebuildMentalState } from '../cognition/mental-state-replay.js';
import { ReplayEngine } from '../engines/replay-engine.js';
import { ActionEngine } from '../engines/action-engine.js';
import { PolicyEngine } from '../engines/policy-engine.js';
import { ToolRegistry } from '../registry/tool-registry.js';
import type { Event } from '../types/events.js';
import { InMemoryDecisionClient, level, pick, yes } from './support/in-memory-decision-client.js';
import { json, ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, lookupMetricDefinition, scriptBuildOrBuy, type TestSDK } from './support/test-sdk.js';

const PROBLEM = 'Should we build or buy the analytics module?';

function selections(events: Event[]): string[] {
  return events.filter((event) => event.type === 'cognition.operation_selected').map((event) => String(event.data.operation));
}

describe('cognitive agent', () => {
  let env: TestSDK;
  afterEach(async () => { await env.dispose(); });

  it('runs the whole loop: represent → hypothesize → simulate → critique → seek → compare → decide', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider);
    const tool = env.sdk.defineTool(lookupMetricDefinition);
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model', tools: [tool] });

    const result = await agent.think({ problem: PROBLEM });

    expect(result.status).toBe('completed');
    expect(result.answer).toBe('Buy a SaaS analytics tool and run a two-week pilot.');
    expect(result.decision?.hypothesisId).toBe('H2');
    expect(result.state.hypotheses.map((hypothesis) => hypothesis.status)).toEqual(['critiqued', 'selected']);
    expect(result.state.unknowns[0]).toMatchObject({ status: 'resolved', attempts: 1 });

    const events = await env.sdk.getEvents(result.runId);
    expect(selections(events)).toEqual([
      'represent',
      'hypothesize',
      'simulate',
      'critique',
      'seek_information',
      'compare',
      'decide',
    ]);
    // The tool went through the governed pipeline.
    const types = events.map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(['policy.checked', 'tool.called', 'action.executed']));
    expect((await env.sdk.getTrace(result.runId)).status).toBe('completed');
  });

  it('rebuilds the exact mental state from the event log', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider);
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model', tools: [env.sdk.defineTool(lookupMetricDefinition)] });
    const result = await agent.think({ problem: PROBLEM, context: { team: 'data' } });

    const rebuilt = await env.sdk.getMentalState(result.runId);
    expect(rebuilt).toEqual(result.state);
    expect(rebuilt.context).toEqual({ team: 'data' });
    // Thought order comes from steps, not from the store's ordering.
    const shuffled = [...(await env.sdk.getEvents(result.runId))].reverse();
    expect(rebuildMentalState(shuffled)).toEqual(result.state);
  });

  it('stays replayable by the native replay engine', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider);
    const registry = new ToolRegistry();
    registry.registerTool(lookupMetricDefinition);
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model', tools: [env.sdk.defineTool(lookupMetricDefinition)] });
    const result = await agent.think({ problem: PROBLEM });

    const replay = new ReplayEngine(env.store, new ActionEngine(new PolicyEngine(), registry, env.store));
    const replayed = await replay.replay(result.runId);
    expect(replayed).toMatchObject({ status: 'completed', output: result.answer });
    expect(env.provider.requests.length).toBeGreaterThan(0);
  });

  it('records a blocked tool as a failure and keeps reasoning', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider);
    const agent = env.sdk.createCognitiveAgent({
      name: 'analyst',
      model: 'test-model',
      tools: [env.sdk.defineTool(lookupMetricDefinition)],
      policies: [
        {
          id: 'no-metrics',
          type: 'custom',
          scope: 'agent',
          enabled: true,
          rules: [
            {
              condition: { type: 'condition', conditions: [{ field: 'intention.toolName', operator: 'eq', value: 'lookup_metric' }] },
              action: 'deny',
              metadata: { validator: () => false, reason: 'metrics are confidential' },
            },
          ],
        },
      ],
    });

    const result = await agent.think({ problem: PROBLEM });

    expect(result.status).toBe('completed');
    expect(result.state.failures[0]?.description).toContain('blocked by policy no-metrics');
    const events = await env.sdk.getEvents(result.runId);
    expect(events.some((event) => event.type === 'policy.violated')).toBe(true);
    expect(events.some((event) => event.type === 'tool.called')).toBe(false);
    // The replay is blocked the same way and, like the run, goes on to the answer.
    expect(await env.sdk.replay(result.runId)).toMatchObject({ status: 'completed', output: result.answer });
  });

  it('never runs a tool the agent was not given, even if the model names it', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider).always('tool-selection', {
      toolCall: { name: 'delete_customer', arguments: { customerId: 'c-42' } },
    });
    let deleted = false;
    env.sdk.defineTool({
      name: 'delete_customer',
      description: 'Registered for another agent',
      schema: z.object({ customerId: z.string() }),
      handler: async () => {
        deleted = true;
        return 'deleted';
      },
    });
    const agent = env.sdk.createCognitiveAgent({
      name: 'analyst',
      model: 'test-model',
      tools: [env.sdk.defineTool(lookupMetricDefinition)],
    });

    const result = await agent.think({ problem: PROBLEM });

    expect(deleted).toBe(false);
    expect(result.status).toBe('completed');
    expect(result.state.failures[0]?.description).toBe(
      'blocked by policy allowed-tools: tool "delete_customer" is not available to this caller'
    );
    const events = await env.sdk.getEvents(result.runId);
    expect(events.some((event) => event.type === 'tool.called')).toBe(false);
    expect(events.find((event) => event.type === 'policy.violated')?.data.violatedPolicies).toEqual(['allowed-tools']);

    // Replaying the run must not execute what the run itself was denied.
    const replay = await env.sdk.replay(result.runId);
    expect(deleted).toBe(false);
    expect(replay).toMatchObject({ status: 'completed', output: result.answer });
  });

  it('prices a run whose very first thought failed, repairs and all', async () => {
    const provider = scriptBuildOrBuy(new ScriptedLLMProvider({ model: 'test-model-2026-09-01' }));
    provider.enqueue('represent', { content: 'not json' });
    provider.enqueue('represent:repair', { error: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });
    env = createTestSDK(
      { retry: false, pricing: { 'test-model': { inputPerMillion: 1_000_000, outputPerMillion: 0 } } },
      provider
    );
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model' });

    const result = await agent.think({ problem: PROBLEM });

    const [first] = (await env.sdk.getEvents(result.runId)).filter((event) => event.type === 'cognition.thought');
    expect(first?.data).toMatchObject({
      failed: true,
      requestedModel: 'test-model',
      usage: { calls: 1, promptTokens: 100 },
    });
    const cost = await env.sdk.getRunCost(result.runId);
    expect(cost).toMatchObject({ complete: true, unpricedModels: [] });
    expect(cost.lines[0]?.requestedModel).toBe('test-model');
  });

  it('prices failed attempts and finds prices by the requested model name', async () => {
    const provider = scriptBuildOrBuy(new ScriptedLLMProvider({ model: 'test-model-2026-09-01' }));
    provider.enqueue('simulate', { content: 'not json' });
    provider.enqueue('simulate:repair', { content: 'still not json' });
    env = createTestSDK({ pricing: { 'test-model': { inputPerMillion: 1_000_000, outputPerMillion: 0 } } }, provider);
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model' });

    const result = await agent.think({ problem: PROBLEM });

    const failedThought = (await env.sdk.getEvents(result.runId)).find(
      (event) => event.type === 'cognition.thought' && event.data.failed === true
    );
    expect(failedThought?.data).toMatchObject({ usage: { calls: 2, promptTokens: 200 }, model: 'test-model-2026-09-01' });
    const cost = await env.sdk.getRunCost(result.runId);
    const [line] = cost.lines;
    expect(line).toMatchObject({ model: 'test-model-2026-09-01', requestedModel: 'test-model', calls: provider.requests.length });
    expect(cost.complete).toBe(true);
    expect(cost.totalUsd).toBe(line?.inputTokens);
  });

  it('repairs an invalid reply, then survives an operation that keeps failing', async () => {
    const provider = scriptBuildOrBuy(new ScriptedLLMProvider());
    provider.enqueue('hypothesize', { content: 'I think we should build.' });
    provider.enqueue('hypothesize:repair', json({ summary: 'fixed', addHypotheses: [{ statement: 'Buy a SaaS analytics tool' }] }));
    provider.enqueue('simulate', { content: '{}' });
    provider.enqueue('simulate:repair', { content: 'still not json' });
    env = createTestSDK({}, provider);
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model' });

    const result = await agent.think({ problem: PROBLEM });

    expect(result.status).toBe('completed');
    expect(provider.channels()).toContain('hypothesize:repair');
    expect(result.state.failures[0]).toMatchObject({ operation: 'simulate' });
    const events = await env.sdk.getEvents(result.runId);
    expect(events.find((event) => event.type === 'cognition.operation_failed')?.data.operation).toBe('simulate');
  });

  it('fails cleanly after consecutive failures', async () => {
    const provider = new ScriptedLLMProvider().always('represent', { error: new Error('model unavailable') });
    env = createTestSDK({}, provider);
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model', limits: { maxConsecutiveFailures: 2 } });

    const result = await agent.think({ problem: PROBLEM });

    expect(result).toMatchObject({ status: 'failed', error: expect.objectContaining({ message: '2 consecutive operations failed' }) });
    expect((await env.sdk.getTrace(result.runId)).status).toBe('failed');
  });

  it('always decides on the last step', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider);
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model', limits: { maxSteps: 3 } });

    const result = await agent.think({ problem: PROBLEM });

    const events = await env.sdk.getEvents(result.runId);
    expect(selections(events)).toEqual(['represent', 'hypothesize', 'decide']);
    expect(events.filter((event) => event.type === 'cognition.operation_selected').at(-1)?.data.controller).toBe('engine');
    expect(result.status).toBe('completed');
  });

  it('times out and can be stopped', async () => {
    env = createTestSDK({}, scriptBuildOrBuy(new ScriptedLLMProvider({ delayMs: 40 })));
    const slow = env.sdk.createCognitiveAgent({ name: 'slow', model: 'test-model', limits: { timeoutMs: 20 } });
    const timedOut = await slow.think({ problem: PROBLEM });
    expect(timedOut.status).toBe('failed');
    expect(timedOut.error?.message).toBe('Timeout exceeded (20 ms)');

    const stoppable = env.sdk.createCognitiveAgent({ name: 'stoppable', model: 'test-model' });
    const pending = stoppable.think({ problem: PROBLEM });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await stoppable.stop();
    const stopped = await pending;
    expect(stopped.status).toBe('cancelled');
    expect((await env.sdk.getTrace(stopped.runId)).status).toBe('cancelled');
  });

  it('learns from feedback and uses the lesson in the next run', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider);
    const agent = env.sdk.createCognitiveAgent({
      name: 'nicolas',
      model: 'test-model',
      profile: { id: 'nicolas', name: 'Nicolas', reasoningSequence: [{ id: 'limits', instruction: 'Find the real limits first' }] },
    });
    const first = await agent.think({ problem: PROBLEM });

    const profile = await agent.learnFromFeedback(first.runId, {
      verdict: 'mismatch',
      expected: 'Prototype with a free open-source tool before paying',
      lesson: 'Always test a free option before a paid one',
    });
    expect(profile.version).toBe('1.0.1');
    expect((await env.sdk.getTrace(first.runId)).status).toBe('completed');

    env.provider.requests.length = 0;
    await agent.think({ problem: 'Should we pay for Jev or use a clone?' });
    const systemPrompt = env.provider.requests[0]?.messages[0]?.content ?? '';
    expect(systemPrompt).toContain('Lesson: Always test a free option before a paid one');

    const dataset = (await env.sdk.exportControllerDataset([first.runId])).split('\n').map((line) => JSON.parse(line));
    expect(dataset).toHaveLength(selections(await env.sdk.getEvents(first.runId)).length);
    expect(dataset[0]).toMatchObject({ step: 1, operation: 'represent', feedback: 'mismatch', runStatus: 'completed' });
  });
});

describe('cognitive agent with typed decisions', () => {
  let env: TestSDK;
  afterEach(async () => { await env.dispose(); });

  it('lets the decision model drive the loop and records every call', async () => {
    const order = ['critique', 'compare'];
    const client = new InMemoryDecisionClient((id, question) => {
      if (id === 'ready_to_decide') return yes(0.2);
      if (question.type === 'choice') {
        const next = order.find((operation) => operation in question.criteria) ?? 'decide';
        return pick(question, next);
      }
      return level(question, id.startsWith('evidence_H2') || id.startsWith('fit_H2') ? 4 : 1);
    });
    env = createTestSDK({ decisionClient: client, pricing: { 'memory-*': { inputPerMillion: 1, outputPerMillion: 0 } } });
    scriptBuildOrBuy(env.provider);
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model' });

    const result = await agent.think({ problem: PROBLEM });

    expect(result.status).toBe('completed');
    const events = await env.sdk.getEvents(result.runId);
    const chosen = events.filter((event) => event.type === 'cognition.operation_selected');
    // A single possible operation does not cost a model call.
    expect(chosen[1]?.data).toMatchObject({ operation: 'hypothesize', controller: 'memory', rationale: 'only available operation' });
    expect(chosen[2]?.data).toMatchObject({ operation: 'critique', controller: 'memory', confidence: expect.any(Number) });
    // Hypothesis comparison was scored by the decision model, combined in code.
    const h2 = result.state.hypotheses.find((hypothesis) => hypothesis.id === 'H2');
    expect(h2?.support).toBe(1);
    const assessments = events.filter((event) => event.data.purpose === 'hypothesis_assessment');
    expect(assessments).toHaveLength(1);

    const cost = await env.sdk.getRunCost(result.runId);
    const decisionLine = cost.lines.find((line) => line.source === 'decision');
    expect(decisionLine).toMatchObject({ model: 'memory-1', calls: client.requests.length, costUsd: (client.requests.length * 1000) / 1_000_000 });
    expect(cost.unpricedModels).toEqual(['test-model']);
    expect(cost.complete).toBe(false);
  });

  it('falls back to the heuristic controller on low confidence or client failure', async () => {
    const client = new InMemoryDecisionClient((id, question) =>
      id === 'ready_to_decide' ? yes(0.1) : question.type === 'choice' ? pick(question, 'simulate', 0.4) : level(question, 2)
    );
    env = createTestSDK({ decisionClient: client });
    scriptBuildOrBuy(env.provider);
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model', assessment: 'llm' });

    const lowConfidence = await agent.think({ problem: PROBLEM });
    const events = await env.sdk.getEvents(lowConfidence.runId);
    const deferred = events.find((event) => event.type === 'cognition.operation_selected' && event.data.fallbackFrom);
    expect(deferred?.data).toMatchObject({ controller: 'heuristic', fallbackFrom: { controller: 'memory' } });

    client.failWith = new Error('529 overloaded');
    const failing = await agent.think({ problem: PROBLEM });
    expect(failing.status).toBe('completed');
    const reasons = (await env.sdk.getEvents(failing.runId))
      .map((event) => event.data.fallbackFrom)
      .filter((value): value is { reason: string } => z.object({ reason: z.string() }).safeParse(value).success);
    expect(reasons[0]?.reason).toBe('decision client failed: 529 overloaded');
  });
});
