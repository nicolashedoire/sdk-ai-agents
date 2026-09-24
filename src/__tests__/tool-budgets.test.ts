import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PolicyViolationError } from '../errors/index.js';
import type { SDK } from '../sdk.js';
import type { ToolCallContext } from '../types/tool.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

function dailyCallBudget(sdk: SDK, agentId: string, maxToolCalls: number): void {
  sdk.defineGlobalPolicy({
    id: 'daily-calls',
    type: 'budget',
    scope: 'global',
    enabled: true,
    rules: [{ condition: 'budgetLimit', action: 'deny', metadata: { budgetLimit: { agentId, period: 'day', maxToolCalls } } }],
  });
}

describe('call budgets', () => {
  let env: TestSDK;
  afterEach(async () => {
    await env.dispose();
  });

  it('hold under concurrent calls: the check and the count are one step', async () => {
    env = createTestSDK();
    dailyCallBudget(env.sdk, 'mcp:shop', 2);
    let runs = 0;
    env.sdk.defineTool({
      name: 'slow_lookup',
      description: 'Takes a while',
      schema: z.object({}),
      handler: async () => {
        runs++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return 'ok';
      },
    });

    const outcomes = await Promise.allSettled(
      Array.from({ length: 10 }, () => env.sdk.executeTool('slow_lookup', {}, { agentId: 'mcp:shop' }))
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(2);
    const refusals = outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []));
    expect(refusals).toHaveLength(8);
    expect(refusals.every((reason) => reason instanceof PolicyViolationError && reason.policyId === 'daily-calls')).toBe(true);
    expect(runs).toBe(2);
  });

  it('count failed calls too: a call is counted when it starts', async () => {
    env = createTestSDK();
    dailyCallBudget(env.sdk, 'mcp:shop', 2);
    env.sdk.defineTool({
      name: 'flaky',
      description: 'Always fails',
      schema: z.object({}),
      handler: async () => {
        throw new Error('upstream down');
      },
    });

    await expect(env.sdk.executeTool('flaky', {}, { agentId: 'mcp:shop' })).rejects.toThrow('Tool execution failed');
    await expect(env.sdk.executeTool('flaky', {}, { agentId: 'mcp:shop' })).rejects.toThrow('Tool execution failed');
    await expect(env.sdk.executeTool('flaky', {}, { agentId: 'mcp:shop' })).rejects.toBeInstanceOf(PolicyViolationError);
    // Another identity has its own budget.
    await expect(env.sdk.executeTool('flaky', {}, { agentId: 'mcp:other' })).rejects.toThrow('Tool execution failed');
  });
});

describe('tool handlers', () => {
  let env: TestSDK;
  afterEach(async () => {
    await env.dispose();
  });

  it('receive the run and the caller of the call', async () => {
    env = createTestSDK();
    const contexts: Array<ToolCallContext | undefined> = [];
    env.sdk.defineTool({
      name: 'whoami',
      description: 'Echoes its context',
      schema: z.object({}),
      handler: async (_params, context) => {
        contexts.push(context);
        return 'ok';
      },
    });
    const caller = new AbortController();

    await env.sdk.executeTool('whoami', {}, { agentId: 'mcp:crm', signal: caller.signal });

    expect(contexts).toEqual([{ runId: expect.stringMatching(/^tool_/), agentId: 'mcp:crm', signal: caller.signal }]);
  });
});
