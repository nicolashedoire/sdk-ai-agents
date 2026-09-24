import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PolicyViolationError } from '../errors/index.js';
import type { SDK } from '../sdk.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

/** Settles with the promise's outcome, or 'still waiting' after `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | 'still waiting'> {
  return Promise.race([promise, new Promise<'still waiting'>((resolve) => setTimeout(() => resolve('still waiting'), ms))]);
}

/** Defines a tool marked `requiresApproval` and returns the journal of its real executions. */
function defineRefundTool(sdk: SDK): string[] {
  const executed: string[] = [];
  sdk.defineTool({
    name: 'refund',
    description: 'Refunds an order',
    schema: z.object({ orderId: z.string() }),
    metadata: { riskLevel: 'high', requiresApproval: true },
    handler: async ({ orderId }) => {
      executed.push(orderId);
      return { refunded: orderId };
    },
  });
  return executed;
}

async function pendingApproval(sdk: SDK): Promise<{ id: string; policyId: string; runId: string }> {
  for (const started = Date.now(); Date.now() - started < 5_000; ) {
    const [approval] = sdk.getPendingApprovals();
    if (approval) return approval;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('no approval was requested');
}

describe('tools marked requiresApproval', () => {
  let env: TestSDK;
  afterEach(async () => {
    await env.dispose();
  });

  it('wait for a human approval before running', async () => {
    env = createTestSDK();
    const executed = defineRefundTool(env.sdk);

    const call = env.sdk.executeTool('refund', { orderId: 'o-1' });
    const approval = await pendingApproval(env.sdk);
    expect(approval.policyId).toBe('tool-requires-approval');
    expect(executed).toEqual([]);

    env.sdk.approveAction(approval.id, 'alice', 'checked the order');
    await expect(call).resolves.toEqual({ refunded: 'o-1' });
    expect(executed).toEqual(['o-1']);
    const types = (await env.sdk.getEvents(approval.runId)).map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(['approval.requested', 'approval.approved', 'action.executed']));
  });

  it('never run when the approval is rejected', async () => {
    env = createTestSDK();
    const executed = defineRefundTool(env.sdk);

    const call = env.sdk.executeTool('refund', { orderId: 'o-2' });
    env.sdk.rejectAction((await pendingApproval(env.sdk)).id, 'alice', 'suspicious');

    await expect(call).rejects.toBeInstanceOf(PolicyViolationError);
    expect(executed).toEqual([]);
  });

  it('never run when the caller gives up while the approval is pending', async () => {
    env = createTestSDK();
    const executed = defineRefundTool(env.sdk);
    const caller = new AbortController();

    const call = env.sdk.executeTool('refund', { orderId: 'o-3' }, { signal: caller.signal });
    const approval = await pendingApproval(env.sdk);
    caller.abort();

    await expect(call).rejects.toThrow('Approval cancelled before a decision');
    expect(env.sdk.getPendingApprovals()).toEqual([]);
    expect(() => env.sdk.approveAction(approval.id, 'late-approver')).toThrow('already rejected');
    expect(executed).toEqual([]);
    const rejected = (await env.sdk.getEvents(approval.runId)).find((event) => event.type === 'approval.rejected');
    expect(rejected?.data).toMatchObject({ reason: 'cancelled before a decision' });
  });

  it('can also be required by a policy for chosen tools, leaving the others alone', async () => {
    env = createTestSDK();
    env.sdk.defineGlobalPolicy({
      id: 'approve-refunds',
      type: 'custom',
      scope: 'global',
      enabled: true,
      rules: [
        {
          condition: {
            type: 'condition',
            conditions: [{ field: 'intention.toolName', operator: 'in', value: ['refund_without_flag'] }],
          },
          action: 'require_approval',
        },
      ],
    });
    env.sdk.defineTool({ name: 'refund_without_flag', description: 'Refunds', schema: z.object({}), handler: async () => 'refunded' });
    env.sdk.defineTool({ name: 'ping', description: 'Ping', schema: z.object({}), handler: async () => 'pong' });

    await expect(env.sdk.executeTool('ping', {})).resolves.toBe('pong');
    const call = env.sdk.executeTool('refund_without_flag', {});
    const approval = await pendingApproval(env.sdk);
    expect(approval.policyId).toBe('approve-refunds');
    env.sdk.approveAction(approval.id, 'alice');
    await expect(call).resolves.toBe('refunded');
  });

  it('are cancelled when nobody decides within approvalTimeoutMs', async () => {
    env = createTestSDK();
    const executed = defineRefundTool(env.sdk);

    const call = env.sdk.executeTool('refund', { orderId: 'o-4' }, { approvalTimeoutMs: 300 });
    const approval = await pendingApproval(env.sdk);

    await expect(call).rejects.toThrow('Approval no decision within 300 ms');
    expect(() => env.sdk.approveAction(approval.id, 'late-approver')).toThrow('already rejected');
    expect(executed).toEqual([]);
  });

  it('never run when the caller gives up right after the approval', async () => {
    env = createTestSDK();
    const executed = defineRefundTool(env.sdk);
    const caller = new AbortController();

    const call = env.sdk.executeTool('refund', { orderId: 'o-5' }, { signal: caller.signal });
    env.sdk.approveAction((await pendingApproval(env.sdk)).id, 'alice');
    caller.abort();

    await expect(call).rejects.toMatchObject({ originalError: { message: 'the caller gave up before the tool ran' } });
    expect(executed).toEqual([]);
  });

  it('refuse invalid arguments before asking anyone', async () => {
    env = createTestSDK();
    const executed = defineRefundTool(env.sdk);

    const outcome = await within(env.sdk.executeTool('refund', { orderId: 42 }).catch((error: unknown) => error), 500);

    expect(outcome).toMatchObject({ originalError: { name: 'ValidationError' } });
    expect(env.sdk.getPendingApprovals()).toEqual([]);
    expect(executed).toEqual([]);
  });

  it('are not asked again when a run is replayed', async () => {
    const provider = new ScriptedLLMProvider()
      .enqueue('tool-selection', { toolCall: { name: 'refund', arguments: { orderId: 'o-6' } } })
      .always('tool-selection', { content: 'Refunded.' });
    env = createTestSDK({}, provider);
    const executed = defineRefundTool(env.sdk);
    const refund = env.sdk.listTools().filter((tool) => tool.name === 'refund');
    const agent = env.sdk.createAgent({ name: 'support', model: 'test-model', tools: refund, maxSteps: 3 });

    const run = agent.run({ message: 'Refund o-6' });
    env.sdk.approveAction((await pendingApproval(env.sdk)).id, 'alice');
    const original = await run;
    expect(original.status).toBe('completed');

    // What a human approved in the original run replays without asking again.
    const replayed = await within(env.sdk.replay(original.runId), 4_000);
    expect(replayed).toMatchObject({ status: 'completed' });
    expect(executed).toEqual(['o-6', 'o-6']);
  }, 15_000);

  it('replay only the very call that was approved (same tool, same parameters)', async () => {
    env = createTestSDK();
    const executed = defineRefundTool(env.sdk);
    // A recorded run where the approval found in the log is for another order than the call.
    const at = (index: number) => ({ id: `evt_${index}`, runId: 'run_recorded', timestamp: index, metadata: { agentId: 'support' } });
    await env.store.append('run_recorded', { ...at(1), type: 'run.started', data: { input: { message: 'Refund' } } });
    await env.store.append('run_recorded', {
      ...at(2),
      type: 'intention.generated',
      data: { toolCalls: [{ function: { name: 'refund', arguments: '{"orderId":"o-7"}' } }] },
    });
    await env.store.append('run_recorded', {
      ...at(3),
      type: 'approval.approved',
      data: { approvalId: 'a-1', policyId: 'tool-requires-approval', intention: { type: 'tool_call', toolName: 'refund', parameters: { orderId: 'o-8' } } },
    });

    const replayed = await within(env.sdk.replay('run_recorded'), 4_000);

    expect(replayed).toMatchObject({ status: 'failed' });
    expect(executed).toEqual([]);
  });

  it('never replay a call a human rejected', async () => {
    const provider = new ScriptedLLMProvider()
      .enqueue('tool-selection', { toolCall: { name: 'refund', arguments: { orderId: 'o-666' } } })
      .always('tool-selection', { content: 'Done.' });
    env = createTestSDK({}, provider);
    const executed = defineRefundTool(env.sdk);
    const refund = env.sdk.listTools().filter((tool) => tool.name === 'refund');
    const agent = env.sdk.createAgent({ name: 'support', model: 'test-model', tools: refund, maxSteps: 3 });

    const run = agent.run({ message: 'Refund o-666' });
    env.sdk.rejectAction((await pendingApproval(env.sdk)).id, 'alice', 'fraud');
    const original = await run;
    expect(original.status).toBe('failed');

    const replayed = await within(env.sdk.replay(original.runId), 4_000);
    expect(replayed).toMatchObject({ status: 'failed' });
    expect(executed).toEqual([]);
    expect(env.sdk.getPendingApprovals()).toEqual([]);
  }, 15_000);
});
