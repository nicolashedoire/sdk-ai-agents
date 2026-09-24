import { afterEach, describe, expect, it } from 'vitest';
import { cognitiveAgentTool, governedAgentTool } from '../tools/agent-tools.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, lookupMetricDefinition, scriptBuildOrBuy, type TestSDK } from './support/test-sdk.js';

const PROBLEM = 'Should we build or buy our analytics module?';

describe('agents as tools', () => {
  const environments: TestSDK[] = [];
  afterEach(async () => {
    for (const env of environments.splice(0)) await env.dispose();
  });

  function environment(provider = new ScriptedLLMProvider()): TestSDK {
    const env = createTestSDK({}, provider);
    environments.push(env);
    return env;
  }

  it('asks a cognitive agent through the governed pipeline and returns its decision, not its whole state', async () => {
    const env = environment();
    scriptBuildOrBuy(env.provider);
    const analyst = env.sdk.createCognitiveAgent({
      name: 'analyst',
      model: 'test-model',
      tools: [env.sdk.defineTool(lookupMetricDefinition)],
    });
    const tool = cognitiveAgentTool(analyst);
    env.sdk.defineTool(tool);

    const result = await env.sdk.executeTool('ask_analyst', { problem: PROBLEM, context: { budget: '10k EUR' } });

    expect(result).toEqual({
      runId: expect.stringMatching(/^run_/),
      status: 'completed',
      decisionStatus: 'committed',
      answer: 'Buy a SaaS analytics tool and run a two-week pilot.',
      rationale: 'Only option that ships before Q4 within budget.',
      confidence: 0.8,
      nextActions: ['Run a two-week pilot'],
    });
    // The reasoning is a run of its own, with the context it was given.
    const runId = typeof result === 'object' && result !== null ? Reflect.get(result, 'runId') : undefined;
    const events = await env.sdk.getEvents(String(runId));
    expect(events.find((event) => event.type === 'cognition.started')?.data).toMatchObject({
      goal: PROBLEM,
      context: { budget: '10k EUR' },
    });
  });

  it('refuses an empty problem before any reasoning', async () => {
    const env = environment();
    const agent = env.sdk.createCognitiveAgent({ name: 'Nicolas Hedoire', model: 'test-model' });
    const tool = cognitiveAgentTool(agent, { maxInputLength: 20 });
    env.sdk.defineTool(tool);

    expect(tool.name).toBe('ask_Nicolas_Hedoire');
    // The schema check happens in the pipeline, before the handler: the error wraps it.
    const invalid = { originalError: { name: 'ValidationError' } };
    await expect(env.sdk.executeTool(tool.name, { problem: '' })).rejects.toMatchObject(invalid);
    await expect(env.sdk.executeTool(tool.name, { problem: 'x'.repeat(21) })).rejects.toMatchObject(invalid);
    expect(env.provider.requests).toHaveLength(0);
  });

  it('cancels the reasoning when the caller gives up', async () => {
    const env = environment(scriptBuildOrBuy(new ScriptedLLMProvider({ delayMs: 30 })));
    const agent = env.sdk.createCognitiveAgent({ name: 'slow', model: 'test-model' });
    const tool = cognitiveAgentTool(agent);
    const caller = new AbortController();

    const pending = tool.handler({ problem: PROBLEM }, { runId: 'r', agentId: 'mcp:test', signal: caller.signal });
    setTimeout(() => caller.abort(), 10);

    await expect(pending).resolves.toMatchObject({ status: 'cancelled' });
    expect(env.provider.requests.length).toBeLessThan(3);
  });

  it('reports a failed reasoning with its reason', async () => {
    const env = environment(new ScriptedLLMProvider().always('represent', { error: new Error('model unavailable') }));
    const agent = env.sdk.createCognitiveAgent({ name: 'fragile', model: 'test-model', limits: { maxConsecutiveFailures: 1 } });

    const result = await cognitiveAgentTool(agent).handler({ problem: PROBLEM });

    expect(result).toMatchObject({ status: 'failed', error: expect.stringContaining('model unavailable') });
  });

  it('runs a governed agent on a message', async () => {
    const env = environment(new ScriptedLLMProvider().always('default', { content: 'Refunds take 5 days.' }));
    const support = env.sdk.createAgent({ name: 'support', model: 'test-model' });
    const tool = governedAgentTool(support, { description: 'Answers customer questions' });
    env.sdk.defineTool(tool);

    const result = await env.sdk.executeTool('ask_support', { message: 'How long do refunds take?' });

    expect(tool.description).toBe('Answers customer questions');
    expect(result).toEqual({ runId: expect.stringMatching(/^run_/), status: 'completed', output: 'Refunds take 5 days.' });
  });
});
