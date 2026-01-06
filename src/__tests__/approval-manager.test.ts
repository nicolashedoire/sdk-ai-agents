import { describe, it, expect, beforeEach } from 'vitest';
import { ApprovalManager } from '../managers/approval-manager.js';
import type { Intention } from '../types/run.js';

describe('ApprovalManager', () => {
  let manager: ApprovalManager;

  beforeEach(() => {
    manager = new ApprovalManager();
  });

  describe('requestApproval', () => {
    it('should create an approval request', async () => {
      const intention: Intention = {
        type: 'tool_call',
        toolName: 'critical-tool',
        parameters: { action: 'delete' },
      };

      const { approvalId, waitForApproval } = await manager.requestApproval(
        'run-1',
        'agent-1',
        intention,
        'policy-1'
      );

      expect(approvalId).toBeDefined();
      expect(typeof approvalId).toBe('string');

      const approval = manager.getApproval(approvalId);
      expect(approval).toBeDefined();
      expect(approval?.runId).toBe('run-1');
      expect(approval?.agentId).toBe('agent-1');
      expect(approval?.intention).toEqual(intention);
      expect(approval?.policyId).toBe('policy-1');
      expect(approval?.status).toBe('pending');
    });

    it('should return a promise that resolves when approved', async () => {
      const intention: Intention = {
        type: 'tool_call',
        toolName: 'critical-tool',
        parameters: {},
      };

      const { approvalId, waitForApproval } = await manager.requestApproval(
        'run-1',
        'agent-1',
        intention,
        'policy-1'
      );

      // Approve in the next tick
      setTimeout(() => {
        manager.approve(approvalId, 'user-1', 'Approved');
      }, 10);

      const approved = await waitForApproval;
      expect(approved).toBe(true);

      const approval = manager.getApproval(approvalId);
      expect(approval?.status).toBe('approved');
      expect(approval?.approvedBy).toBe('user-1');
    });

    it('should return a promise that resolves to false when rejected', async () => {
      const intention: Intention = {
        type: 'tool_call',
        toolName: 'critical-tool',
        parameters: {},
      };

      const { approvalId, waitForApproval } = await manager.requestApproval(
        'run-1',
        'agent-1',
        intention,
        'policy-1'
      );

      // Reject in the next tick
      setTimeout(() => {
        manager.reject(approvalId, 'user-1', 'Rejected');
      }, 10);

      const approved = await waitForApproval;
      expect(approved).toBe(false);

      const approval = manager.getApproval(approvalId);
      expect(approval?.status).toBe('rejected');
      expect(approval?.rejectedBy).toBe('user-1');
    });
  });

  describe('approve', () => {
    it('should approve a pending request', async () => {
      const intention: Intention = {
        type: 'tool_call',
        toolName: 'critical-tool',
        parameters: {},
      };

      const { approvalId } = await manager.requestApproval(
        'run-1',
        'agent-1',
        intention,
        'policy-1'
      );

      manager.approve(approvalId, 'user-1', 'Approved for testing');

      const approval = manager.getApproval(approvalId);
      expect(approval?.status).toBe('approved');
      expect(approval?.approvedBy).toBe('user-1');
      expect(approval?.reason).toBe('Approved for testing');
      expect(approval?.approvedAt).toBeDefined();
    });

    it('should throw error if approval not found', () => {
      expect(() => {
        manager.approve('non-existent-id', 'user-1');
      }).toThrow('Approval request non-existent-id not found');
    });

    it('should throw error if approval already decided', async () => {
      const intention: Intention = {
        type: 'tool_call',
        toolName: 'critical-tool',
        parameters: {},
      };

      const { approvalId } = await manager.requestApproval(
        'run-1',
        'agent-1',
        intention,
        'policy-1'
      );

      manager.approve(approvalId, 'user-1');

      expect(() => {
        manager.approve(approvalId, 'user-2');
      }).toThrow('Approval request');
    });
  });

  describe('reject', () => {
    it('should reject a pending request', async () => {
      const intention: Intention = {
        type: 'tool_call',
        toolName: 'critical-tool',
        parameters: {},
      };

      const { approvalId } = await manager.requestApproval(
        'run-1',
        'agent-1',
        intention,
        'policy-1'
      );

      manager.reject(approvalId, 'user-1', 'Rejected for testing');

      const approval = manager.getApproval(approvalId);
      expect(approval?.status).toBe('rejected');
      expect(approval?.rejectedBy).toBe('user-1');
      expect(approval?.reason).toBe('Rejected for testing');
      expect(approval?.rejectedAt).toBeDefined();
    });

    it('should throw error if rejection not found', () => {
      expect(() => {
        manager.reject('non-existent-id', 'user-1');
      }).toThrow('Approval request non-existent-id not found');
    });
  });

  describe('getPendingApprovalsForRun', () => {
    it('should return pending approvals for a specific run', async () => {
      const intention1: Intention = {
        type: 'tool_call',
        toolName: 'tool-1',
        parameters: {},
      };
      const intention2: Intention = {
        type: 'tool_call',
        toolName: 'tool-2',
        parameters: {},
      };

      await manager.requestApproval('run-1', 'agent-1', intention1, 'policy-1');
      await manager.requestApproval('run-1', 'agent-1', intention2, 'policy-1');
      await manager.requestApproval('run-2', 'agent-1', intention1, 'policy-1');

      const run1Approvals = manager.getPendingApprovalsForRun('run-1');
      expect(run1Approvals.length).toBe(2);
      expect(run1Approvals.every((a) => a.runId === 'run-1')).toBe(true);
      expect(run1Approvals.every((a) => a.status === 'pending')).toBe(true);
    });

    it('should return empty array if no pending approvals', () => {
      const approvals = manager.getPendingApprovalsForRun('run-1');
      expect(approvals.length).toBe(0);
    });
  });

  describe('getAllPendingApprovals', () => {
    it('should return all pending approvals', async () => {
      const intention1: Intention = {
        type: 'tool_call',
        toolName: 'tool-1',
        parameters: {},
      };
      const intention2: Intention = {
        type: 'tool_call',
        toolName: 'tool-2',
        parameters: {},
      };

      await manager.requestApproval('run-1', 'agent-1', intention1, 'policy-1');
      await manager.requestApproval('run-2', 'agent-1', intention2, 'policy-1');

      const allApprovals = manager.getAllPendingApprovals();
      expect(allApprovals.length).toBe(2);
    });

    it('should not return approved or rejected approvals', async () => {
      const intention: Intention = {
        type: 'tool_call',
        toolName: 'tool-1',
        parameters: {},
      };

      const { approvalId } = await manager.requestApproval(
        'run-1',
        'agent-1',
        intention,
        'policy-1'
      );

      manager.approve(approvalId, 'user-1');

      const pendingApprovals = manager.getAllPendingApprovals();
      expect(pendingApprovals.length).toBe(0);
    });
  });

  describe('cancel', () => {
    it('should cancel a pending approval', async () => {
      const intention: Intention = {
        type: 'tool_call',
        toolName: 'critical-tool',
        parameters: {},
      };

      const { approvalId, waitForApproval } = await manager.requestApproval(
        'run-1',
        'agent-1',
        intention,
        'policy-1'
      );

      manager.cancel(approvalId);

      const approval = manager.getApproval(approvalId);
      expect(approval?.status).toBe('rejected');
      expect(approval?.reason).toBe('Cancelled');

      await expect(waitForApproval).rejects.toThrow('Approval request cancelled');
    });
  });

  describe('cancelAllForRun', () => {
    it('should cancel all pending approvals for a run', async () => {
      const intention1: Intention = {
        type: 'tool_call',
        toolName: 'tool-1',
        parameters: {},
      };
      const intention2: Intention = {
        type: 'tool_call',
        toolName: 'tool-2',
        parameters: {},
      };

      await manager.requestApproval('run-1', 'agent-1', intention1, 'policy-1');
      await manager.requestApproval('run-1', 'agent-1', intention2, 'policy-1');
      await manager.requestApproval('run-2', 'agent-1', intention1, 'policy-1');

      manager.cancelAllForRun('run-1');

      const run1Approvals = manager.getPendingApprovalsForRun('run-1');
      expect(run1Approvals.length).toBe(0);

      const run2Approvals = manager.getPendingApprovalsForRun('run-2');
      expect(run2Approvals.length).toBe(1);
    });
  });
});

