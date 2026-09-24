import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PolicyViolationError } from '../errors/index.js';
import type { SDK } from '../sdk.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

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
  for (let attempt = 0; attempt < 100; attempt++) {
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
});
