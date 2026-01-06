import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSDK } from '../sdk.js';
import type { Policy } from '../types/policy.js';

describe('Approval Workflow', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ApprovalManager Integration', () => {
    it('should request approval when policy requires it', async () => {
      const sdk = createSDK({ apiKey: mockApiKey });

      // Define a policy that requires approval for a specific tool
      const approvalPolicy: Policy = {
        id: 'approval-policy-1',
        type: 'allowlist',
        scope: 'agent',
        enabled: true,
        rules: [
          {
            condition: 'allowedTools',
            action: 'require_approval',
            metadata: {
              tools: ['critical-tool'],
            },
          },
        ],
      };

      // Define a critical tool
      const criticalTool = sdk.defineTool({
        name: 'critical-tool',
        description: 'A critical tool that requires approval',
        handler: async () => ({ result: 'critical action executed' }),
      });

      // Create agent with approval policy
      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [criticalTool],
        policies: [approvalPolicy],
        maxSteps: 1,
      });

      // Mock the LLM to return a tool call intention
      const runPromise = agent.run({
        message: 'Use critical-tool',
      });

      // Wait a bit for the approval request to be created
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that there's a pending approval
      const pendingApprovals = sdk.getPendingApprovals();
      expect(pendingApprovals.length).toBeGreaterThan(0);

      const approval = pendingApprovals[0];
      expect(approval.policyId).toBe('approval-policy-1');

      // Approve the action
      sdk.approveAction(approval.id, 'test-user', 'Approved for testing');

      // Wait for the run to complete
      const result = await runPromise;
      expect(result.status).toBe('completed');
    });

    it('should reject action when approval is rejected', async () => {
      const sdk = createSDK({ apiKey: mockApiKey });

      const approvalPolicy: Policy = {
        id: 'approval-policy-2',
        type: 'allowlist',
        scope: 'agent',
        enabled: true,
        rules: [
          {
            condition: 'allowedTools',
            action: 'require_approval',
            metadata: {
              tools: ['critical-tool'],
            },
          },
        ],
      };

      const criticalTool = sdk.defineTool({
        name: 'critical-tool',
        description: 'A critical tool that requires approval',
        handler: async () => ({ result: 'critical action executed' }),
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [criticalTool],
        policies: [approvalPolicy],
        maxSteps: 1,
      });

      const runPromise = agent.run({
        message: 'Use critical-tool',
      });

      // Wait for approval request
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pendingApprovals = sdk.getPendingApprovals();
      expect(pendingApprovals.length).toBeGreaterThan(0);

      const approval = pendingApprovals[0];

      // Reject the action
      sdk.rejectAction(approval.id, 'test-user', 'Rejected for testing');

      // Wait for the run to fail
      const result = await runPromise;
      expect(result.status).toBe('failed');
    });

    it('should get pending approvals for a specific run', async () => {
      const sdk = createSDK({ apiKey: mockApiKey });

      const approvalPolicy: Policy = {
        id: 'approval-policy-3',
        type: 'allowlist',
        scope: 'agent',
        enabled: true,
        rules: [
          {
            condition: 'allowedTools',
            action: 'require_approval',
            metadata: {
              tools: ['critical-tool'],
            },
          },
        ],
      };

      const criticalTool = sdk.defineTool({
        name: 'critical-tool',
        description: 'A critical tool that requires approval',
        handler: async () => ({ result: 'critical action executed' }),
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [criticalTool],
        policies: [approvalPolicy],
        maxSteps: 1,
      });

      const runPromise = agent.run({
        message: 'Use critical-tool',
      });

      // Wait for approval request
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get approvals for the run
      const events = await sdk.getEvents((await runPromise).runId);
      const runId = events[0]?.runId;
      
      if (runId) {
        const runApprovals = sdk.getPendingApprovals(runId);
        expect(runApprovals.length).toBeGreaterThan(0);
        expect(runApprovals[0].runId).toBe(runId);
      }

      // Clean up
      sdk.rejectAction(sdk.getPendingApprovals()[0]?.id || '', 'test-user');
    });

    it('should cancel approvals when run is stopped', async () => {
      const sdk = createSDK({ apiKey: mockApiKey });

      const approvalPolicy: Policy = {
        id: 'approval-policy-4',
        type: 'allowlist',
        scope: 'agent',
        enabled: true,
        rules: [
          {
            condition: 'allowedTools',
            action: 'require_approval',
            metadata: {
              tools: ['critical-tool'],
            },
          },
        ],
      };

      const criticalTool = sdk.defineTool({
        name: 'critical-tool',
        description: 'A critical tool that requires approval',
        handler: async () => ({ result: 'critical action executed' }),
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [criticalTool],
        policies: [approvalPolicy],
        maxSteps: 1,
      });

      const runPromise = agent.run({
        message: 'Use critical-tool',
      });

      // Wait for approval request
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pendingApprovals = sdk.getPendingApprovals();
      expect(pendingApprovals.length).toBeGreaterThan(0);

      const runId = pendingApprovals[0].runId;

      // Stop the run
      await sdk.stopRun(runId);

      // Approvals should be cancelled
      const approvalsAfterStop = sdk.getPendingApprovals(runId);
      expect(approvalsAfterStop.length).toBe(0);
    });
  });

  describe('Event Logging', () => {
    it('should log approval.requested event', async () => {
      const sdk = createSDK({ apiKey: mockApiKey });

      const approvalPolicy: Policy = {
        id: 'approval-policy-5',
        type: 'allowlist',
        scope: 'agent',
        enabled: true,
        rules: [
          {
            condition: 'allowedTools',
            action: 'require_approval',
            metadata: {
              tools: ['critical-tool'],
            },
          },
        ],
      };

      const criticalTool = sdk.defineTool({
        name: 'critical-tool',
        description: 'A critical tool that requires approval',
        handler: async () => ({ result: 'critical action executed' }),
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [criticalTool],
        policies: [approvalPolicy],
        maxSteps: 1,
      });

      const runPromise = agent.run({
        message: 'Use critical-tool',
      });

      // Wait for approval request
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pendingApprovals = sdk.getPendingApprovals();
      const approvalId = pendingApprovals[0]?.id;

      if (approvalId) {
        const events = await sdk.getEvents(pendingApprovals[0].runId);
        const approvalRequestedEvent = events.find((e) => e.type === 'approval.requested');
        expect(approvalRequestedEvent).toBeDefined();
        expect(approvalRequestedEvent?.data?.approvalId).toBe(approvalId);
      }

      // Clean up
      if (approvalId) {
        sdk.rejectAction(approvalId, 'test-user');
      }
    });

    it('should log approval.approved event when approved', async () => {
      const sdk = createSDK({ apiKey: mockApiKey });

      const approvalPolicy: Policy = {
        id: 'approval-policy-6',
        type: 'allowlist',
        scope: 'agent',
        enabled: true,
        rules: [
          {
            condition: 'allowedTools',
            action: 'require_approval',
            metadata: {
              tools: ['critical-tool'],
            },
          },
        ],
      };

      const criticalTool = sdk.defineTool({
        name: 'critical-tool',
        description: 'A critical tool that requires approval',
        handler: async () => ({ result: 'critical action executed' }),
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [criticalTool],
        policies: [approvalPolicy],
        maxSteps: 1,
      });

      const runPromise = agent.run({
        message: 'Use critical-tool',
      });

      // Wait for approval request
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pendingApprovals = sdk.getPendingApprovals();
      const approvalId = pendingApprovals[0]?.id;
      const runId = pendingApprovals[0]?.runId;

      if (approvalId) {
        // Approve the action
        sdk.approveAction(approvalId, 'test-user', 'Approved');

        // Wait for completion
        await runPromise;

        const events = await sdk.getEvents(runId);
        const approvalApprovedEvent = events.find((e) => e.type === 'approval.approved');
        expect(approvalApprovedEvent).toBeDefined();
        expect(approvalApprovedEvent?.data?.approvalId).toBe(approvalId);
      }
    });

    it('should log approval.rejected event when rejected', async () => {
      const sdk = createSDK({ apiKey: mockApiKey });

      const approvalPolicy: Policy = {
        id: 'approval-policy-7',
        type: 'allowlist',
        scope: 'agent',
        enabled: true,
        rules: [
          {
            condition: 'allowedTools',
            action: 'require_approval',
            metadata: {
              tools: ['critical-tool'],
            },
          },
        ],
      };

      const criticalTool = sdk.defineTool({
        name: 'critical-tool',
        description: 'A critical tool that requires approval',
        handler: async () => ({ result: 'critical action executed' }),
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [criticalTool],
        policies: [approvalPolicy],
        maxSteps: 1,
      });

      const runPromise = agent.run({
        message: 'Use critical-tool',
      });

      // Wait for approval request
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pendingApprovals = sdk.getPendingApprovals();
      const approvalId = pendingApprovals[0]?.id;
      const runId = pendingApprovals[0]?.runId;

      if (approvalId) {
        // Reject the action
        sdk.rejectAction(approvalId, 'test-user', 'Rejected');

        // Wait for failure
        await runPromise;

        const events = await sdk.getEvents(runId);
        const approvalRejectedEvent = events.find((e) => e.type === 'approval.rejected');
        expect(approvalRejectedEvent).toBeDefined();
        expect(approvalRejectedEvent?.data?.approvalId).toBe(approvalId);
      }
    });
  });
});

