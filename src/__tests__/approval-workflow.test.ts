import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { LLMProvider, LLMRequest, LLMResponse } from '../providers/llm-provider.js';
import type { SDK } from '../sdk.js';
import type { Policy } from '../types/policy.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

/**
 * LLM stand-in: asks for the critical tool once, then answers once it sees the tool result
 * (the agent feeds the result back as "Previous tool result: ...").
 */
class ToolThenAnswerProvider implements LLMProvider {
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    const last = request.messages.at(-1)?.content ?? '';
    if (last.startsWith('Previous tool result')) {
      return { content: 'Critical action done.', model: request.model };
    }
    return {
      content: null,
      toolCalls: [{ function: { name: 'critical-tool', arguments: '{}' } }],
      model: request.model,
    };
  }

  supportsModel(): boolean {
    return true;
  }

  getProviderName(): string {
    return 'test';
  }
}

function approvalPolicy(id: string): Policy {
  return {
    id,
    type: 'allowlist',
    scope: 'agent',
    enabled: true,
    rules: [
      {
        condition: 'allowedTools',
        action: 'require_approval',
        metadata: { tools: ['critical-tool'] },
      },
    ],
  };
}

/** Starts a run that stops on an approval request and returns once the request exists. */
async function startRunNeedingApproval(sdk: SDK, policyId: string) {
  const criticalTool = sdk.defineTool({
    name: 'critical-tool',
    description: 'A critical tool that requires approval',
    schema: z.object({}),
    handler: async () => ({ result: 'critical action executed' }),
  });
  const agent = sdk.createAgent({
    name: 'test-agent',
    model: 'gpt-4',
    tools: [criticalTool],
    policies: [approvalPolicy(policyId)],
    // One step for the tool call, one for the final answer.
    maxSteps: 2,
  });
  const runPromise = agent.run({ message: 'Use critical-tool' });

  for (let attempt = 0; attempt < 100 && sdk.getPendingApprovals().length === 0; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const [approval] = sdk.getPendingApprovals();
  if (!approval) {
    throw new Error('the run did not request an approval');
  }
  return { runPromise, approval };
}

describe('Approval Workflow', () => {
  let env: TestSDK;
  afterEach(async () => {
    await env.dispose();
  });

  const setup = () => {
    env = createTestSDK({ llmProvider: new ToolThenAnswerProvider() });
    return env.sdk;
  };

  describe('ApprovalManager Integration', () => {
    it('should request approval when policy requires it', async () => {
      const sdk = setup();
      const { runPromise, approval } = await startRunNeedingApproval(sdk, 'approval-policy-1');

      expect(approval.policyId).toBe('approval-policy-1');

      sdk.approveAction(approval.id, 'test-user', 'Approved for testing');
      const result = await runPromise;
      expect(result.status).toBe('completed');
    });

    it('should reject action when approval is rejected', async () => {
      const sdk = setup();
      const { runPromise, approval } = await startRunNeedingApproval(sdk, 'approval-policy-2');

      sdk.rejectAction(approval.id, 'test-user', 'Rejected for testing');

      const result = await runPromise;
      expect(result.status).toBe('failed');
    });

    it('should get pending approvals for a specific run', async () => {
      const sdk = setup();
      const { runPromise, approval } = await startRunNeedingApproval(sdk, 'approval-policy-3');

      const runApprovals = sdk.getPendingApprovals(approval.runId);
      expect(runApprovals.length).toBeGreaterThan(0);
      expect(runApprovals[0]?.runId).toBe(approval.runId);
      expect(sdk.getPendingApprovals('another-run')).toEqual([]);

      sdk.rejectAction(approval.id, 'test-user');
      await runPromise;
    });

    it('should cancel approvals when run is stopped', async () => {
      const sdk = setup();
      const { runPromise, approval } = await startRunNeedingApproval(sdk, 'approval-policy-4');

      await sdk.stopRun(approval.runId);

      expect(sdk.getPendingApprovals(approval.runId)).toHaveLength(0);
      expect((await runPromise).status).toBe('cancelled');
    });
  });

  describe('Event Logging', () => {
    it('should log approval.requested event', async () => {
      const sdk = setup();
      const { runPromise, approval } = await startRunNeedingApproval(sdk, 'approval-policy-5');

      const events = await sdk.getEvents(approval.runId);
      const requested = events.find((e) => e.type === 'approval.requested');
      expect(requested?.data?.approvalId).toBe(approval.id);

      sdk.rejectAction(approval.id, 'test-user');
      await runPromise;
    });

    it('should log approval.approved event when approved', async () => {
      const sdk = setup();
      const { runPromise, approval } = await startRunNeedingApproval(sdk, 'approval-policy-6');

      sdk.approveAction(approval.id, 'test-user', 'Approved');
      await runPromise;

      const events = await sdk.getEvents(approval.runId);
      const approved = events.find((e) => e.type === 'approval.approved');
      expect(approved?.data?.approvalId).toBe(approval.id);
    });

    it('should log approval.rejected event when rejected', async () => {
      const sdk = setup();
      const { runPromise, approval } = await startRunNeedingApproval(sdk, 'approval-policy-7');

      sdk.rejectAction(approval.id, 'test-user', 'Rejected');
      await runPromise;

      const events = await sdk.getEvents(approval.runId);
      const rejected = events.find((e) => e.type === 'approval.rejected');
      expect(rejected?.data?.approvalId).toBe(approval.id);
    });
  });
});
